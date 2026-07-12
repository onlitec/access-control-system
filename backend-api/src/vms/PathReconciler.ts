import { prisma } from '../database';
import { MediaMtxClient, MtxPathConf } from './MediaMtxClient';
import { buildStreamUrls, subPathName } from './rtsp';
import { VMS_PORT, VMS_INTERNAL_TOKEN, VMS_ALWAYS_ON } from './config';

/**
 * Hook executado pelo MediaMTX ao fechar cada segmento de gravação.
 *
 * O MediaMTX NÃO roda o comando através de um shell: ele o executa direto,
 * passando MTX_PATH/MTX_SEGMENTPATH como variáveis de ambiente. Sem shell não
 * há ninguém para expandir `%VAR%` — o hook chegava ao vms-service com a string
 * literal "%MTX_PATH%" e o segmento era descartado ("path desconhecido"), então
 * o upload só acontecia pela varredura de reserva (a cada 5 min). Invocando via
 * `cmd.exe /C` no Windows (e `sh -c` no POSIX) a expansão volta a acontecer.
 */
function segmentCompleteHook(): string {
  const isWin = process.platform === 'win32';
  const pathVar = isWin ? '%MTX_PATH%' : '$MTX_PATH';
  const fileVar = isWin ? '%MTX_SEGMENTPATH%' : '$MTX_SEGMENTPATH';
  const curl = isWin ? 'curl.exe' : 'curl';

  const post = `${curl} -s -m 10 -X POST http://127.0.0.1:${VMS_PORT}/internal/segment-complete `
    + `-H "x-vms-token: ${VMS_INTERNAL_TOKEN}" `
    + `--data-urlencode "path=${pathVar}" --data-urlencode "file=${fileVar}"`;

  return isWin ? `cmd.exe /C ${post}` : `sh -c '${post}'`;
}

/**
 * Sincroniza os paths do MediaMTX com o banco (video_devices/video_channels):
 * cria os que faltam, corrige source divergente e remove os órfãos. Todos os
 * paths configurados no MediaMTX são de propriedade do VMS (o yml base não
 * define nenhum path estático).
 *
 * record/sourceOnDemand são geridos pelo RecordingScheduler — aqui só se
 * definem os valores iniciais (on-demand, sem gravação) na criação do path.
 */
export class PathReconciler {
  constructor(private mtx: MediaMtxClient) {}

  async reconcile(): Promise<void> {
    const devices = await prisma.videoDevice.findMany({
      where: { enabled: true },
      include: { channels: { where: { enabled: true } } },
    });

    const desired = new Map<string, string>(); // pathName -> source RTSP
    for (const device of devices) {
      for (const channel of device.channels) {
        const urls = buildStreamUrls(device, channel);
        if (!urls.main) {
          console.warn(`[VMS] Canal ${channel.name} (${channel.streamPath}) sem URL RTSP — cadastre a URL manual`);
          continue;
        }
        desired.set(channel.streamPath, urls.main);
        if (urls.sub && urls.sub !== urls.main) {
          desired.set(subPathName(channel.streamPath), urls.sub);
        }
      }
    }

    const existing = await this.mtx.listConfigPaths();
    const existingByName = new Map(existing.map((p) => [p.name, p]));

    for (const p of existing) {
      if (!desired.has(p.name)) {
        try {
          await this.mtx.deletePath(p.name);
          console.log(`[VMS] Path removido do MediaMTX: ${p.name}`);
        } catch (err: any) {
          console.error(`[VMS] Falha ao remover path ${p.name}: ${err.message}`);
        }
      }
    }

    const hook = segmentCompleteHook();
    for (const [name, source] of desired) {
      const current = existingByName.get(name);
      // sourceOnDemand=false mantém a câmera conectada o tempo todo: quando o
      // operador abre o app, o vídeo já está fluindo (sem esperar o RTSP subir
      // e o primeiro keyframe chegar)
      const onDemand = !VMS_ALWAYS_ON;
      const conf: MtxPathConf = {
        source,
        rtspTransport: 'tcp',
        runOnRecordSegmentComplete: hook,
      };
      try {
        if (!current) {
          await this.mtx.addPath(name, { ...conf, sourceOnDemand: onDemand, record: false });
          console.log(`[VMS] Path criado no MediaMTX: ${name}${onDemand ? '' : ' (sempre conectado)'}`);
        } else if (
          current.source !== source
          || current.runOnRecordSegmentComplete !== hook
          || (VMS_ALWAYS_ON && current.sourceOnDemand)
        ) {
          await this.mtx.patchPath(name, { ...conf, ...(VMS_ALWAYS_ON ? { sourceOnDemand: false } : {}) });
          console.log(`[VMS] Path atualizado no MediaMTX: ${name}`);
        }
      } catch (err: any) {
        console.error(`[VMS] Falha ao sincronizar path ${name}: ${err.message}`);
      }
    }
  }
}
