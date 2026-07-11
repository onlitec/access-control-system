import React, { useEffect, useState } from 'react';
import { Camera, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

interface CaptureDevice {
  key: string;          // `${source}:${id}` — único entre as duas fontes
  id: string;
  name: string;
  location?: string;
  source: 'doorbell' | 'facial';
}

interface Props {
  /** Called with a data URL (data:image/jpeg;base64,...) when a snapshot is captured */
  onCapture: (dataUrl: string) => void;
  className?: string;
}

const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/api';

function getToken(): string {
  return localStorage.getItem('token') || localStorage.getItem('auth_token') || '';
}

const SOURCE_LABEL: Record<CaptureDevice['source'], string> = {
  doorbell: 'Videoporteiro',
  facial: 'Terminal Facial',
};

function snapshotUrl(device: CaptureDevice): string {
  return device.source === 'facial'
    ? `${API_BASE}/facial-access/devices/${device.id}/snapshot`
    : `${API_BASE}/doorbell/devices/${device.id}/snapshot`;
}

export function DoorbellCapture({ onCapture, className = '' }: Props) {
  const [devices, setDevices] = useState<CaptureDevice[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${getToken()}` };
    Promise.all([
      fetch(`${API_BASE}/doorbell/devices`, { headers })
        .then((r) => r.json())
        .then((data) => (data.devices ?? []).map((d: any): CaptureDevice => ({
          key: `doorbell:${d.id}`, id: d.id, name: d.name, location: d.location, source: 'doorbell',
        })))
        .catch(() => [] as CaptureDevice[]),
      fetch(`${API_BASE}/facial-access/devices`, { headers })
        .then((r) => r.json())
        .then((data) => (data.devices ?? [])
          .filter((d: any) => d.enabled !== false)
          .map((d: any): CaptureDevice => ({
            key: `facial:${d.id}`, id: d.id, name: d.name, location: d.location, source: 'facial',
          })))
        .catch(() => [] as CaptureDevice[]),
    ]).then(([doorbells, facials]) => {
      const list = [...doorbells, ...facials];
      setDevices(list);
      if (list.length === 1) setSelectedKey(list[0].key);
    });
  }, []);

  async function capture() {
    const device = devices.find((d) => d.key === selectedKey);
    if (!device) return;
    setLoading(true);
    setError('');
    setCaptured(false);

    try {
      const res = await fetch(snapshotUrl(device), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Falha ${res.status}`);
      }

      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      setPreview(dataUrl);
      setCaptured(true);
      onCapture(dataUrl);
    } catch (err: any) {
      setError(err.message || 'Erro ao capturar snapshot');
    } finally {
      setLoading(false);
    }
  }

  if (devices.length === 0) return null;

  const optionLabel = (d: CaptureDevice) =>
    `${SOURCE_LABEL[d.source]} — ${d.name}${d.location ? ` (${d.location})` : ''}`;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium">
        <Camera className="h-3.5 w-3.5" />
        Capturar do dispositivo
      </div>

      <div className="flex gap-2">
        {devices.length > 1 && (
          <select
            value={selectedKey}
            onChange={(e) => { setSelectedKey(e.target.value); setPreview(null); setCaptured(false); }}
            className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="">Selecionar dispositivo...</option>
            {devices.map((d) => (
              <option key={d.key} value={d.key}>
                {optionLabel(d)}
              </option>
            ))}
          </select>
        )}
        {devices.length === 1 && (
          <span className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-400">
            {optionLabel(devices[0])}
          </span>
        )}

        <button
          type="button"
          onClick={capture}
          disabled={!selectedKey || loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {loading ? 'Capturando...' : 'Capturar'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {preview && (
        <div className="relative">
          <img
            src={preview}
            alt="Snapshot do dispositivo"
            className="w-full max-h-48 object-cover rounded-lg border border-zinc-700"
          />
          {captured && (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-900/80 text-emerald-400 text-xs px-2 py-1 rounded-full">
              <CheckCircle className="h-3 w-3" />
              Foto usada
            </div>
          )}
          <button
            type="button"
            onClick={capture}
            disabled={loading}
            className="absolute bottom-2 right-2 flex items-center gap-1 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-full transition-colors disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" /> Nova
          </button>
        </div>
      )}
    </div>
  );
}
