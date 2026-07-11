import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { authRequest } from '@/services/authApi';
import { LivePlayer } from '@/components/vms/LivePlayer';
import { RecordingDot, type ChannelStatus } from '@/pages/LiveWallPage';

interface VmsChannel { id: string; name: string; streamPath: string; enabled: boolean }
interface VmsDevice { id: string; name: string; enabled: boolean; channels: VmsChannel[] }

/**
 * Janela destacada de uma câmera (aberta via window.open como popup, sem
 * barras do navegador). Ocupa a janela inteira; duplo clique alterna a tela
 * cheia real (sem borda nenhuma). Rota fora do AppLayout — ver App.tsx.
 */
export default function CameraPopupPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const [channel, setChannel] = useState<{ name: string; deviceName: string; streamPath: string } | null>(null);
  const [status, setStatus] = useState<ChannelStatus | undefined>();
  const [error, setError] = useState('');

  useEffect(() => {
    authRequest<{ devices: VmsDevice[] }>('/vms/devices')
      .then((data) => {
        for (const device of data.devices || []) {
          const ch = device.channels.find((c) => c.id === channelId);
          if (ch) {
            setChannel({ name: ch.name, deviceName: device.name, streamPath: ch.streamPath });
            document.title = `${ch.name} — OnliAcesso`;
            return;
          }
        }
        setError('Câmera não encontrada');
      })
      .catch((err) => setError(err.message || 'Erro ao carregar câmera'));
  }, [channelId]);

  const loadStatus = useCallback(async () => {
    if (!channelId) return;
    try {
      const data = await authRequest<{ channels: ChannelStatus[] }>('/vms/live-status');
      setStatus((data.channels || []).find((s) => s.channelId === channelId));
    } catch { /* mantém último estado */ }
  }, [channelId]);

  useEffect(() => {
    void loadStatus();
    const timer = setInterval(() => { void loadStatus(); }, 10_000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => { /* bloqueado */ });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black select-none"
      title="Duplo clique: tela cheia"
      onDoubleClick={toggleFullscreen}
    >
      {error ? (
        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">{error}</div>
      ) : channel ? (
        <>
          <LivePlayer
            streamPath={channel.streamPath}
            label={`${channel.name} — ${channel.deviceName}`}
            labelPosition="right"
            className="w-full h-full"
          />
          <span className="absolute top-2 right-2 z-10">
            <RecordingDot status={status} />
          </span>
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">Carregando…</div>
      )}
    </div>
  );
}
