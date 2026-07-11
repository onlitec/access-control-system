import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/services/api';
import {
  HardDrive, Cloud, Plus, Trash2, X, Loader2, CheckCircle2,
  AlertTriangle, RefreshCw, ExternalLink, UploadCloud,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface StorageDestination {
  id: string;
  name: string;
  kind: string;
  rcloneType: string | null;
  rcloneRemote: string | null;
  remoteBasePath: string | null;
  uploadMode: string;
  enabled: boolean;
  queue: Record<string, number>;
  _testStatus?: 'checking' | 'ok' | 'fail';
  _testError?: string;
}

const TYPE_LABEL: Record<string, string> = {
  drive: 'Google Drive',
  onedrive: 'Microsoft OneDrive',
  smb: 'Pasta compartilhada (SMB/Samba)',
  ftp: 'Servidor FTP',
  sftp: 'Servidor SFTP',
};

const OAUTH_TYPES = ['drive', 'onedrive'];

interface StorageUsage {
  segments: number;
  usedGb: number;
  freeGb: number | null;
  totalGb: number | null;
  minFreeGb: number;
  critical: boolean;
  low: boolean;
  recordingsDir: string;
}

const emptyForm = {
  name: '', rcloneType: 'smb', remoteBasePath: '', uploadMode: 'copy',
  host: '', user: '', pass: '', port: '', domain: '',
  oauthMode: 'server' as 'server' | 'paste',
  pastedToken: '',
};

// ── Main Component ──────────────────────────────────────────────────────────

export default function VmsStoragePage() {
  const [destinations, setDestinations] = useState<StorageDestination[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // fluxo OAuth iniciado no servidor
  const [oauthSession, setOauthSession] = useState<{ sessionId: string; authUrl: string | null } | null>(null);
  const [oauthWaiting, setOauthWaiting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [dest, use] = await Promise.all([
        apiFetch<{ destinations: StorageDestination[] }>('/vms/storage'),
        apiFetch<StorageUsage>('/vms/storage-usage').catch(() => null),
      ]);
      setDestinations(dest.destinations ?? []);
      setUsage(use);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar destinos');
    } finally { setLoading(false); }
  }

  const isOauth = OAUTH_TYPES.includes(form.rcloneType);

  async function addNonOauth() {
    setSaving(true); setError('');
    try {
      await apiFetch('/vms/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          rcloneType: form.rcloneType,
          remoteBasePath: form.remoteBasePath || null,
          uploadMode: form.uploadMode,
          params: {
            host: form.host || undefined,
            user: form.user || undefined,
            pass: form.pass || undefined,
            port: form.port || undefined,
            domain: form.rcloneType === 'smb' ? (form.domain || undefined) : undefined,
          },
        }),
      });
      setForm(emptyForm); setShowForm(false);
      await load();
    } catch (err: any) { setError(err.message || 'Erro ao criar destino'); }
    finally { setSaving(false); }
  }

  async function startOauth() {
    setSaving(true); setError(''); setOauthSession(null);
    try {
      const data = await apiFetch<{ sessionId: string; authUrl: string | null }>('/vms/storage/oauth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rcloneType: form.rcloneType }),
      });
      setOauthSession(data);
      setOauthWaiting(true);
      // aguarda o admin concluir a autorização no navegador do servidor
      pollRef.current = setInterval(async () => {
        try {
          const st = await apiFetch<{ hasToken: boolean; error: string | null }>(`/vms/storage/oauth/status/${data.sessionId}`);
          if (st.error) {
            setError(st.error); setOauthWaiting(false);
            if (pollRef.current) clearInterval(pollRef.current);
          } else if (st.hasToken) {
            if (pollRef.current) clearInterval(pollRef.current);
            await finishOauth(data.sessionId, null);
          }
        } catch {
          setOauthWaiting(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 3000);
    } catch (err: any) { setError(err.message || 'Erro ao iniciar OAuth'); }
    finally { setSaving(false); }
  }

  async function finishOauth(sessionId: string | null, token: string | null) {
    setSaving(true); setError('');
    try {
      await apiFetch('/vms/storage/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          rcloneType: form.rcloneType,
          remoteBasePath: form.remoteBasePath || null,
          uploadMode: form.uploadMode,
          sessionId: sessionId || undefined,
          token: token || undefined,
        }),
      });
      setForm(emptyForm); setShowForm(false); setOauthSession(null); setOauthWaiting(false);
      await load();
    } catch (err: any) { setError(err.message || 'Erro ao concluir OAuth'); }
    finally { setSaving(false); }
  }

  async function toggleDestination(dest: StorageDestination) {
    await apiFetch(`/vms/storage/${dest.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !dest.enabled }),
    });
    await load();
  }

  async function removeDestination(id: string) {
    if (!confirm('Remover este destino? Os uploads pendentes serão descartados (arquivos já enviados permanecem no destino).')) return;
    await apiFetch(`/vms/storage/${id}`, { method: 'DELETE' });
    await load();
  }

  /**
   * Enfileira as gravações que já estão no disco. Necessário porque o upload é
   * criado no momento em que a gravação é indexada — um destino cadastrado hoje
   * não receberia nada do que já foi gravado antes.
   */
  async function backfill(dest: StorageDestination) {
    if (!confirm(`Enviar para "${dest.name}" todas as gravações que já estão no servidor?`)) return;
    try {
      const data = await apiFetch<{ queued: number }>(`/vms/storage/${dest.id}/backfill`, { method: 'POST' });
      alert(data.queued > 0
        ? `${data.queued} gravação(ões) na fila de envio. O upload acontece em segundo plano.`
        : 'Nenhuma gravação nova para enviar (todas já estão na fila ou enviadas).');
      await load();
    } catch (err: any) {
      setError(err.message || 'Erro ao enfileirar gravações');
    }
  }

  async function testDestination(dest: StorageDestination) {
    setDestinations((list) => list.map((d) => (d.id === dest.id ? { ...d, _testStatus: 'checking' } : d)));
    try {
      const data = await apiFetch<{ reachable: boolean; error?: string }>(`/vms/storage/${dest.id}/test`, { method: 'POST' });
      setDestinations((list) => list.map((d) => (d.id === dest.id ? { ...d, _testStatus: data.reachable ? 'ok' : 'fail', _testError: data.error } : d)));
    } catch (err: any) {
      setDestinations((list) => list.map((d) => (d.id === dest.id ? { ...d, _testStatus: 'fail', _testError: err.message } : d)));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1><HardDrive size={24} /> Armazenamento de Gravações</h1>
          <p>Além do disco local, as gravações podem ser enviadas para Google Drive, OneDrive, pasta compartilhada (SMB/Samba), FTP ou SFTP</p>
        </div>
        <button
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={() => { setShowForm(!showForm); setOauthSession(null); setOauthWaiting(false); }}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Cancelar' : 'Adicionar destino'}
        </button>
      </div>

      {error && (
        <div style={alertStyle('error')}><AlertTriangle size={16} /><span>{error}</span></div>
      )}

      {/* ── Uso do disco local — encher o disco trava a gravação e o sistema ── */}
      {usage && (
        <div className="settings-card" style={{ margin: '15px 0 0', padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--blue-400)', display: 'inline-flex' }}>
                <HardDrive size={18} />
              </div>
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem' }}>Disco local das gravações</strong>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {usage.segments} segmento(s) · {usage.usedGb} GB gravados
                  {usage.freeGb !== null && usage.totalGb !== null
                    ? ` · ${usage.freeGb} GB livres de ${usage.totalGb} GB`
                    : ''}
                  {' · '}{usage.recordingsDir}
                </span>
              </div>
            </div>
            {usage.critical ? (
              <span style={{ ...alertStyle('error'), marginTop: 0 }}>
                <AlertTriangle size={16} />
                Disco quase cheio — a gravação está PAUSADA automaticamente. Libere espaço ou ative um destino remoto no modo "mover".
              </span>
            ) : usage.low ? (
              <span style={{ ...alertStyle('error'), marginTop: 0, background: 'rgba(234, 179, 8, 0.12)', color: 'var(--yellow-400, #facc15)', borderColor: 'rgba(234, 179, 8, 0.3)' }}>
                <AlertTriangle size={16} />
                Espaço abaixo do mínimo ({usage.minFreeGb} GB) — gravações antigas serão apagadas automaticamente.
              </span>
            ) : (
              <span style={{ ...alertStyle('success'), marginTop: 0 }}>
                <CheckCircle2 size={16} />
                Espaço saudável (mínimo garantido: {usage.minFreeGb} GB)
              </span>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div style={formBoxStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
            <Field label="Nome do destino"><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Drive do síndico" style={inputStyle} /></Field>
            <Field label="Tipo">
              <select value={form.rcloneType} onChange={(e) => setForm((f) => ({ ...f, rcloneType: e.target.value }))} style={inputStyle}>
                {Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Pasta base no destino"><input value={form.remoteBasePath} onChange={(e) => setForm((f) => ({ ...f, remoteBasePath: e.target.value }))} placeholder="onliacesso-vms" style={inputStyle} /></Field>
            <Field label="Após o upload">
              <select value={form.uploadMode} onChange={(e) => setForm((f) => ({ ...f, uploadMode: e.target.value }))} style={inputStyle}>
                <option value="copy">Manter cópia local (copy)</option>
                <option value="move">Liberar disco local (move)</option>
              </select>
            </Field>
          </div>

          {!isOauth ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                <Field label={form.rcloneType === 'smb' ? 'Servidor (host)' : 'Host'}><input value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} placeholder="192.168.1.10" style={inputStyle} /></Field>
                <Field label="Usuário"><input value={form.user} onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))} style={inputStyle} /></Field>
                <Field label="Senha"><input type="password" value={form.pass} onChange={(e) => setForm((f) => ({ ...f, pass: e.target.value }))} style={inputStyle} /></Field>
                <Field label="Porta (opcional)"><input value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} style={inputStyle} /></Field>
                {form.rcloneType === 'smb' && (
                  <Field label="Domínio (opcional)"><input value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} style={inputStyle} /></Field>
                )}
              </div>
              {form.rcloneType === 'smb' && (
                <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                  Na "Pasta base" informe <code>nome-do-compartilhamento/subpasta</code> (ex.: <code>gravacoes/condominio</code>).
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={addNonOauth} disabled={saving || !form.name || !form.host} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                  Salvar destino
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="radio" checked={form.oauthMode === 'server'} onChange={() => setForm((f) => ({ ...f, oauthMode: 'server' }))} />
                  Autorizar neste servidor (abre link)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="radio" checked={form.oauthMode === 'paste'} onChange={() => setForm((f) => ({ ...f, oauthMode: 'paste' }))} />
                  Colar token gerado em outra máquina
                </label>
              </div>

              {form.oauthMode === 'server' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {!oauthSession ? (
                    <div>
                      <button onClick={startOauth} disabled={saving || !form.name} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {saving ? <Loader2 className="animate-spin" size={14} /> : <Cloud size={14} />}
                        Iniciar autorização {TYPE_LABEL[form.rcloneType]}
                      </button>
                      <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '8px' }}>
                        Importante: o link de autorização só funciona num navegador aberto NA MÁQUINA DO SERVIDOR
                        (o retorno do OAuth vai para 127.0.0.1 do servidor). Se o servidor não tem navegador, use "Colar token".
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {oauthSession.authUrl && (
                        <a href={oauthSession.authUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content' }}>
                          <ExternalLink size={14} /> Abrir página de autorização
                        </a>
                      )}
                      {oauthWaiting && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          <Loader2 className="animate-spin" size={14} /> Aguardando autorização no navegador… o destino será criado automaticamente.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                    Em qualquer computador com o rclone instalado, rode <code>rclone authorize "{form.rcloneType}"</code>,
                    conclua o login no navegador e cole abaixo o bloco JSON exibido entre <code>---&gt;</code> e <code>&lt;---End paste</code>.
                  </p>
                  <textarea
                    value={form.pastedToken}
                    onChange={(e) => setForm((f) => ({ ...f, pastedToken: e.target.value }))}
                    placeholder='{"access_token":"...","token_type":"Bearer",...}'
                    rows={4}
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.8rem' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => finishOauth(null, form.pastedToken)} disabled={saving || !form.name || !form.pastedToken} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                      Salvar destino
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
        {loading ? (
          <Loading label="Carregando destinos..." />
        ) : destinations.length === 0 ? (
          <EmptyState label="Nenhum destino remoto configurado — as gravações ficam apenas no disco local do servidor." />
        ) : (
          destinations.map((dest) => (
            <div key={dest.id} style={deviceRowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.12)', color: 'var(--green-400)', display: 'inline-flex' }}>
                  <Cloud size={18} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '0.95rem' }}>{dest.name}</strong>
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                    {TYPE_LABEL[dest.rcloneType ?? ''] ?? dest.rcloneType} · {dest.uploadMode === 'move' ? 'libera disco local' : 'mantém cópia local'}
                    {dest.remoteBasePath ? ` · pasta: ${dest.remoteBasePath}` : ''}
                    {' · fila: '}
                    {(dest.queue.pending ?? 0) + (dest.queue.uploading ?? 0)} pendente(s), {dest.queue.done ?? 0} enviado(s), {dest.queue.failed ?? 0} com falha
                  </span>
                  {dest._testStatus === 'fail' && dest._testError && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--red-400)', display: 'block' }}>{dest._testError}</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {dest._testStatus === 'checking' ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : dest._testStatus === 'ok' ? (
                  <CheckCircle2 size={16} style={{ color: 'var(--green-400)' }} />
                ) : dest._testStatus === 'fail' ? (
                  <AlertTriangle size={16} style={{ color: 'var(--red-400)' }} />
                ) : null}
                <button onClick={() => testDestination(dest)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <RefreshCw size={12} /> Testar
                </button>
                <button
                  onClick={() => backfill(dest)}
                  className="btn btn-secondary"
                  title="Enviar as gravações que já estão no servidor (o envio automático só vale para as novas)"
                  style={{ padding: '4px 10px', fontSize: '0.75rem', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <UploadCloud size={12} /> Enviar existentes
                </button>
                <StatusBadge enabled={dest.enabled} enabledLabel="Ativo" disabledLabel="Pausado" />
                <button onClick={() => toggleDestination(dest)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', minWidth: 'auto' }}>{dest.enabled ? 'Pausar' : 'Ativar'}</button>
                <button onClick={() => removeDestination(dest.id)} className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto', color: 'var(--red-400)', borderColor: 'rgba(239, 68, 68, 0.2)' }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Small helpers (mesmo padrão da IntegrationsPage) ────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  width: '100%',
  boxSizing: 'border-box',
};

const formBoxStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  padding: '20px',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border-primary)',
  display: 'flex',
  flexDirection: 'column',
  gap: '15px',
  marginTop: '15px',
};

const deviceRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 18px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-sm)',
};

function alertStyle(variant: 'success' | 'error'): React.CSSProperties {
  const color = variant === 'success' ? '34, 197, 94' : '239, 68, 68';
  return {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '10px 15px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem',
    background: `rgba(${color}, 0.12)`,
    color: variant === 'success' ? 'var(--green-400)' : 'var(--red-400)',
    border: `1px solid rgba(${color}, 0.3)`,
    marginTop: '15px',
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label className="text-muted" style={{ fontSize: '0.8rem' }}>{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ enabled, enabledLabel, disabledLabel }: { enabled: boolean; enabledLabel: string; disabledLabel: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, borderRadius: '4px',
      background: enabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)',
      color: enabled ? 'var(--green-400)' : 'var(--text-muted)',
      border: `1px solid ${enabled ? 'rgba(34, 197, 94, 0.3)' : 'rgba(100, 116, 139, 0.3)'}`,
    }}>
      {enabled ? enabledLabel : disabledLabel}
    </span>
  );
}

function Loading({ label }: { label: string }) {
  return <div style={{ color: 'var(--text-muted)', display: 'flex', gap: '10px', alignItems: 'center' }}><Loader2 className="animate-spin" size={16} /> {label}</div>;
}

function EmptyState({ label }: { label: string }) {
  return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', margin: 0 }}>{label}</p>;
}
