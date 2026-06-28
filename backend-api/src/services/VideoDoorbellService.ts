import fetch from 'node-fetch';
import { Agent } from 'https';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const httpsAgent = new Agent({ rejectUnauthorized: false });

function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

export interface DoorbellDeviceInfo {
  deviceName?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  macAddress?: string;
}

/**
 * Hikvision DS-KV series video doorbell integration via ISAPI (direct HTTP).
 * Does NOT require HikCentral — connects directly to the device on the local network.
 */
export class VideoDoorbellService {
  static async getDevice(deviceId: string) {
    const device = await prisma.doorbellDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error(`Videoporteiro ${deviceId} não encontrado`);
    if (!device.enabled) throw new Error(`Videoporteiro ${deviceId} está desabilitado`);
    return device;
  }

  /**
   * Capture a JPEG snapshot from the doorbell camera.
   * Uses ISAPI endpoint: GET /ISAPI/Streaming/channels/1/picture
   */
  static async getSnapshot(deviceId: string): Promise<Buffer> {
    const device = await this.getDevice(deviceId);
    const url = `http://${device.ip}:${device.port}/ISAPI/Streaming/channels/1/picture`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: basicAuth(device.username, device.password) },
      // @ts-ignore — node-fetch v2 accepts agent
      agent: httpsAgent,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`ISAPI snapshot falhou: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // JPEG magic bytes: FF D8 FF
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      throw new Error('Resposta não é uma imagem JPEG válida');
    }

    return buffer;
  }

  /**
   * Fetch device info via ISAPI: GET /ISAPI/System/deviceInfo
   */
  static async getDeviceInfo(deviceId: string): Promise<DoorbellDeviceInfo> {
    const device = await this.getDevice(deviceId);
    const url = `http://${device.ip}:${device.port}/ISAPI/System/deviceInfo`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: basicAuth(device.username, device.password),
        Accept: 'application/json',
      },
      // @ts-ignore
      agent: httpsAgent,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`ISAPI deviceInfo falhou: ${response.status} ${response.statusText}`);
    }

    // HikVision ISAPI returns XML by default; try JSON if available
    const text = await response.text();
    const deviceName = text.match(/<deviceName>(.*?)<\/deviceName>/)?.[1];
    const serialNumber = text.match(/<serialNumber>(.*?)<\/serialNumber>/)?.[1];
    const firmwareVersion = text.match(/<firmwareVersion>(.*?)<\/firmwareVersion>/)?.[1];
    const macAddress = text.match(/<macAddress>(.*?)<\/macAddress>/)?.[1];

    return { deviceName, serialNumber, firmwareVersion, macAddress };
  }

  /**
   * Test connectivity to a doorbell device (without saving it).
   */
  static async testConnection(ip: string, port: number, username: string, password: string): Promise<boolean> {
    try {
      const url = `http://${ip}:${port}/ISAPI/System/deviceInfo`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: basicAuth(username, password) },
        // @ts-ignore
        agent: httpsAgent,
        signal: AbortSignal.timeout(5000),
      });
      return response.ok || response.status === 401; // 401 = reachable but bad credentials
    } catch {
      return false;
    }
  }

  /**
   * List all enabled doorbell devices.
   */
  static async listDevices() {
    return prisma.doorbellDevice.findMany({
      where: { enabled: true },
      select: { id: true, name: true, location: true, ip: true, port: true, enabled: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }
}
