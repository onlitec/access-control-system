import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type GateStatus = 'open' | 'closed' | 'unknown';

/**
 * Nice Guarita IP — gate/barrier control service.
 * Implementation is PENDING until the Nice SDK is received.
 * All control methods throw a ServiceUnavailableError until then.
 */
export class ServiceUnavailableError extends Error {
  readonly code = 'SDK_UNAVAILABLE';
  constructor(feature: string) {
    super(`Nice Guarita IP: funcionalidade "${feature}" aguardando SDK. Contate o suporte Nice.`);
  }
}

export class NiceGuaritaService {
  static async listDevices() {
    return prisma.guaritaDevice.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, ip: true, port: true, location: true, enabled: true, createdAt: true },
    });
  }

  static async getDevice(deviceId: string) {
    const device = await prisma.guaritaDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error(`Dispositivo Guarita ${deviceId} não encontrado`);
    return device;
  }

  /**
   * Open the gate/barrier for a given device.
   * TODO: implement using Nice Guarita IP SDK when available.
   */
  static async openGate(_deviceId: string): Promise<void> {
    throw new ServiceUnavailableError('openGate');
  }

  /**
   * Close the gate/barrier.
   * TODO: implement using Nice Guarita IP SDK when available.
   */
  static async closeGate(_deviceId: string): Promise<void> {
    throw new ServiceUnavailableError('closeGate');
  }

  /**
   * Query current gate status.
   * Returns 'unknown' until SDK is available.
   */
  static async getGateStatus(_deviceId: string): Promise<GateStatus> {
    return 'unknown';
  }

  static isSdkAvailable(): boolean {
    return false;
  }
}
