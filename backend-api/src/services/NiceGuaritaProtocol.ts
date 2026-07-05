import net from 'net';
import { EventEmitter } from 'events';

// ─────────────────────────────────────────────────────────────────────────────
// NICE GUARITA MG3000 — BINARY PROTOCOL LAYER
// Protocol: raw TCP socket or Serial RS-232/RS-485
// Frame format: [0x00 header] + [CMD] + [PAYLOAD...] + [CHECKSUM (sum of all)]
// Reference: sdk-nice/VISUAL_C_SHARP_demoMG3000_v1/demoMG3000/Form1.cs
// ─────────────────────────────────────────────────────────────────────────────

export const NICE_COMMANDS = {
  AUTO_EVENT:        0x04,  // Cmd 4:  Push event from device (no request needed)
  READ_DEVICE_COUNT: 0x07,  // Cmd 7:  Read number of enrolled devices
  WRITE_CLOCK:       0x0B,  // Cmd 11: Write date/time to module
  READ_CLOCK:        0x0C,  // Cmd 12: Read date/time from module
  TRIGGER_OUTPUT:    0x0D,  // Cmd 13: Trigger relay output (open gate)
  UPDATE_RECEIVERS:  0x1D,  // Cmd 29: Push enrollments to receivers (MANDATORY after enroll)
  REMOTE_MODE:       0x23,  // Cmd 35: Activate remote mode on receivers (90s)
  CANCEL_PROGRESSIVE: 0x2B,  // Cmd 43: Stop progressive command timeout
  STOP_PROGRESSIVE:  0x2B,  // Cmd 43: Stop progressive command timeout
  ENROLL_DEVICE:     0x43,  // Cmd 67: Enroll (sub 0x00) or delete (sub 0x04) device
  READ_DEVICES:      0x46,  // Cmd 70: Read all devices (progressive)
  FINGERPRINT_REQ:   0x39,  // Cmd 57: ANVIZ fingerprint not enrolled
  FINGERPRINT_SLOT:  0x3B,  // Cmd 59: Request free biometric slot
  FINGERPRINT_LINK:  0x4A,  // Cmd 74: Link ANVIZ biometric template
} as const;

export const DEVICE_TYPES = {
  CONTROL:     0x01,  // Remote control (TX)
  TAG_ACTIVE:  0x02,  // Active TAG
  CARD:        0x03,  // Card / badge
  BIOMETRIC:   0x05,  // Fingerprint
  TAG_PASSIVE: 0x06,  // Passive TAG (RFID)
  PASSWORD:    0x07,  // Numeric password
} as const;

export const ENROLL_SUBCOMMAND = {
  ADD:    0x00,
  DELETE: 0x04,
} as const;

export const EVENT_TYPES: Record<number, string> = {
  0x00: 'device_triggered',
  0x01: 'access_granted',
  0x02: 'device_powered_on',
  0x03: 'doorbell',
  0x04: 'programming_changed',
  0x05: 'intercom_triggered',
  0x06: 'remote_pc_trigger',
  0x07: 'receivers_not_updated',
  0x08: 'clone_attempt',
  0x09: 'panic',
  0x0A: 'sd_card_removed',
  0x0B: 'restore_done',
  0x0C: 'receiver_event',
  0x0D: 'auto_backup',
  0x0E: 'manual_backup',
  0x0F: 'interphone',
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface DeviceFrame {
  deviceType: number;
  serial: number;
  counter?: number;
  unit?: number;           // 0-9999
  block?: number;          // A-Z = 0x00-0x19; numbers 1-230 = 0x1A-0xFF
  group?: number;
  receiverBitmask?: number;
  identification?: string; // max 18 chars
  vehicleBrand?: number;   // 0x1F = no vehicle
  vehicleColor?: number;
  vehiclePlate?: string;   // max 7 chars
}

export interface GuaritaEvent {
  type: string;
  serial: string;
  dateTime: Date;
  deviceKind: string;
  rawFrame: Buffer;
  sourceIp?: string;  // IP do módulo MG3000 que enviou o evento
}

export interface EnrollResult {
  success: boolean;
  errorCode?: number;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function calcChecksum(bytes: number[]): number {
  return bytes.reduce((acc, b) => (acc + b) & 0xFF, 0);
}

function buildFrame(payload: number[]): Buffer {
  const cs = calcChecksum(payload);
  return Buffer.from([...payload, cs]);
}

function bcd2int(bcd: number): number {
  return ((bcd >> 4) & 0x0F) * 10 + (bcd & 0x0F);
}

function int2bcd(val: number): number {
  return ((Math.floor(val / 10) & 0x0F) << 4) | (val % 10);
}

function buildDeviceFrame39(d: DeviceFrame): number[] {
  const frame: number[] = new Array(39).fill(0);

  // Byte 0: [type (4 high)] + [dest nibble (4 low)]
  let destNibble = 0x00;
  if (d.deviceType === DEVICE_TYPES.BIOMETRIC || d.deviceType === DEVICE_TYPES.PASSWORD) {
    destNibble = 0x03;
  } else if (d.deviceType === DEVICE_TYPES.CONTROL) {
    destNibble = (d.serial >>> 24) & 0x0F;
  }
  frame[0] = ((d.deviceType << 4) & 0xF0) | (destNibble & 0x0F);

  // Bytes 1-3: serial (6 or 7 hex digits)
  frame[1] = (d.serial >> 16) & 0xFF;
  frame[2] = (d.serial >> 8) & 0xFF;
  frame[3] = d.serial & 0xFF;

  // Bytes 4-5: counter / biometric ID
  const counter = d.counter ?? 0;
  frame[4] = (counter >> 8) & 0xFF;
  frame[5] = counter & 0xFF;

  // Bytes 6-7: unit (centena and remainder)
  const unit = d.unit ?? 0;
  frame[6] = Math.floor(unit / 100);
  frame[7] = unit % 100;

  // Byte 8: block index
  frame[8] = d.block ?? 0x00;

  // Byte 9: group
  frame[9] = d.group ?? 0x00;

  // Byte 10: receiver bitmask (all 8 receivers enabled by default)
  frame[10] = d.receiverBitmask ?? 0xFF;

  // Bytes 11-28: identification (18 ASCII chars, space-padded)
  const label = (d.identification ?? '').substring(0, 18).padEnd(18, ' ');
  for (let i = 0; i < 18; i++) {
    frame[11 + i] = label.charCodeAt(i) & 0xFF;
  }

  // Byte 29: flags — read-only, always 0 when writing
  frame[29] = 0x00;

  // Byte 30: vehicle brand (0x1F = no vehicle)
  frame[30] = d.vehicleBrand ?? 0x1F;

  // Byte 31: vehicle color
  frame[31] = d.vehicleColor ?? 0x00;

  // Bytes 32-38: vehicle plate (7 chars, space-padded)
  const plateStr = (d.vehiclePlate ?? '').substring(0, 7).padEnd(7, ' ');
  for (let i = 0; i < 7; i++) {
    frame[32 + i] = (d.vehicleBrand !== undefined && d.vehicleBrand !== 0x1F)
      ? plateStr.charCodeAt(i) & 0xFF
      : 0x20;
  }

  return frame;
}

function parseEventFrame(data: Buffer): GuaritaEvent | null {
  if (data.length < 20 || data[1] !== NICE_COMMANDS.AUTO_EVENT) return null;

  const evt = Buffer.alloc(16);
  data.copy(evt, 0, 3, 19);

  const evtType = (evt[0] & 0xF0) >> 4;
  const dispType = (evt[10] & 0xF0) >> 4;

  let serialStr = '------';
  if ([0x00, 0x08, 0x09, 0x0C, 0x0F].includes(evtType)) {
    if (dispType === 1) {
      serialStr = `${(evt[0] & 0x0F).toString(16)}${evt[1].toString(16).padStart(2,'0')}${evt[2].toString(16).padStart(2,'0')}${evt[3].toString(16).padStart(2,'0')}`;
    } else {
      serialStr = `${evt[1].toString(16).padStart(2,'0')}${evt[2].toString(16).padStart(2,'0')}${evt[3].toString(16).padStart(2,'0')}`;
    }
  }

  const dateTime = new Date(
    2000 + bcd2int(evt[9]),
    bcd2int(evt[8]) - 1,
    bcd2int(evt[7]),
    bcd2int(evt[4]),
    bcd2int(evt[5]),
    bcd2int(evt[6])
  );

  const kindMap: Record<number, string> = {
    1: 'TX_remote', 2: 'TAG_active', 3: 'card',
    5: 'biometric', 6: 'TAG_passive', 7: 'password',
  };

  return {
    type: EVENT_TYPES[evtType] ?? 'unknown',
    serial: serialStr.toUpperCase(),
    dateTime,
    deviceKind: kindMap[dispType] ?? 'unknown',
    rawFrame: data,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TCP TRANSPORT
// ─────────────────────────────────────────────────────────────────────────────
async function tcpSendReceive(
  ip: string,
  port: number,
  payload: number[],
  timeoutMs = 5000
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const frame = buildFrame(payload);
    let response = Buffer.alloc(0);
    let settled = false;

    function settle(fn: () => void) {
      if (!settled) { settled = true; fn(); }
    }

    let quietTimer: NodeJS.Timeout | null = null;

    const timer = setTimeout(() => {
      socket.destroy();
      settle(() => reject(new Error(`NiceGuarita TCP timeout (${ip}:${port})`)));
    }, timeoutMs);

    const finish = () => {
      clearTimeout(timer);
      if (quietTimer) clearTimeout(quietTimer);
      socket.destroy();
      settle(() => resolve(response));
    };

    socket.connect(port, ip, () => socket.write(frame));
    socket.on('data', (chunk: Buffer) => {
      response = Buffer.concat([response, chunk]);
      // O MG3000 em modo servidor TCP NÃO fecha a conexão depois de
      // responder (o mesmo canal transporta eventos) - esperar 'close'
      // estourava o timeout mesmo com a resposta já recebida. Considera a
      // resposta completa após um breve silêncio depois do último byte.
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, 200);
    });
    socket.on('end', finish);
    socket.on('close', () => { clearTimeout(timer); if (quietTimer) clearTimeout(quietTimer); settle(() => resolve(response)); });
    socket.on('error', (err: Error) => { clearTimeout(timer); if (quietTimer) clearTimeout(quietTimer); socket.destroy(); settle(() => reject(err)); });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PROTOCOL PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────
export class NiceGuaritaProtocol {

  /** Cmd 13: Trigger relay output (open gate/barrier) */
  static async triggerOutput(
    ip: string,
    port: number,
    deviceType: number = 0xFF,  // 0xFF = ALL
    deviceNum: number = 0xFF,   // 0xFF = ALL
    output: number = 0x04,
    generateEvent = true
  ): Promise<void> {
    const frame = buildFrame([
      0x00, NICE_COMMANDS.TRIGGER_OUTPUT,
      deviceType, deviceNum, output,
      generateEvent ? 0x01 : 0x00,
    ]);
    // Cmd 13 sends no response from the device
    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      socket.connect(port, ip, () => { socket.write(frame); socket.end(); });
      socket.on('close', () => resolve());
      socket.on('timeout', () => { socket.destroy(); resolve(); });
      socket.on('error', reject);
    });
  }

  /** Cmd 67/0: Enroll a device into the Guarita memory */
  static async enrollDevice(ip: string, port: number, device: DeviceFrame): Promise<EnrollResult> {
    const frame39 = buildDeviceFrame39(device);
    const payload = [0x00, NICE_COMMANDS.ENROLL_DEVICE, ENROLL_SUBCOMMAND.ADD, ...frame39];
    const resp = await tcpSendReceive(ip, port, payload, 8000);

    if (resp.length < 4 || resp[1] !== NICE_COMMANDS.ENROLL_DEVICE) {
      return { success: false, message: 'Resposta inválida do Guarita' };
    }
    const code = resp[3];
    const messages: Record<number, string> = {
      0x00: 'Dispositivo cadastrado com sucesso',
      0x01: 'Memória do Guarita cheia',
      0x02: 'Dispositivo já existe na memória',
      0xFE: 'Frame de cadastro inválido',
    };
    return { success: code === 0x00, errorCode: code, message: messages[code] ?? `Erro 0x${code.toString(16)}` };
  }

  /** Cmd 67/4: Delete a device from Guarita memory */
  static async deleteDevice(
    ip: string,
    port: number,
    deviceType: number,
    serial: number,
    opts?: { biometricId?: number; password?: number }
  ): Promise<{ success: boolean; message: string }> {
    const frame39 = new Array(39).fill(0);

    if (deviceType === DEVICE_TYPES.BIOMETRIC && opts?.biometricId !== undefined) {
      frame39[0] = 0x53;
      frame39[4] = (opts.biometricId >> 8) & 0xFF;
      frame39[5] = opts.biometricId & 0xFF;
    } else if (deviceType === DEVICE_TYPES.PASSWORD && opts?.password !== undefined) {
      frame39[0] = 0x73;
      frame39[1] = (opts.password >> 16) & 0xFF;
      frame39[2] = (opts.password >> 8) & 0xFF;
      frame39[3] = opts.password & 0xFF;
    } else {
      frame39[0] = ((deviceType << 4) & 0xF0) | ((serial >>> 24) & 0x0F);
      frame39[1] = (serial >> 16) & 0xFF;
      frame39[2] = (serial >> 8) & 0xFF;
      frame39[3] = serial & 0xFF;
    }

    const payload = [0x00, NICE_COMMANDS.ENROLL_DEVICE, ENROLL_SUBCOMMAND.DELETE, ...frame39];
    const resp = await tcpSendReceive(ip, port, payload, 8000);

    if (resp.length < 4 || resp[1] !== NICE_COMMANDS.ENROLL_DEVICE) {
      return { success: false, message: 'Resposta inválida' };
    }
    const code = resp[3];
    const messages: Record<number, string> = {
      0x00: 'Dispositivo apagado com sucesso',
      0x03: 'Dispositivo não encontrado',
      0xFE: 'Frame inválido',
    };
    return { success: code === 0x00, message: messages[code] ?? `Erro 0x${code.toString(16)}` };
  }

  /** Cmd 29: Update receivers — MANDATORY after every enroll/delete */
  static async updateReceivers(ip: string, port: number): Promise<{ success: boolean; message: string }> {
    const resp = await tcpSendReceive(ip, port, [0x00, NICE_COMMANDS.UPDATE_RECEIVERS], 180_000);
    if (resp.length < 3 || resp[1] !== NICE_COMMANDS.UPDATE_RECEIVERS) {
      return { success: false, message: 'Sem resposta de atualização' };
    }
    const code = resp[2];
    return {
      success: code === 0x00,
      message: code === 0x00 ? 'Receptores atualizados' : `Erro na atualização: 0x${code.toString(16)}`,
    };
  }

  /** Cmd 7: Read count of enrolled devices */
  static async readDeviceCount(ip: string, port: number): Promise<number> {
    const resp = await tcpSendReceive(ip, port, [0x00, NICE_COMMANDS.READ_DEVICE_COUNT], 5000);
    if (resp.length < 4 || resp[1] !== NICE_COMMANDS.READ_DEVICE_COUNT) return 0;
    return (resp[2] << 8) | resp[3];
  }

  /** Cmd 11: Sync module clock to system time */
  static async writeClock(ip: string, port: number, date?: Date): Promise<void> {
    const now = date ?? new Date();
    await tcpSendReceive(ip, port, [
      0x00, NICE_COMMANDS.WRITE_CLOCK,
      int2bcd(now.getDate()),
      int2bcd(now.getMonth() + 1),
      int2bcd(now.getFullYear() % 100),
      int2bcd(now.getHours()),
      int2bcd(now.getMinutes()),
      int2bcd(now.getSeconds()),
    ], 5000);
  }

  /** Cmd 12: Read module clock */
  static async readClock(ip: string, port: number): Promise<Date | null> {
    const resp = await tcpSendReceive(ip, port, [0x00, NICE_COMMANDS.READ_CLOCK], 5000);
    if (resp.length < 8 || resp[1] !== NICE_COMMANDS.READ_CLOCK) return null;
    return new Date(
      2000 + bcd2int(resp[4]),
      bcd2int(resp[3]) - 1,
      bcd2int(resp[2]),
      bcd2int(resp[5]),
      bcd2int(resp[6]),
      bcd2int(resp[7])
    );
  }

  /** Connectivity check using Cmd 7 */
  static async ping(ip: string, port: number, timeoutMs = 3000): Promise<boolean> {
    try {
      await tcpSendReceive(ip, port, [0x00, NICE_COMMANDS.READ_DEVICE_COUNT], timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  /** Cmd 70 (0x46): Read all devices (Progressive) */
  static async readAllDevices(ip: string, port: number, totalDevices: number): Promise<Partial<DeviceFrame>[]> {
    if (totalDevices <= 0) return [];
    
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const frames: Partial<DeviceFrame>[] = [];
      let buffer = Buffer.alloc(0);
      let settled = false;

      function settle(fn: () => void) {
        if (!settled) { settled = true; fn(); }
      }

      const timer = setTimeout(() => {
        socket.destroy();
        settle(() => reject(new Error(`NiceGuarita readAll timeout (${ip}:${port})`)));
      }, 15000 + (totalDevices * 100)); // Dynamic timeout based on amount

      socket.connect(port, ip, () => {
        // Send Cmd 70 to start progressive read
        socket.write(buildFrame([0x00, NICE_COMMANDS.READ_DEVICES]));
      });

      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        // Each progressive response is 42 bytes (0x00, 0x46, 39 bytes frame, 1 byte CS)
        while (buffer.length >= 42) {
          // Resync: eventos automáticos (Cmd 4 etc.) podem se intercalar no
          // mesmo socket - descarta byte a byte até achar um header 0x46.
          if (buffer[1] !== NICE_COMMANDS.READ_DEVICES) {
            buffer = buffer.subarray(1);
            continue;
          }
          const frameBytes = buffer.subarray(2, 41);
          buffer = buffer.subarray(42);

          // Parse the 39 bytes frame
          // Very basic parsing for extraction
          const typeAndDest = frameBytes[0];
          const devType = (typeAndDest & 0xF0) >> 4;
          const serialHex = frameBytes.subarray(1, 4).toString('hex').toUpperCase();
          const serialNum = parseInt(serialHex, 16);
          const name = frameBytes.subarray(11, 29).toString('ascii').trim();
          const unit = bcd2int(frameBytes[6]) * 100 + bcd2int(frameBytes[7]);
          const blockRaw = frameBytes[8];

          frames.push({
            deviceType: devType,
            serial: serialNum,
            identification: name,
            unit: unit > 0 ? unit : undefined,
            block: blockRaw > 0 ? blockRaw : undefined,
          });

          if (frames.length >= totalDevices) {
             // We're done! Cancel progressive stream (Cmd 43 - 0x2B)
             socket.write(buildFrame([0x00, NICE_COMMANDS.CANCEL_PROGRESSIVE]));
             clearTimeout(timer);
             socket.destroy();
             settle(() => resolve(frames));
             break;
          }

          // Handshake progressivo (ver demo C# da Nice, Form1.cs Cmd 70):
          // o módulo envia UM frame por vez e espera a solicitação do
          // próximo - um único byte 0x00, SEM checksum (o demo só anexa
          // checksum a frames de 2+ bytes). Sem isso, só o primeiro frame
          // chega e a leitura estoura timeout.
          socket.write(Buffer.from([0x00]));
        }
      });

      socket.on('end', () => { 
        clearTimeout(timer); 
        socket.destroy(); 
        settle(() => resolve(frames)); // return whatever we got
      });
      
      socket.on('error', (err: Error) => { 
        clearTimeout(timer); 
        socket.destroy(); 
        settle(() => reject(err)); 
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GUARITA EVENT LISTENER SERVER
// MG3000 pushes Cmd 4 events automatically when someone passes a reader.
// This server listens for those frames and emits structured events.
// ─────────────────────────────────────────────────────────────────────────────
export class NiceGuaritaEventServer extends EventEmitter {
  private server: net.Server | null = null;
  readonly listenPort: number;

  constructor(listenPort = 3200) {
    super();
    this.listenPort = listenPort;
  }

  start(): void {
    if (this.server) return;

    this.server = net.createServer((socket) => {
      let buffer = Buffer.alloc(0);
      const sourceIp = socket.remoteAddress?.replace(/^::ffff:/, '') ?? undefined;

      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        // O módulo empurra frames de tamanhos diferentes no mesmo socket:
        //  Cmd 4  (0x04, 20 bytes) - evento de acesso de dispositivo cadastrado
        //  Cmd 42 (0x2A, 11 bytes) - TX/TA/CT NÃO cadastrado acionado (Cadastro Rápido)
        //  Cmd 46 (0x2E, 10 bytes) - CT/TA/TP não cadastrado direto na leitora do receptor
        while (buffer.length >= 2) {
          if (buffer[0] !== 0x00) { buffer = buffer.subarray(1); continue; }
          const cmd = buffer[1];
          if (cmd === 0x04) {
            if (buffer.length < 20) break;
            const slice = buffer.subarray(0, 20);
            buffer = buffer.subarray(20);
            const event = parseEventFrame(slice);
            if (event) this.emit('access_event', { ...event, sourceIp });
          } else if (cmd === 0x2A) {
            if (buffer.length < 11) break;
            const f = buffer.subarray(0, 11);
            buffer = buffer.subarray(11);
            const kindMap: Record<number, string> = { 1: 'TX_remote', 2: 'TAG_active', 3: 'card' };
            const kind = kindMap[f[2]];
            if (kind) {
              // TX tem 7 dígitos hex (nibble baixo do byte 3 + bytes 4-6)
              const serial = f[2] === 0x01
                ? ((f[3] & 0x0F).toString(16) + f.subarray(4, 7).toString('hex')).toUpperCase()
                : f.subarray(4, 7).toString('hex').toUpperCase();
              this.emit('unregistered_device', { serial, deviceKind: kind, dateTime: new Date(), sourceIp });
            }
          } else if (cmd === 0x2E) {
            if (buffer.length < 10) break;
            const f = buffer.subarray(0, 10);
            buffer = buffer.subarray(10);
            const kindMap: Record<number, string> = { 2: 'TAG_active', 3: 'card', 6: 'TAG_passive' };
            const kind = kindMap[f[2]];
            if (kind) {
              const serial = f.subarray(5, 8).toString('hex').toUpperCase();
              this.emit('unregistered_device', { serial, deviceKind: kind, dateTime: new Date(), sourceIp });
            }
          } else {
            // byte de resync (frame desconhecido/desalinhado)
            buffer = buffer.subarray(1);
          }
        }
      });

      socket.on('error', (err: Error) => this.emit('socket_error', err));
    });

    this.server.listen(this.listenPort, '0.0.0.0', () => {
      console.log(`[NiceGuarita] Event listener started on port ${this.listenPort}`);
    });

    this.server.on('error', (err: Error) => {
      console.error('[NiceGuarita] Event server error:', err.message);
      this.emit('server_error', err);
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
    console.log('[NiceGuarita] Event listener stopped');
  }

  get isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }
}

// Singleton — started once by index.ts
export const guaritaEventServer = new NiceGuaritaEventServer(
  parseInt(process.env.NICE_GUARITA_EVENT_PORT ?? '3200', 10)
);
