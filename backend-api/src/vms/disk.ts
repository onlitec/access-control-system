import { promises as fs } from 'fs';
import { VMS_RECORDINGS_DIR, VMS_MIN_FREE_GB } from './config';

const GB = 1024 * 1024 * 1024;

export interface DiskInfo {
  freeBytes: number;
  totalBytes: number;
  freeGb: number;
}

/** Espaço livre no volume das gravações (null se o SO não informar). */
export async function getDiskInfo(dir: string = VMS_RECORDINGS_DIR): Promise<DiskInfo | null> {
  try {
    const st = await fs.statfs(dir);
    const freeBytes = Number(st.bavail) * Number(st.bsize);
    const totalBytes = Number(st.blocks) * Number(st.bsize);
    return { freeBytes, totalBytes, freeGb: freeBytes / GB };
  } catch {
    return null;
  }
}

/**
 * Disco criticamente cheio: abaixo de METADE do mínimo configurado nem a
 * limpeza dá conta — a gravação precisa parar até haver espaço.
 */
export async function isDiskCritical(): Promise<boolean> {
  const info = await getDiskInfo();
  if (!info) return false; // sem informação, não bloqueia a gravação
  return info.freeGb < VMS_MIN_FREE_GB / 2;
}
