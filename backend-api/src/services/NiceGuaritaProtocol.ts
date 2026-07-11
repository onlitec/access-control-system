import net from 'net';
import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// NICE GUARITA MG3000 — BINARY PROTOCOL LAYER
// Protocol: raw TCP socket or Serial RS-232/RS-485
// Frame format: [0x00 header] + [CMD] + [PAYLOAD...] + [CHECKSUM (sum of all)]
// Reference: sdk-nice/VISUAL_C_SHARP_demoMG3000_v1/demoMG3000/Form1.cs
// ─────────────────────────────────────────────────────────────────────────────

export const NICE_COMMANDS = {
  AUTO_EVENT:        0x04,  // Cmd 4:  Push event from device (no request needed)
  READ_LAST_EVENT:   0x05,  // Cmd 5:  Read last stored event (16-byte frame)
  READ_EVENT_COUNT:  0x06,  // Cmd 6:  Read stored event count (by marker)
  READ_DEVICE_COUNT: 0x07,  // Cmd 7:  Read number of enrolled devices
  READ_EVENT_AT:     0x32,  // Cmd 50: Read stored event by pointer (0-8191)
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
  /** Saída (relé) acionada no receptor: 1-4 — identifica QUAL portão (ex.: 1=entrada moradores, 2=entrada visitantes, 3=saída) */
  output: number | null;
  /** Subtipo do evento (byte 15): em 'receiver_event', 0xFB=porta abriu, 0xFA=fechou, 0xF9=violada, 0xFF=aberta (tempo excedido), 0xFE=falta d'água, 0x00=TAG sem vaga */
  subCode: number;
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
  return parseEvt16(evt, data);
}

/** Decodifica o frame de evento de 16 bytes (mesmo formato no push Cmd 4 e nos eventos armazenados) */
function parseEvt16(evt: Buffer, rawFrame: Buffer): GuaritaEvent | null {
  if (evt.length < 16) return null;

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

  // Saída (relé) acionada: bits 5..4 do byte de flags (evt[14]) + 1 — só faz
  // sentido nos eventos de acionamento (ver demo C#, "flagsEvt0")
  const OUTPUT_EVENT_TYPES = [0x00, 0x05, 0x06, 0x08, 0x09, 0x0C, 0x0F];
  const output = OUTPUT_EVENT_TYPES.includes(evtType)
    ? ((evt[14] >> 4) & 0x03) + 1
    : null;

  return {
    type: EVENT_TYPES[evtType] ?? 'unknown',
    serial: serialStr.toUpperCase(),
    dateTime,
    deviceKind: kindMap[dispType] ?? 'unknown',
    output,
    subCode: evt[15],
    rawFrame,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TCP TRANSPORT — CONEXÃO PERSISTENTE ÚNICA POR MÓDULO
//
// O MG3000 segue o modelo do SDK oficial (demo C#): o cliente abre UMA conexão
// TCP e tudo passa por ela — comandos, respostas e os eventos automáticos
// (Cmd 4) que o módulo empurra espontaneamente na MESMA conexão. Comportamentos
// medidos no hardware real (2026-07-05):
//   - o módulo nunca fecha a conexão após responder (fim de resposta é
//     reconhecido por tamanho conhecido do comando ou checksum);
//   - atende UMA conexão por vez: a segunda conexão é aceita e fechada sem
//     resposta, e reabrir conexões em sequência exige folga;
//   - a leitura progressiva (Cmd 70) exige um ACK de 1 byte 0x00 (sem
//     checksum) após CADA frame de 42 bytes.
// Por isso cada módulo tem um GuaritaConnection compartilhado e reutilizado,
// com comandos serializados e eventos emitidos a qualquer momento.
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_FRAME_LEN = 20;       // 00 04 <contador> <16 bytes evt> <cs>
const PROGRESSIVE_FRAME_LEN = 42; // 00 46 <39 bytes disp> <cs>

// Tamanho total das respostas conhecidas, indexado pelo byte de comando ecoado
const RESPONSE_LENGTHS: Record<number, number> = {
  [NICE_COMMANDS.READ_DEVICE_COUNT]: 5, // 00 07 hi lo cs
  [NICE_COMMANDS.READ_CLOCK]: 9,        // 00 0C dd mm aa hh mi ss cs
  [NICE_COMMANDS.ENROLL_DEVICE]: 5,     // 00 43 sub cod cs
  [NICE_COMMANDS.UPDATE_RECEIVERS]: 4,  // 00 1D cod cs
  [NICE_COMMANDS.READ_LAST_EVENT]: 19,  // 00 05 <evt16> cs
  [NICE_COMMANDS.READ_EVENT_COUNT]: 6,  // 00 06 marca hi lo cs
  [NICE_COMMANDS.READ_EVENT_AT]: 23,    // 00 32 ret op ph pl <evt16> cs
};

const CONNECT_TIMEOUT_MS = 5_000;
const COMMAND_GAP_MS = 100;       // folga entre comandos na mesma conexão
const IDLE_CLOSE_MS = 30_000;     // conexões não-persistentes fecham após ociosidade
const RECONNECT_MIN_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;

interface PendingCommand {
  cmd: number;
  timeoutMs: number;
  timer: NodeJS.Timeout;
  resolve: (result: Buffer | Buffer[]) => void;
  reject: (err: Error) => void;
  progressive?: { frames: Buffer[]; total: number };
}

interface RequestOptions {
  /** byte de comando esperado na resposta; 'none' = comando sem resposta */
  expect?: number | 'none';
  timeoutMs?: number;
  /** leitura progressiva (Cmd 70): total de frames esperados */
  progressiveTotal?: number;
}

export class GuaritaConnection extends EventEmitter {
  readonly ip: string;
  readonly port: number;
  /** conexões persistentes reconectam sozinhas e nunca fecham por ociosidade */
  persistent = false;

  private socket: net.Socket | null = null;
  private connecting: Promise<void> | null = null;
  private buffer = Buffer.alloc(0);
  private pending: PendingCommand | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private reconnectDelay = RECONNECT_MIN_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(ip: string, port: number) {
    super();
    this.ip = ip;
    this.port = port;
  }

  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  ensureConnected(): Promise<void> {
    return this.connect();
  }

  /** Envia um comando serializado nesta conexão e aguarda a resposta. */
  request(payload: number[], opts: RequestOptions = {}): Promise<Buffer | Buffer[] | null> {
    const run = this.queue.catch(() => {}).then(() => this.execute(payload, opts));
    this.queue = run.catch(() => {}).then(
      () => new Promise((r) => setTimeout(r, COMMAND_GAP_MS))
    );
    return run;
  }

  /** Fecha o socket (a conexão pode ser reaberta pelo próximo request). */
  disconnect(): void {
    this.persistent = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    this.socket?.destroy();
    this.socket = null;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private connect(): Promise<void> {
    if (this.isConnected) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      const connTimer = setTimeout(() => {
        socket.destroy();
        this.connecting = null;
        this.scheduleReconnect();
        reject(new Error(`NiceGuarita: timeout ao conectar em ${this.ip}:${this.port}`));
      }, CONNECT_TIMEOUT_MS);

      const onError = (err: Error) => {
        clearTimeout(connTimer);
        socket.destroy();
        this.connecting = null;
        this.scheduleReconnect();
        reject(err);
      };
      socket.once('error', onError);

      socket.connect(this.port, this.ip, () => {
        clearTimeout(connTimer);
        socket.removeListener('error', onError);
        this.socket = socket;
        this.connecting = null;
        this.buffer = Buffer.alloc(0);
        this.reconnectDelay = RECONNECT_MIN_MS;

        socket.on('data', (chunk: Buffer) => this.onData(chunk));
        socket.on('error', (err: Error) => this.emit('socket_error', err));
        socket.on('close', () => this.onClose());

        this.touchIdle();
        resolve();
      });
    });
    return this.connecting;
  }

  private onClose(): void {
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    const p = this.pending;
    this.pending = null;
    if (p) { clearTimeout(p.timer); p.reject(new Error(`NiceGuarita: conexão com ${this.ip}:${this.port} encerrada`)); }
    this.emit('disconnected');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.persistent || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => { /* scheduleReconnect já reagendou */ });
    }, delay);
  }

  private touchIdle(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    if (this.persistent) return;
    this.idleTimer = setTimeout(() => {
      if (!this.pending) { this.socket?.destroy(); this.socket = null; }
    }, IDLE_CLOSE_MS);
  }

  private async execute(payload: number[], opts: RequestOptions): Promise<Buffer | Buffer[] | null> {
    await this.connect();
    this.touchIdle();
    const frame = buildFrame(payload);
    const expect = opts.expect ?? payload[1];

    if (expect === 'none') {
      this.socket!.write(frame);
      return null;
    }

    return new Promise<Buffer | Buffer[]>((resolve, reject) => {
      const timeoutMs = opts.timeoutMs ?? 5000;
      const timer = setTimeout(() => {
        const p = this.pending;
        this.pending = null;
        if (p?.progressive) {
          // interrompe o stream progressivo para não dessincronizar a conexão
          try { this.socket?.write(buildFrame([0x00, NICE_COMMANDS.CANCEL_PROGRESSIVE])); } catch { /* já caiu */ }
        }
        reject(new Error(`NiceGuarita: timeout aguardando resposta do Cmd 0x${(expect as number).toString(16)} (${this.ip}:${this.port})`));
      }, timeoutMs);

      this.pending = {
        cmd: expect as number,
        timeoutMs,
        timer,
        resolve: (result) => { clearTimeout(timer); this.pending = null; resolve(result); },
        reject: (err) => { clearTimeout(timer); this.pending = null; reject(err); },
        progressive: opts.progressiveTotal
          ? { frames: [], total: opts.progressiveTotal }
          : undefined,
      };
      this.socket!.write(frame);
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.parseLoop();
  }

  private parseLoop(): void {
    while (this.buffer.length >= 2) {
      // todo frame do protocolo começa com 0x00; byte estranho = ressincroniza
      if (this.buffer[0] !== 0x00) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }
      const cmd = this.buffer[1];

      // ── evento automático (Cmd 4): pode chegar a qualquer momento ─────────
      if (cmd === NICE_COMMANDS.AUTO_EVENT) {
        if (this.buffer.length < EVENT_FRAME_LEN) return;
        const frame = this.buffer.subarray(0, EVENT_FRAME_LEN);
        this.buffer = this.buffer.subarray(EVENT_FRAME_LEN);
        const event = parseEventFrame(frame);
        if (event) this.emit('access_event', { ...event, sourceIp: this.ip });
        continue;
      }

      // ── resposta do comando pendente ───────────────────────────────────────
      if (this.pending && cmd === this.pending.cmd) {
        const pending = this.pending;

        if (pending.progressive) {
          if (this.buffer.length < PROGRESSIVE_FRAME_LEN) return;
          const frame = Buffer.from(this.buffer.subarray(0, PROGRESSIVE_FRAME_LEN));
          this.buffer = this.buffer.subarray(PROGRESSIVE_FRAME_LEN);
          pending.progressive.frames.push(frame);
          if (pending.progressive.frames.length >= pending.progressive.total) {
            this.socket?.write(buildFrame([0x00, NICE_COMMANDS.CANCEL_PROGRESSIVE]));
            pending.resolve(pending.progressive.frames);
          } else {
            // ACK obrigatório: 1 byte 0x00 sem checksum solicita o próximo frame
            this.socket?.write(Buffer.from([0x00]));
          }
          continue;
        }

        const knownLen = RESPONSE_LENGTHS[cmd];
        if (knownLen) {
          if (this.buffer.length < knownLen) return;
          const frame = Buffer.from(this.buffer.subarray(0, knownLen));
          this.buffer = this.buffer.subarray(knownLen);
          pending.resolve(frame);
          continue;
        }

        // comando sem tamanho catalogado: menor prefixo com checksum válido
        let resolved = false;
        for (let len = 3; len <= this.buffer.length; len++) {
          const candidate = this.buffer.subarray(0, len);
          let sum = 0;
          for (let i = 0; i < len - 1; i++) sum = (sum + candidate[i]) & 0xFF;
          if (sum === candidate[len - 1]) {
            const frame = Buffer.from(candidate);
            this.buffer = this.buffer.subarray(len);
            pending.resolve(frame);
            resolved = true;
            break;
          }
        }
        if (!resolved) return; // aguarda mais bytes
        continue;
      }

      // ── frame órfão (resposta de comando que já expirou etc.) ─────────────
      const orphanLen = cmd === NICE_COMMANDS.READ_DEVICES
        ? PROGRESSIVE_FRAME_LEN
        : RESPONSE_LENGTHS[cmd];
      if (orphanLen) {
        if (this.buffer.length < orphanLen) return;
        this.buffer = this.buffer.subarray(orphanLen);
      } else {
        this.buffer = this.buffer.subarray(1);
      }
    }
  }
}

// Uma conexão por módulo (ip:porta), compartilhada por comandos e eventos
const _connections = new Map<string, GuaritaConnection>();

export function getGuaritaConnection(ip: string, port: number): GuaritaConnection {
  const key = `${ip}:${port}`;
  let conn = _connections.get(key);
  if (!conn) {
    conn = new GuaritaConnection(ip, port);
    _connections.set(key, conn);
  }
  return conn;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROTOCOL PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────
export class NiceGuaritaProtocol {

  /** Cmd 13: Trigger relay output (open gate/barrier). Sem resposta do módulo. */
  static async triggerOutput(
    ip: string,
    port: number,
    deviceType: number = 0xFF,  // 0xFF = broadcast (todos os receptores)
    deviceNum: number = 0xFF,   // 0xFF = broadcast
    output: number = 0x01,      // Relé 1 (padrão usual do portão; era 4)
    generateEvent = true
  ): Promise<void> {
    await getGuaritaConnection(ip, port).request(
      [0x00, NICE_COMMANDS.TRIGGER_OUTPUT, deviceType, deviceNum, output, generateEvent ? 0x01 : 0x00],
      { expect: 'none' }
    );
  }

  /** Cmd 67/0: Enroll a device into the Guarita memory */
  static async enrollDevice(ip: string, port: number, device: DeviceFrame): Promise<EnrollResult> {
    const frame39 = buildDeviceFrame39(device);
    const resp = await getGuaritaConnection(ip, port).request(
      [0x00, NICE_COMMANDS.ENROLL_DEVICE, ENROLL_SUBCOMMAND.ADD, ...frame39],
      { timeoutMs: 8000 }
    ) as Buffer;

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

    const resp = await getGuaritaConnection(ip, port).request(
      [0x00, NICE_COMMANDS.ENROLL_DEVICE, ENROLL_SUBCOMMAND.DELETE, ...frame39],
      { timeoutMs: 8000 }
    ) as Buffer;

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
    const resp = await getGuaritaConnection(ip, port).request(
      [0x00, NICE_COMMANDS.UPDATE_RECEIVERS],
      { timeoutMs: 180_000 }
    ) as Buffer;
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
    const resp = await getGuaritaConnection(ip, port).request(
      [0x00, NICE_COMMANDS.READ_DEVICE_COUNT], { timeoutMs: 5000 }
    ) as Buffer;
    if (resp.length < 4 || resp[1] !== NICE_COMMANDS.READ_DEVICE_COUNT) return 0;
    return (resp[2] << 8) | resp[3];
  }

  /** Cmd 11: Sync module clock to system time (sem resposta documentada). */
  static async writeClock(ip: string, port: number, date?: Date): Promise<void> {
    const now = date ?? new Date();
    await getGuaritaConnection(ip, port).request([
      0x00, NICE_COMMANDS.WRITE_CLOCK,
      int2bcd(now.getDate()),
      int2bcd(now.getMonth() + 1),
      int2bcd(now.getFullYear() % 100),
      int2bcd(now.getHours()),
      int2bcd(now.getMinutes()),
      int2bcd(now.getSeconds()),
    ], { expect: 'none' });
  }

  /** Cmd 12: Read module clock */
  static async readClock(ip: string, port: number): Promise<Date | null> {
    const resp = await getGuaritaConnection(ip, port).request(
      [0x00, NICE_COMMANDS.READ_CLOCK], { timeoutMs: 5000 }
    ) as Buffer;
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

  /** Cmd 6: Count of events stored in module memory (max 8192) */
  static async readEventCount(ip: string, port: number, marker = 0x00): Promise<number> {
    const resp = await getGuaritaConnection(ip, port).request(
      [0x00, NICE_COMMANDS.READ_EVENT_COUNT, marker], { timeoutMs: 5000 }
    ) as Buffer;
    if (resp.length < 5 || resp[1] !== NICE_COMMANDS.READ_EVENT_COUNT) return 0;
    return (resp[3] << 8) | resp[4];
  }

  /** Cmd 5: Last event stored in module memory (16-byte frame) */
  static async readLastEvent(ip: string, port: number): Promise<GuaritaEvent | null> {
    const resp = await getGuaritaConnection(ip, port).request(
      [0x00, NICE_COMMANDS.READ_LAST_EVENT], { timeoutMs: 5000 }
    ) as Buffer;
    if (resp.length < 19 || resp[1] !== NICE_COMMANDS.READ_LAST_EVENT) return null;
    return parseEvt16(resp.subarray(2, 18), resp);
  }

  /** Cmd 50 (0x32): Read stored event at pointer 0-8191 */
  static async readEventAt(ip: string, port: number, pointer: number): Promise<GuaritaEvent | null> {
    const resp = await getGuaritaConnection(ip, port).request(
      [0x00, NICE_COMMANDS.READ_EVENT_AT, 0x00, (pointer >> 8) & 0x1F, pointer & 0xFF],
      { timeoutMs: 5000 }
    ) as Buffer;
    if (resp.length < 23 || resp[1] !== NICE_COMMANDS.READ_EVENT_AT || resp[2] !== 0x00) return null;
    return parseEvt16(resp.subarray(6, 22), resp);
  }

  /** Connectivity check using Cmd 7 */
  static async ping(ip: string, port: number, timeoutMs = 3000): Promise<boolean> {
    try {
      const resp = await getGuaritaConnection(ip, port).request(
        [0x00, NICE_COMMANDS.READ_DEVICE_COUNT], { timeoutMs }
      ) as Buffer;
      return resp.length >= 4 && resp[1] === NICE_COMMANDS.READ_DEVICE_COUNT;
    } catch {
      return false;
    }
  }

  /**
   * Cmd 70 (0x46): Read all devices (progressivo, com ACK de 0x00 por frame).
   */
  static async readAllDevices(ip: string, port: number, totalDevices: number): Promise<Partial<DeviceFrame>[]> {
    if (totalDevices <= 0) return [];

    const frames = await getGuaritaConnection(ip, port).request(
      [0x00, NICE_COMMANDS.READ_DEVICES],
      { progressiveTotal: totalDevices, timeoutMs: 15_000 + totalDevices * 200 }
    ) as Buffer[];

    return frames.map((frame) => {
      const frameBytes = frame.subarray(2, 41);
      const typeAndDest = frameBytes[0];
      const devType = (typeAndDest & 0xF0) >> 4;
      // Controle TX tem serial de 7 dígitos hex: o nibble alto fica no byte 0
      // (mesmo formato usado nos eventos Cmd 4 — sem ele o serial não casa)
      let serialNum = parseInt(frameBytes.subarray(1, 4).toString('hex'), 16);
      if (devType === DEVICE_TYPES.CONTROL) {
        serialNum = (typeAndDest & 0x0F) * 0x1000000 + serialNum;
      }
      const name = frameBytes.subarray(11, 29).toString('ascii').trim();
      // Unidade em binário puro (unid_h*100 + unid_l), NÃO BCD — ver demo C# linha 1456
      const unit = frameBytes[6] * 100 + frameBytes[7];
      const blockRaw = frameBytes[8];

      return {
        deviceType: devType,
        serial: serialNum,
        identification: name,
        unit: unit > 0 ? unit : undefined,
        block: blockRaw > 0 ? blockRaw : undefined,
      };
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GUARITA EVENT HUB
// O MG3000 empurra eventos (Cmd 4) pela MESMA conexão TCP aberta pelo cliente
// (não existe conexão de entrada do módulo). Este hub mantém uma conexão
// persistente com cada módulo habilitado no banco e repassa os eventos.
// ─────────────────────────────────────────────────────────────────────────────
export class GuaritaEventHub extends EventEmitter {
  private refreshTimer: NodeJS.Timeout | null = null;
  private prisma: PrismaClient | null = null;
  private tracked = new Map<string, { conn: GuaritaConnection; handler: (evt: GuaritaEvent) => void }>();

  start(): void {
    if (this.refreshTimer) return;
    this.prisma = new PrismaClient();
    const refresh = () => {
      this.refresh().catch((err: Error) => {
        console.error('[NiceGuarita] Falha ao atualizar conexões com módulos:', err.message);
        this.emit('server_error', err);
      });
    };
    refresh();
    this.refreshTimer = setInterval(refresh, 60_000);
    console.log('[NiceGuarita] Hub de eventos iniciado (conexão persistente por módulo, eventos via porta do próprio módulo)');
  }

  private async refresh(): Promise<void> {
    const devices = await this.prisma!.guaritaDevice.findMany({ where: { enabled: true } });
    const wanted = new Set(devices.map((d: { ip: string; port: number }) => `${d.ip}:${d.port}`));

    // remove módulos desabilitados/apagados
    for (const [key, entry] of this.tracked) {
      if (!wanted.has(key)) {
        entry.conn.removeListener('access_event', entry.handler);
        entry.conn.disconnect();
        this.tracked.delete(key);
        console.log(`[NiceGuarita] Conexão persistente encerrada: ${key}`);
      }
    }

    // adiciona módulos novos
    for (const d of devices) {
      const key = `${d.ip}:${d.port}`;
      if (this.tracked.has(key)) {
        // garante que a conexão está de pé (reconexão de fallback a cada ciclo)
        this.tracked.get(key)!.conn.ensureConnected().catch(() => { /* backoff interno cuida */ });
        continue;
      }
      const conn = getGuaritaConnection(d.ip, d.port);
      conn.persistent = true;
      const handler = (evt: GuaritaEvent) => this.emit('access_event', evt);
      conn.on('access_event', handler);
      this.tracked.set(key, { conn, handler });
      conn.ensureConnected()
        .then(() => console.log(`[NiceGuarita] Conexão persistente estabelecida: ${key}`))
        .catch((err: Error) => console.warn(`[NiceGuarita] Módulo ${key} inacessível (${err.message}) — nova tentativa automática`));
    }
  }

  stop(): void {
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    for (const [, entry] of this.tracked) {
      entry.conn.removeListener('access_event', entry.handler);
      entry.conn.disconnect();
    }
    this.tracked.clear();
    void this.prisma?.$disconnect();
    this.prisma = null;
    console.log('[NiceGuarita] Hub de eventos parado');
  }

  get isRunning(): boolean {
    return this.refreshTimer !== null;
  }
}

// Singleton — started once by server.ts
export const guaritaEventServer = new GuaritaEventHub();
