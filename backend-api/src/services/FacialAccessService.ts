import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import fetch from 'node-fetch';
import { digestFetch } from '../utils/digest-fetch.utils';

const prisma = new PrismaClient();

/**
 * Terminais faciais standalone (DS-K1T673) e controladoras (DS-K2812) Hikvision,
 * via ISAPI (HTTP + Digest MD5) — sem depender de HikCentral. Ver
 * docs/LEITORES-FACIAIS/PLANO-INTEGRACAO-LEITORES-FACIAIS.md.
 *
 * Endpoints validados em 2026-07-11 contra um DS-K1T673DX-BR real (fw V3.18.0):
 *  - GET  /ISAPI/System/deviceInfo                          (ping)
 *  - PUT  /ISAPI/AccessControl/UserInfo/SetUp?format=json   (upsert de pessoa)
 *  - PUT  /ISAPI/AccessControl/UserInfo/Delete?format=json
 *  - POST /ISAPI/AccessControl/UserInfo/Search?format=json
 *  - POST /ISAPI/Intelligent/FDLib/FaceDataRecord?format=json (multipart: JSON + jpg)
 *  - PUT  /ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=1&faceLibType=blackFD
 *  - POST /ISAPI/AccessControl/AcsEvent?format=json          (histórico paginado)
 *  - PUT  /ISAPI/AccessControl/RemoteControl/door/{doorNo}   (open/close/alwaysOpen/alwaysClose)
 *  - GET  /ISAPI/Event/notification/alertStream              (eventos em tempo real — ver FacialAccessEventWatcher)
 */

export interface FacialDeviceRow {
  id: string;
  name: string;
  ip: string;
  port: number;
  username: string;
  password: string;
  enabled: boolean;
}

export interface PersonSyncResult {
  personId: string;
  personName: string;
  cardNo: string | null;
  action: 'enrolled' | 'removed' | 'skipped' | 'error';
  faceStatus: 'synced' | 'no_photo' | 'modeling_failed' | 'error' | 'removed' | null;
  detail?: string;
}

/** Mapeamento curado de eventos ACS (major 5) → feed. Minors fora daqui são ignorados. */
export const FACIAL_ACCESS_MINORS: Record<number, { label: string; status: 'authorized' | 'denied' }> = {
  1:  { label: 'Cartão válido', status: 'authorized' },
  38: { label: 'Digital reconhecida', status: 'authorized' },
  39: { label: 'Digital não reconhecida', status: 'denied' },
  75: { label: 'Reconhecimento facial', status: 'authorized' },
  76: { label: 'Face não reconhecida', status: 'denied' },
};

export class FacialAccessService {
  // ── HTTP/ISAPI ────────────────────────────────────────────────────────────

  static async testConnection(ip: string, port: number, username: string, password: string): Promise<boolean> {
    try {
      const url = `http://${ip}:${port}/ISAPI/System/deviceInfo`;
      const response = await digestFetch(url, username, password);
      // 200 = auth OK, 401 = alcançável mas credencial errada — ambos indicam que o equipamento está lá
      return response.ok || response.status === 401;
    } catch {
      return false;
    }
  }

  private static async isapiJson(
    device: FacialDeviceRow,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<any> {
    const url = `http://${device.ip}:${device.port}${path}`;
    const res = await digestFetch(
      url, device.username, device.password, method,
      body !== undefined ? JSON.stringify(body) : undefined,
      body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      { timeoutMs: 15000 },
    );
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* respostas XML de erro caem aqui */ }
    if (!res.ok) {
      throw new Error(`ISAPI ${method} ${path} → HTTP ${res.status}: ${json?.errorMsg ?? json?.statusString ?? text.slice(0, 200)}`);
    }
    return json;
  }

  static async listDevices() {
    return prisma.facialAccessDevice.findMany({
      include: { doors: { include: { readers: true }, orderBy: { doorNo: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  private static async getDevice(deviceId: string): Promise<FacialDeviceRow> {
    const device = await prisma.facialAccessDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Dispositivo facial não encontrado');
    return device;
  }

  // ── Identificador da pessoa no equipamento (employeeNo) ──────────────────

  /**
   * Garante um `facialAccessCardNo` (employeeNo numérico, o mesmo em todos os
   * equipamentos) para a pessoa — gera sequencial a partir de 100.
   */
  static async ensureCardNo(personId: string): Promise<string> {
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { facialAccessCardNo: true },
    });
    if (!person) throw new Error('Morador não encontrado');
    if (person.facialAccessCardNo) return person.facialAccessCardNo;

    const all = await prisma.person.findMany({
      where: { facialAccessCardNo: { not: null } },
      select: { facialAccessCardNo: true },
    });
    let max = 99;
    for (const p of all) {
      const n = Number(p.facialAccessCardNo);
      if (Number.isFinite(n) && n > max) max = n;
    }
    const cardNo = String(max + 1);
    await prisma.person.update({ where: { id: personId }, data: { facialAccessCardNo: cardNo } });
    return cardNo;
  }

  // ── Nível de acesso: quais portas deste equipamento a pessoa pode usar ───

  /** doorNos deste equipamento liberados pelas áreas de acesso da pessoa. */
  static async entitledDoorNos(personId: string, deviceId: string): Promise<number[]> {
    const links = await prisma.residentAccessArea.findMany({
      where: { personId },
      select: {
        area: {
          select: { doors: { select: { door: { select: { deviceId: true, doorNo: true } } } } },
        },
      },
    });
    const doorNos = new Set<number>();
    for (const l of links) {
      for (const ad of l.area.doors) {
        if (ad.door.deviceId === deviceId) doorNos.add(ad.door.doorNo);
      }
    }
    return [...doorNos].sort((a, b) => a - b);
  }

  // ── Cadastro de pessoa + face no equipamento ──────────────────────────────

  /** Upsert da pessoa no equipamento com as portas liberadas (UserInfo/SetUp). */
  private static async setUpUser(device: FacialDeviceRow, cardNo: string, name: string, doorNos: number[]): Promise<void> {
    await this.isapiJson(device, 'PUT', '/ISAPI/AccessControl/UserInfo/SetUp?format=json', {
      UserInfo: {
        employeeNo: cardNo,
        name: name.slice(0, 128) || `Morador ${cardNo}`,
        userType: 'normal',
        Valid: {
          enable: true,
          beginTime: '2000-01-01T00:00:00',
          endTime: '2037-12-31T23:59:59',
          timeType: 'local',
        },
        doorRight: doorNos.join(','),
        RightPlan: doorNos.map((doorNo) => ({ doorNo, planTemplateNo: '1' })), // template 1 = sempre liberado
      },
    });
  }

  /** Carrega a foto da pessoa como Buffer jpg/png (data URL, http(s) ou base64 puro). */
  private static async loadPhoto(photoUrl: string): Promise<Buffer> {
    if (photoUrl.startsWith('data:')) {
      return Buffer.from(photoUrl.split(',')[1] || '', 'base64');
    }
    if (/^https?:\/\//i.test(photoUrl)) {
      const res = await fetch(photoUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`Foto inacessível (HTTP ${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    }
    return Buffer.from(photoUrl, 'base64');
  }

  /**
   * Envia a foto ao FDLib do equipamento (substitui a face anterior, se houver).
   * Lança erro com mensagem clara quando o firmware não detecta rosto na foto.
   */
  static async enrollFace(device: FacialDeviceRow, cardNo: string, photoUrl: string): Promise<void> {
    const img = await this.loadPhoto(photoUrl);

    // Remove a face anterior (idempotente — OK mesmo quando não existe)
    await this.isapiJson(device, 'PUT', '/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=1&faceLibType=blackFD', {
      FPID: [{ value: cardNo }],
    }).catch(() => { /* best-effort */ });

    const boundary = '----OnliAcesso' + randomBytes(8).toString('hex');
    const meta = JSON.stringify({ faceLibType: 'blackFD', FDID: '1', FPID: cardNo });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\n` +
        `Content-Type: application/json\r\n\r\n${meta}\r\n`,
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="img"; filename="face.jpg"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n`,
      ),
      img,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const url = `http://${device.ip}:${device.port}/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json`;
    const res = await digestFetch(url, device.username, device.password, 'POST', body, {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    }, { timeoutMs: 30000 });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }

    if (json?.statusCode === 1) return;
    if (json?.subStatusCode === 'SubpicAnalysisModelingError') {
      throw new Error('O equipamento não detectou um rosto utilizável na foto — use uma foto frontal, com o rosto ocupando boa parte do quadro');
    }
    throw new Error(`Falha ao enviar face: ${json?.errorMsg ?? json?.statusString ?? `HTTP ${res.status}`}`);
  }

  /** Remove pessoa (e face vinculada) do equipamento. */
  static async deletePersonFromDevice(device: FacialDeviceRow, cardNo: string): Promise<void> {
    await this.isapiJson(device, 'PUT', '/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=1&faceLibType=blackFD', {
      FPID: [{ value: cardNo }],
    }).catch(() => { /* pode não ter face */ });
    await this.isapiJson(device, 'PUT', '/ISAPI/AccessControl/UserInfo/Delete?format=json', {
      UserInfoDelCond: { EmployeeNoList: [{ employeeNo: cardNo }] },
    });
  }

  // ── Sincronização (pessoa → equipamentos) ─────────────────────────────────

  // Serializa syncs concorrentes da mesma pessoa no mesmo equipamento — sem
  // isso, o delete-então-envia da face corre em paralelo (ex.: hook de áreas +
  // sync explícito) e a pessoa acaba com faces duplicadas no equipamento.
  private static syncChains = new Map<string, Promise<unknown>>();
  private static serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.syncChains.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.syncChains.set(key, next.then(() => undefined, () => undefined));
    return next;
  }

  /**
   * Sincroniza UMA pessoa com UM equipamento: cadastra/atualiza (com as portas
   * liberadas pelas áreas dela) ou remove quando ela não tem porta nenhuma lá.
   */
  static syncPersonToDevice(deviceId: string, personId: string): Promise<PersonSyncResult> {
    return this.serialize(`${deviceId}:${personId}`, () => this.syncPersonToDeviceUnlocked(deviceId, personId));
  }

  private static async syncPersonToDeviceUnlocked(deviceId: string, personId: string): Promise<PersonSyncResult> {
    const device = await this.getDevice(deviceId);
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, firstName: true, lastName: true, photoUrl: true, facialAccessCardNo: true },
    });
    if (!person) throw new Error('Morador não encontrado');
    const personName = `${person.firstName} ${person.lastName}`.trim();

    const doorNos = await this.entitledDoorNos(personId, deviceId);

    if (doorNos.length === 0) {
      // Sem porta liberada neste equipamento — remove, se já esteve cadastrada
      if (person.facialAccessCardNo) {
        try {
          await this.deletePersonFromDevice(device, person.facialAccessCardNo);
          return { personId, personName, cardNo: person.facialAccessCardNo, action: 'removed', faceStatus: 'removed' };
        } catch (err: any) {
          return { personId, personName, cardNo: person.facialAccessCardNo, action: 'error', faceStatus: null, detail: err.message };
        }
      }
      return { personId, personName, cardNo: null, action: 'skipped', faceStatus: null, detail: 'Nenhuma porta deste equipamento nas áreas do morador' };
    }

    const cardNo = await this.ensureCardNo(personId);
    try {
      await this.setUpUser(device, cardNo, personName, doorNos);
    } catch (err: any) {
      return { personId, personName, cardNo, action: 'error', faceStatus: null, detail: err.message };
    }

    if (!person.photoUrl) {
      return { personId, personName, cardNo, action: 'enrolled', faceStatus: 'no_photo', detail: 'Morador sem foto cadastrada — acesso facial só funciona após enviar a foto' };
    }
    try {
      await this.enrollFace(device, cardNo, person.photoUrl);
      return { personId, personName, cardNo, action: 'enrolled', faceStatus: 'synced' };
    } catch (err: any) {
      const modeling = /não detectou um rosto/i.test(err.message);
      return { personId, personName, cardNo, action: 'enrolled', faceStatus: modeling ? 'modeling_failed' : 'error', detail: err.message };
    }
  }

  /** Sincroniza UMA pessoa com TODOS os equipamentos habilitados. */
  static async syncPersonEverywhere(personId: string): Promise<Array<PersonSyncResult & { deviceId: string; deviceName: string }>> {
    const devices = await prisma.facialAccessDevice.findMany({ where: { enabled: true } });
    const results: Array<PersonSyncResult & { deviceId: string; deviceName: string }> = [];
    for (const device of devices) {
      try {
        const r = await this.syncPersonToDevice(device.id, personId);
        results.push({ ...r, deviceId: device.id, deviceName: device.name });
      } catch (err: any) {
        results.push({
          personId, personName: '', cardNo: null, action: 'error', faceStatus: null,
          detail: err.message, deviceId: device.id, deviceName: device.name,
        });
      }
    }
    return results;
  }

  /**
   * Sincroniza TODAS as pessoas relevantes com um equipamento: cadastra quem tem
   * porta liberada lá e remove (dentre as gerenciadas pelo OnliAcesso, i.e. com
   * facialAccessCardNo) quem não tem mais. Não mexe em cadastros manuais feitos
   * direto no equipamento.
   */
  static async syncAllToDevice(deviceId: string): Promise<PersonSyncResult[]> {
    const doors = await prisma.facialAccessDoor.findMany({ where: { deviceId }, select: { id: true } });
    const doorIds = doors.map((d) => d.id);

    // Pessoas com alguma área que libera porta deste equipamento
    const entitled = await prisma.person.findMany({
      where: { accessAreas: { some: { area: { doors: { some: { doorId: { in: doorIds } } } } } } },
      select: { id: true },
    });
    // Pessoas gerenciadas (já têm cardNo) que não têm mais direito neste equipamento
    const managed = await prisma.person.findMany({
      where: {
        facialAccessCardNo: { not: null },
        NOT: { accessAreas: { some: { area: { doors: { some: { doorId: { in: doorIds } } } } } } },
      },
      select: { id: true },
    });

    const results: PersonSyncResult[] = [];
    for (const p of [...entitled, ...managed]) {
      results.push(await this.syncPersonToDevice(deviceId, p.id));
    }
    return results;
  }

  // ── Acionamento remoto de porta ───────────────────────────────────────────

  static async controlDoor(deviceId: string, doorNo: number, cmd: 'open' | 'close' | 'alwaysOpen' | 'alwaysClose'): Promise<void> {
    const device = await this.getDevice(deviceId);
    const url = `http://${device.ip}:${device.port}/ISAPI/AccessControl/RemoteControl/door/${doorNo}`;
    const body = `<RemoteControlDoor version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><cmd>${cmd}</cmd></RemoteControlDoor>`;
    const res = await digestFetch(url, device.username, device.password, 'PUT', body, {
      'Content-Type': 'application/xml',
    }, { timeoutMs: 10000 });
    const text = await res.text();
    if (!res.ok || !/statusCode>1</.test(text.replace(/\s/g, ''))) {
      const msg = text.match(/<statusString>([^<]+)<\/statusString>/)?.[1] ?? `HTTP ${res.status}`;
      throw new Error(`Falha ao acionar porta ${doorNo}: ${msg}`);
    }
  }

  // ── Importação do histórico de eventos (AcsEvent) — Fase 6 ────────────────

  /**
   * O terminal guarda até 50.000 eventos. Job em segundo plano, idempotente:
   * id derivado de deviceId+serialNo (createMany com skipDuplicates), então o
   * mesmo evento vindo do import e do alertStream não duplica. Caveat: se o log
   * do equipamento for zerado, os serialNo recomeçam e eventos novos podem
   * colidir com ids antigos — aceitável para histórico.
   */
  static importJobs = new Map<string, {
    running: boolean; processed: number; imported: number; total: number | null;
    startedAt: Date; finishedAt?: Date; error?: string;
  }>();

  static startImportEvents(deviceId: string) {
    const existing = this.importJobs.get(deviceId);
    if (existing?.running) return existing;

    const progress: { running: boolean; processed: number; imported: number; total: number | null; startedAt: Date; finishedAt?: Date; error?: string } =
      { running: true, processed: 0, imported: 0, total: null, startedAt: new Date() };
    this.importJobs.set(deviceId, progress);

    void (async () => {
      try {
        const device = await this.getDevice(deviceId);
        const doors = await prisma.facialAccessDoor.findMany({ where: { deviceId } });
        const doorByNo = new Map(doors.map((d) => [d.doorNo, d]));

        const persons = await prisma.person.findMany({
          where: { facialAccessCardNo: { not: null } },
          select: { id: true, firstName: true, lastName: true, unit_number: true, photoUrl: true, facialAccessCardNo: true },
        });
        const personByCardNo = new Map(persons.map((p) => [p.facialAccessCardNo as string, p]));

        const searchID = `onli-${Date.now()}`;
        let position = 0;
        let batch: any[] = [];

        const flush = async () => {
          if (batch.length === 0) return;
          const result = await prisma.accessEvent.createMany({ data: batch, skipDuplicates: true });
          progress.imported += result.count;
          batch = [];
        };

        for (;;) {
          const res = await this.isapiJson(device, 'POST', '/ISAPI/AccessControl/AcsEvent?format=json', {
            AcsEventCond: { searchID, searchResultPosition: position, maxResults: 30, major: 0, minor: 0 },
          });
          const search = res?.AcsEvent;
          if (!search || search.responseStatusStrg === 'NO MATCH') break;
          progress.total = search.totalMatches ?? progress.total;

          const list: any[] = search.InfoList ?? [];
          for (const ev of list) {
            progress.processed++;
            const mapped = mapFacialEvent(ev.major, ev.minor);
            if (!mapped) continue;

            const door = ev.doorNo != null ? doorByNo.get(ev.doorNo) ?? null : null;
            const cardNo = ev.employeeNoString ?? (ev.employeeNo != null ? String(ev.employeeNo) : null);
            const person = cardNo ? personByCardNo.get(cardNo) ?? null : null;
            const when = new Date(ev.time);
            if (isNaN(when.getTime())) continue;

            batch.push({
              id: `facial-${device.id}-${ev.serialNo}`,
              occurredAt: when,
              eventTime: when,
              personName: person
                ? `${person.firstName} ${person.lastName}`.trim()
                : mapped.kind === 'alarm' ? mapped.label
                : ev.name || mapped.label,
              personType: person ? 'resident' : 'system',
              personId: person?.id ?? null,
              unit: person?.unit_number ?? null,
              deviceName: door?.name ?? device.name,
              status: mapped.status,
              photoUrl: person?.photoUrl ?? null,
              direction: door?.direction === 'entry' ? 'in' : door?.direction === 'exit' ? 'out' : null,
              category: mapped.kind,
              source: 'facial_access',
              notes: mapped.kind === 'access' && !person && cardNo ? `employeeNo ${cardNo}` : null,
              metadata: {
                deviceId: device.id, doorId: door?.id ?? null, serialNo: ev.serialNo,
                major: ev.major, minor: ev.minor, verifyMode: ev.currentVerifyMode ?? null,
                mask: ev.mask ?? null, importedFromDevice: true,
              },
            });
            if (batch.length >= 200) await flush();
          }

          if (search.responseStatusStrg !== 'MORE') break;
          position += list.length;
        }
        await flush();

        progress.running = false;
        progress.finishedAt = new Date();
        console.log(`[FacialAccess] Importação de histórico concluída: ${progress.imported} eventos de ${progress.processed} lidos (${device.name})`);
      } catch (err: any) {
        progress.running = false;
        progress.finishedAt = new Date();
        progress.error = err.message;
        console.error('[FacialAccess] Importação de histórico falhou:', err.message);
      }
    })();

    return progress;
  }
}

/**
 * Classifica um evento ACS (major/minor) para o feed unificado.
 * major 1 = alarme (tamper/violação/coação) → category 'alarm';
 * major 5 = evento de acesso → só os minors do mapa curado;
 * majors 2 (exceção) e 3 (operação) são ruído administrativo → ignorados.
 */
export function mapFacialEvent(major: number, minor: number):
  { kind: 'access' | 'alarm'; label: string; status: 'authorized' | 'denied' } | null {
  if (major === 1) {
    return { kind: 'alarm', label: `Alarme do terminal (código ${minor})`, status: 'denied' };
  }
  if (major === 5) {
    const m = FACIAL_ACCESS_MINORS[minor];
    if (m) return { kind: 'access', label: m.label, status: m.status };
  }
  return null;
}
