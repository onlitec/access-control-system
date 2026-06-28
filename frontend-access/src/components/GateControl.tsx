import React, { useEffect, useState } from 'react';
import { DoorOpen, DoorClosed, Loader2, AlertTriangle, WifiOff } from 'lucide-react';

interface GuaritaDevice {
  id: string;
  name: string;
  location?: string;
  enabled: boolean;
}

const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/api';

function getToken(): string {
  return localStorage.getItem('token') || localStorage.getItem('auth_token') || '';
}

export function GateControl() {
  const [devices, setDevices] = useState<GuaritaDevice[]>([]);
  const [sdkAvailable, setSdkAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`${API_BASE}/guarita/devices`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setDevices(data.devices ?? []);
        setSdkAvailable(data.sdkAvailable ?? false);
      })
      .catch(() => setDevices([]))
      .finally(() => setLoading(false));
  }, []);

  async function triggerGate(deviceId: string, action: 'open' | 'close') {
    setActionLoading(`${deviceId}-${action}`);
    setMessages((m) => ({ ...m, [deviceId]: '' }));
    try {
      const res = await fetch(`${API_BASE}/guarita/devices/${deviceId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => ({ ...m, [deviceId]: data.error ?? 'Erro desconhecido' }));
      } else {
        setMessages((m) => ({ ...m, [deviceId]: action === 'open' ? 'Portão aberto!' : 'Portão fechado!' }));
        setTimeout(() => setMessages((m) => ({ ...m, [deviceId]: '' })), 3000);
      }
    } catch (err: any) {
      setMessages((m) => ({ ...m, [deviceId]: err.message }));
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return null;
  if (devices.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium uppercase tracking-wide">
        <DoorOpen className="h-3.5 w-3.5" />
        Controle de Portão
        {!sdkAvailable && (
          <span className="ml-auto text-xs text-amber-500 flex items-center gap-1 normal-case tracking-normal">
            <WifiOff className="h-3 w-3" /> SDK pendente
          </span>
        )}
      </div>

      {!sdkAvailable && (
        <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Integração Nice Guarita IP em implantação. Os botões ficarão ativos quando o SDK estiver disponível.
        </div>
      )}

      <div className="grid gap-2">
        {devices.map((device) => (
          <div
            key={device.id}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{device.name}</p>
                {device.location && <p className="text-xs text-zinc-500">{device.location}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => triggerGate(device.id, 'open')}
                  disabled={!sdkAvailable || actionLoading !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700/20 text-emerald-400 border border-emerald-700/40 text-xs font-medium hover:bg-emerald-700/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {actionLoading === `${device.id}-open`
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <DoorOpen className="h-3.5 w-3.5" />}
                  Abrir
                </button>
                <button
                  type="button"
                  onClick={() => triggerGate(device.id, 'close')}
                  disabled={!sdkAvailable || actionLoading !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/20 text-red-400 border border-red-800/40 text-xs font-medium hover:bg-red-900/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {actionLoading === `${device.id}-close`
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <DoorClosed className="h-3.5 w-3.5" />}
                  Fechar
                </button>
              </div>
            </div>

            {messages[device.id] && (
              <p className="text-xs text-zinc-400 border-t border-zinc-800 pt-2">
                {messages[device.id]}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
