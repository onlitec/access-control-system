import { PrismaClient } from '@prisma/client';
import { digestFetch } from '../utils/digest-fetch.utils';

const prisma = new PrismaClient();

/**
 * Terminais faciais standalone (DS-K1T673) e controladoras (DS-K2812) Hikvision,
 * via ISAPI (HTTP + Digest MD5) — sem depender de HikCentral. Ver
 * docs/LEITORES-FACIAIS/PLANO-INTEGRACAO-LEITORES-FACIAIS.md.
 *
 * Fase 1 (atual): cadastro (CRUD) e teste de conectividade. Os endpoints ISAPI
 * de cadastro de face e o mecanismo de push de eventos ainda não foram
 * confirmados com o equipamento físico (seção 7 do plano) — enrollFace/eventos
 * ficam para uma fase seguinte, quando o hardware estiver na rede.
 */
export class FacialAccessService {
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

  static async listDevices() {
    return prisma.facialAccessDevice.findMany({
      include: { doors: { include: { readers: true }, orderBy: { doorNo: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }
}
