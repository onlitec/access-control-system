import { PrismaClient } from '@prisma/client';
import {
  NiceGuaritaProtocol,
  DEVICE_TYPES,
  type DeviceFrame,
  type EnrollResult,
  type GuaritaEvent,
} from './NiceGuaritaProtocol';
import { emitEvent } from './EventBusService';

// Importação lazy para evitar dependência circular com routes
let _broadcastFn: ((alert: any) => void) | null = null;
export function setPassbackBroadcast(fn: (alert: any) => void) {
    _broadcastFn = fn;
}

// Dedupe de rajadas: mesmo serial em <5s é ignorado (controle pressionado repetidamente)
const _recentSerials = new Map<string, number>();
function isDuplicateBurst(serial: string, at: Date): boolean {
    const now = at.getTime();
    const last = _recentSerials.get(serial);
    _recentSerials.set(serial, now);
    if (_recentSerials.size > 500) {
        for (const [s, ts] of _recentSerials) {
            if (now - ts > 60_000) _recentSerials.delete(s);
        }
    }
    return last !== undefined && now - last < 5_000;
}

// Cache de configurações APB (TTL 30s) para evitar N+1 queries por evento
let _apbCache: { enabled: boolean; ts: number } | null = null;
async function isAntiPassbackEnabled(prisma: PrismaClient): Promise<boolean> {
    const now = Date.now();
    if (_apbCache && now - _apbCache.ts < 30_000) return _apbCache.enabled;
    const settings = await prisma.condominiumSettings.findUnique({ where: { id: 'singleton' } });
    _apbCache = { enabled: settings?.antiPassbackEnabled ?? false, ts: now };
    return _apbCache.enabled;
}

const prisma = new PrismaClient();

export type GateStatus = 'open' | 'closed' | 'unknown';

// Sentinel for features blocked until hardware is connected
export class ServiceUnavailableError extends Error {
  readonly code = 'SDK_UNAVAILABLE';
  constructor(feature: string) {
    super(`Nice Guarita IP: funcionalidade "${feature}" indisponível. Verifique conexão com o módulo.`);
  }
}

interface GuaritaDeviceRow {
  id: string;
  name: string;
  ip: string;
  port: number;
  location: string | null;
  enabled: boolean;
  sdkConfig: Record<string, unknown> | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// NICE GUARITA IP — SERVICE
// All methods now have real protocol implementations.
// ─────────────────────────────────────────────────────────────────────────────
export class NiceGuaritaService {

  // ── Device Registry (DB) ──────────────────────────────────────────────────

  static async listDevices(): Promise<GuaritaDeviceRow[]> {
    return prisma.guaritaDevice.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, ip: true, port: true, location: true, enabled: true, sdkConfig: true, createdAt: true },
    }) as Promise<GuaritaDeviceRow[]>;
  }

  static async getDevice(deviceId: string): Promise<GuaritaDeviceRow> {
    const device = await prisma.guaritaDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error(`Dispositivo Guarita ${deviceId} não encontrado`);
    return device as GuaritaDeviceRow;
  }

  // ── Connectivity ──────────────────────────────────────────────────────────

  static async pingDevice(deviceId: string): Promise<{ online: boolean; deviceCount?: number; clock?: Date | null }> {
    const device = await this.getDevice(deviceId);
    const online = await NiceGuaritaProtocol.ping(device.ip, device.port);
    if (!online) return { online: false };
    const [deviceCount, clock] = await Promise.all([
      NiceGuaritaProtocol.readDeviceCount(device.ip, device.port),
      NiceGuaritaProtocol.readClock(device.ip, device.port),
    ]);
    return { online: true, deviceCount, clock };
  }

  /**
   * Scans a subnet for Nice Guarita MG3000 modules using TCP ping.
   * @param subnet e.g. "192.168.1"
   * @param port e.g. 80
   * @returns array of discovered IP addresses and details
   */
  static async scanNetwork(subnet: string, port: number = 80): Promise<Array<{ ip: string; deviceCount: number; clock: Date | null }>> {
    const discovered: Array<{ ip: string; deviceCount: number; clock: Date | null }> = [];
    const baseIp = subnet.endsWith('.') ? subnet.slice(0, -1) : subnet;
    const parts = baseIp.split('.');
    
    // We only support /24 subnet scans for simplicity (e.g. 192.168.1)
    let networkPrefix = baseIp;
    if (parts.length === 4) {
      networkPrefix = parts.slice(0, 3).join('.');
    } else if (parts.length !== 3) {
      throw new Error('Formato de sub-rede inválido. Use algo como "192.168.1"');
    }

    const batchSize = 30; // Scan in batches to avoid maxing out connections
    for (let i = 1; i < 255; i += batchSize) {
      const promises = [];
      for (let j = 0; j < batchSize && (i + j) < 255; j++) {
        const ip = `${networkPrefix}.${i + j}`;
        promises.push(
          (async () => {
            const online = await NiceGuaritaProtocol.ping(ip, port, 1000); // lower timeout for scan
            if (online) {
              const [deviceCount, clock] = await Promise.all([
                NiceGuaritaProtocol.readDeviceCount(ip, port),
                NiceGuaritaProtocol.readClock(ip, port),
              ]);
              discovered.push({ ip, deviceCount, clock });
            }
          })()
        );
      }
      await Promise.all(promises);
    }
    
    return discovered;
  }

  // ── Gate Control ──────────────────────────────────────────────────────────

  /**
   * Open gate/barrier — sends Cmd 13 (trigger relay) to the Guarita module.
   * Uses sdkConfig.deviceType and sdkConfig.deviceNum if set; defaults to broadcast (0xFF).
   */
  static async openGate(deviceId: string): Promise<void> {
    const device = await this.getDevice(deviceId);
    if (!device.enabled) throw new Error(`Dispositivo ${device.name} está desabilitado`);
    const cfg = (device.sdkConfig ?? {}) as Record<string, number>;
    await NiceGuaritaProtocol.triggerOutput(
      device.ip,
      device.port,
      cfg.deviceType ?? 0xFF,
      cfg.deviceNum ?? 0xFF,
      cfg.relayOutput ?? 0x04,
      true
    );
  }

  /**
   * Close gate — same command, different relay output (if wired separately).
   * Most installations use the same relay to toggle, so we re-trigger.
   */
  static async closeGate(deviceId: string): Promise<void> {
    const device = await this.getDevice(deviceId);
    if (!device.enabled) throw new Error(`Dispositivo ${device.name} está desabilitado`);
    const cfg = (device.sdkConfig ?? {}) as Record<string, number>;
    await NiceGuaritaProtocol.triggerOutput(
      device.ip,
      device.port,
      cfg.deviceType ?? 0xFF,
      cfg.deviceNum ?? 0xFF,
      cfg.relayClose ?? cfg.relayOutput ?? 0x04,
      true
    );
  }

  static async getGateStatus(_deviceId: string): Promise<GateStatus> {
    // MG3000 does not report gate status via polling; status is event-driven (Cmd 4).
    // Return 'unknown' — UI should rely on access events instead.
    return 'unknown';
  }

  // ── Identidade p/ o módulo ────────────────────────────────────────────────

  /**
   * Converte os dados do morador para o formato aceito pelo MG3000:
   * identificação ASCII de até 18 chars (maiúsculas, sem acento), unidade
   * numérica e bloco no código do módulo (A-Z = 0x00-0x19; 1-230 = 0x1A+).
   */
  static buildModuleIdentity(person: {
    firstName: string; lastName: string;
    unit_number?: string | null; block?: string | null;
  }): { name: string; unit?: number; block?: number } {
    const fullName = `${person.firstName} ${person.lastName}`.trim();
    const name = fullName
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
      .toUpperCase()
      .replace(/[^\x20-\x7E]/g, '')                     // só ASCII imprimível
      .substring(0, 18);

    let unit: number | undefined;
    if (person.unit_number) {
      const n = parseInt(person.unit_number.replace(/\D/g, ''), 10);
      if (Number.isFinite(n) && n > 0 && n <= 9999) unit = n;
    }

    let block: number | undefined;
    if (person.block) {
      const raw = person.block.trim().toUpperCase();
      if (/^[A-Z]$/.test(raw)) {
        block = raw.charCodeAt(0) - 65; // A=0x00 ... Z=0x19
      } else {
        const n = parseInt(raw.replace(/\D/g, ''), 10);
        if (Number.isFinite(n) && n >= 1 && n <= 230) block = 0x19 + n; // 1=0x1A ...
      }
    }

    return { name, unit, block };
  }

  // ── Serials recentes (captura pelo acionamento) ───────────────────────────

  private static recentSerials: Array<{
    serial: string; deviceKind: string; dateTime: Date; knownPerson: string | null;
  }> = [];

  static getRecentSerials() {
    return [...this.recentSerials].reverse(); // mais novo primeiro
  }

  private static pushRecentSerial(entry: { serial: string; deviceKind: string; dateTime: Date; knownPerson: string | null }) {
    this.recentSerials.push(entry);
    if (this.recentSerials.length > 20) this.recentSerials.shift();
  }

  /** Acionamento de dispositivo NÃO cadastrado (Cmd 42/46 do módulo) - só
   *  alimenta o buffer de captura; não gera evento de acesso. */
  static noteUnregisteredDevice(event: { serial: string; deviceKind: string; dateTime: Date }) {
    console.log(`[NiceGuarita] Dispositivo não cadastrado acionado: serial=${event.serial} tipo=${event.deviceKind}`);
    this.pushRecentSerial({ ...event, knownPerson: null });
  }

  // ── Device Enrollment ─────────────────────────────────────────────────────

  /**
   * Enroll a card/tag/password into the Guarita memory for a resident.
   * Automatically runs Cmd 29 (updateReceivers) after successful enrollment.
   */
  static async enrollResident(
    guardDeviceId: string,
    resident: {
      serial: string;          // hex string, e.g. "A1B2C3"
      deviceType?: number;     // DEVICE_TYPES constant
      unit?: number;
      block?: number;
      name?: string;
      vehiclePlate?: string;
      receiverBitmask?: number;
    }
  ): Promise<EnrollResult & { receiversUpdated: boolean }> {
    const device = await this.getDevice(guardDeviceId);
    if (!device.enabled) throw new Error(`Dispositivo ${device.name} está desabilitado`);

    const serialNum = parseInt(resident.serial.replace(/\s/g, ''), 16);
    if (isNaN(serialNum) || serialNum === 0) {
      return { success: false, message: 'Serial inválido', receiversUpdated: false };
    }

    const frame: DeviceFrame = {
      deviceType: resident.deviceType ?? DEVICE_TYPES.CARD,
      serial: serialNum,
      unit: resident.unit,
      block: resident.block,
      identification: resident.name?.substring(0, 18),
      vehiclePlate: resident.vehiclePlate,
      vehicleBrand: resident.vehiclePlate ? 0x00 : 0x1F,
      receiverBitmask: resident.receiverBitmask ?? 0xFF,
    };

    const result = await NiceGuaritaProtocol.enrollDevice(device.ip, device.port, frame);

    let receiversUpdated = false;
    if (result.success) {
      const syncResult = await NiceGuaritaProtocol.updateReceivers(device.ip, device.port);
      receiversUpdated = syncResult.success;
    }

    return { ...result, receiversUpdated };
  }

  /**
   * Remove a device from the Guarita memory.
   * Automatically runs Cmd 29 after deletion.
   */
  static async unenrollResident(
    guardDeviceId: string,
    serial: string,
    deviceType: number = DEVICE_TYPES.CARD
  ): Promise<{ success: boolean; message: string; receiversUpdated: boolean }> {
    const device = await this.getDevice(guardDeviceId);
    if (!device.enabled) throw new Error(`Dispositivo ${device.name} está desabilitado`);

    const serialNum = parseInt(serial.replace(/\s/g, ''), 16);
    if (isNaN(serialNum) || serialNum === 0) {
      return { success: false, message: 'Serial inválido', receiversUpdated: false };
    }

    const result = await NiceGuaritaProtocol.deleteDevice(device.ip, device.port, deviceType, serialNum);

    let receiversUpdated = false;
    if (result.success) {
      const syncResult = await NiceGuaritaProtocol.updateReceivers(device.ip, device.port);
      receiversUpdated = syncResult.success;
    }

    return { ...result, receiversUpdated };
  }

  /**
   * Imports all devices from the Guarita memory and creates Residents (Persons) in the database.
   */
  static async importResidents(guardDeviceId: string): Promise<{ imported: number, total: number }> {
    let device;
    if (guardDeviceId === 'default') {
      device = await prisma.guaritaDevice.findFirst({ where: { enabled: true } });
      if (!device) throw new Error('Nenhum dispositivo Guarita IP habilitado foi encontrado.');
    } else {
      device = await this.getDevice(guardDeviceId);
    }
    
    if (!device.enabled) throw new Error(`Dispositivo ${device.name} está desabilitado`);

    const count = await NiceGuaritaProtocol.readDeviceCount(device.ip, device.port);
    if (count === 0) return { imported: 0, total: 0 };

    const devices = await NiceGuaritaProtocol.readAllDevices(device.ip, device.port, count);
    
    let imported = 0;
    for (const d of devices) {
      if (!d.identification || !d.serial) continue;

      // MG3000 Device Type mapping to Prisma fields
      const isCard = d.deviceType === DEVICE_TYPES.CARD;
      const isControl = d.deviceType === DEVICE_TYPES.CONTROL;
      if (!isCard && !isControl) continue; // Skip biometric/passwords for now unless needed

      const serialHex = d.serial.toString(16).toUpperCase();

      const parts = d.identification.trim().split(' ');
      const firstName = parts[0] || 'Desconhecido';
      const lastName = parts.slice(1).join(' ') || '';

      // Check if already exists by Serial OR by Name+Unit
      let existing = await prisma.person.findFirst({
        where: {
          OR: [
            { cardSerial: serialHex },
            { txSerial: serialHex }
          ]
        }
      });

      if (!existing) {
        existing = await prisma.person.findFirst({
          where: {
            firstName,
            lastName,
            unit_number: d.unit ? d.unit.toString() : null,
            block: d.block ? d.block.toString() : null  // ✓ FIX: block field, not tower
          }
        });
      }

      if (!existing) {
        // Create new Resident
        await prisma.person.create({
          data: {
            firstName,
            lastName,
            unit_number: d.unit ? d.unit.toString() : null,
            block: d.block ? d.block.toString() : null,  // ✓ FIX: block field, not tower
            cardSerial: isCard ? serialHex : null,
            txSerial: isControl ? serialHex : null,
            orgIndexCode: '7', // default for Residents
            is_owner: true
          }
        });
        imported++;
      } else {
        // Smart Merge: Update only the tags/controls, preserving local data (Photos, etc)
        const updateData: any = {};
        if (isCard && existing.cardSerial !== serialHex) updateData.cardSerial = serialHex;
        if (isControl && existing.txSerial !== serialHex) updateData.txSerial = serialHex;

        // Optionally update unit/block if missing locally
        if (!existing.unit_number && d.unit) updateData.unit_number = d.unit.toString();
        if (!existing.block && d.block) updateData.block = d.block.toString();  // ✓ FIX: block field, not tower

        if (Object.keys(updateData).length > 0) {
          await prisma.person.update({
            where: { id: existing.id },
            data: updateData
          });
          imported++;
        }
      }
    }

    return { imported, total: count };
  }

  // ── Clock Sync ────────────────────────────────────────────────────────────

  static async syncClock(deviceId: string): Promise<{ success: boolean; guardaClock?: Date | null }> {
    const device = await this.getDevice(deviceId);
    try {
      await NiceGuaritaProtocol.writeClock(device.ip, device.port);
      const guardaClock = await NiceGuaritaProtocol.readClock(device.ip, device.port);
      return { success: true, guardaClock };
    } catch (err: any) {
      return { success: false };
    }
  }

  // ── Access Event Handler ──────────────────────────────────────────────────

  /**
   * Handle an incoming push event (Cmd 4) from the MG3000.
   * Persists to AccessLog and returns the structured event.
   */
  static async handleAccessEvent(event: GuaritaEvent): Promise<void> {
    console.log(`[NiceGuarita] Access event: type=${event.type} serial=${event.serial} at ${event.dateTime.toISOString()} device=${event.deviceKind} sourceIp=${event.sourceIp ?? 'unknown'}`);

    try {
      // ── 0. Dedupe de rajadas (mesmo serial em <5s) ─────────────────────────
      if (isDuplicateBurst(event.serial, event.dateTime)) {
        console.log(`[NiceGuarita] Evento duplicado ignorado (rajada): serial=${event.serial}`);
        return;
      }

      // ── 1. Correlacionar dispositivo pela IP de origem ─────────────────────
      const device = event.sourceIp
        ? await prisma.guaritaDevice.findFirst({ where: { ip: event.sourceIp } })
        : null;
      const direction = (device?.sdkConfig as Record<string, unknown> | null)?.direction as string ?? 'both';

      // ── 2. Lookup morador pelo serial do cartão/TAG/controle ───────────────
      const person = await prisma.person.findFirst({
        where: {
          OR: [
            { cardSerial: event.serial },
            { txSerial: event.serial },
            { hikPersonId: event.serial },
            { externalId: event.serial },
          ],
        },
      });

      // Buffer de serials recentes: alimenta a captura de serial na UI
      // (operador aperta o botão do controle e o serial aparece pra vincular).
      this.pushRecentSerial({
        serial: event.serial,
        deviceKind: event.deviceKind,
        dateTime: event.dateTime,
        knownPerson: person ? `${person.firstName} ${person.lastName}`.trim() : null,
      });

      // ── 3. Anti-Passagem Dupla ─────────────────────────────────────────────
      if (person && direction === 'entry') {
        const apbEnabled = await isAntiPassbackEnabled(prisma);
        if (apbEnabled) {
          const state = await prisma.guaritaPassbackState.findUnique({ where: { personId: person.id } });

          if (state?.direction === 'IN') {
            // VIOLAÇÃO: morador tenta entrar sem ter saído
            const alert = await prisma.guaritaPassbackAlert.create({
              data: {
                personId: person.id,
                personName: `${person.firstName} ${person.lastName}`.trim(),
                serial: event.serial,
                deviceId: device?.id ?? null,
                deviceName: device?.name ?? null,
                unit: person.unit_number ?? null,
                photoUrl: person.photoUrl ?? null,
                occurredAt: event.dateTime,
              },
            });
            console.warn(`[APB] Violação: ${person.firstName} ${person.lastName} tentou entrar sem registrar saída. Alert ID=${alert.id}`);
            _broadcastFn?.(alert);
            await emitEvent({
              occurredAt: event.dateTime,
              personName: `${person.firstName} ${person.lastName}`.trim(),
              personType: 'resident',
              personId: person.id,
              unit: person.unit_number ?? null,
              deviceName: device?.name ?? 'Guarita IP',
              status: 'denied',
              photoUrl: person.photoUrl ?? null,
              notes: 'Anti-passback: entrada bloqueada sem registro de saída',
              direction: 'in',
              category: 'access',
              source: 'controle_rf',
              metadata: { serial: event.serial, deviceKind: event.deviceKind, deviceId: device?.id ?? null, passbackAlertId: alert.id },
            }).catch(e => console.error('[NiceGuarita] Falha ao emitir evento APB:', e.message));
            return; // Bloquear: não atualiza estado, não concede acesso
          }

          // Registrar entrada: atualizar estado para IN
          await prisma.guaritaPassbackState.upsert({
            where: { personId: person.id },
            create: { personId: person.id, serial: event.serial, direction: 'IN', deviceId: device?.id ?? null, occurredAt: event.dateTime },
            update: { serial: event.serial, direction: 'IN', deviceId: device?.id ?? null, occurredAt: event.dateTime },
          });
          console.log(`[APB] Entrada registrada: ${person.firstName} ${person.lastName} — estado: IN`);
        }
      }

      if (person && direction === 'exit') {
        // Registrar saída: atualizar estado para OUT
        await prisma.guaritaPassbackState.upsert({
          where: { personId: person.id },
          create: { personId: person.id, serial: event.serial, direction: 'OUT', deviceId: device?.id ?? null, occurredAt: event.dateTime },
          update: { serial: event.serial, direction: 'OUT', deviceId: device?.id ?? null, occurredAt: event.dateTime },
        });
        console.log(`[APB] Saída registrada: ${person.firstName} ${person.lastName} — estado: OUT`);
      }

      // ── 4. Persistir na Central de Eventos (com broadcast SSE) ────────────
      const eventDirection = direction === 'entry' ? 'in' : direction === 'exit' ? 'out' : null;
      const source = event.deviceKind?.toUpperCase().includes('CONTROL') ? 'controle_rf' : 'guarita';
      const baseMetadata = {
        serial: event.serial,
        deviceKind: event.deviceKind,
        deviceId: device?.id ?? null,
        guaritaEventType: event.type,
      };

      const ALARM_TYPES = new Set(['panic', 'clone_attempt']);
      const ACCESS_TYPES = new Set(['access_granted', 'device_triggered', 'remote_pc_trigger', 'intercom_triggered']);

      if (ALARM_TYPES.has(event.type)) {
        await emitEvent({
          occurredAt: event.dateTime,
          personName: event.type === 'panic' ? 'Botão de pânico acionado' : 'Tentativa de clonagem detectada',
          personType: 'system',
          personId: person?.id ?? null,
          unit: person?.unit_number ?? null,
          deviceName: device?.name ?? 'Guarita IP',
          status: 'denied',
          photoUrl: person?.photoUrl ?? null,
          notes: person ? `Serial de ${person.firstName} ${person.lastName}`.trim() : `Serial ${event.serial}`,
          category: 'alarm',
          source,
          metadata: baseMetadata,
        });
      } else if (ACCESS_TYPES.has(event.type)) {
        if (person) {
          await emitEvent({
            occurredAt: event.dateTime,
            personName: `${person.firstName} ${person.lastName}`.trim(),
            personType: 'resident',
            personId: person.id,
            unit: person.unit_number ?? null,
            deviceName: device?.name ?? 'Guarita IP',
            status: 'authorized',
            photoUrl: person.photoUrl ?? null,
            direction: eventDirection,
            category: 'access',
            source,
            metadata: baseMetadata,
          });
        } else {
          // Serial desconhecido: acesso negado — controle não cadastrado
          await emitEvent({
            occurredAt: event.dateTime,
            personName: 'Controle não cadastrado',
            personType: 'system',
            deviceName: device?.name ?? 'Guarita IP',
            status: 'denied',
            notes: `Serial ${event.serial}`,
            direction: eventDirection,
            category: 'access',
            source,
            metadata: baseMetadata,
          });
        }
      } else {
        // Demais tipos (doorbell, programming_changed etc.): apenas log
        console.log(`[NiceGuarita] Event: ${event.type} serial=${event.serial} person=${person?.id ?? 'unknown'} dir=${direction}`);
      }
    } catch (err: any) {
      console.error('[NiceGuarita] Error handling access event:', err.message);
    }
  }

  static isSdkAvailable(): boolean {
    return true; // Protocol layer is now implemented
  }
}
