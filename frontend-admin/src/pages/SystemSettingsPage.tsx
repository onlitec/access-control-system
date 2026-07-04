import React, { useState, useEffect } from 'react';
import { Settings, Mail, DownloadCloud, Loader2, Send, Save, CheckCircle, AlertTriangle, Globe } from 'lucide-react';
import {
  getSystemSettings,
  updateSystemSettings,
  testSmtp,
  checkForUpdate,
  type SystemSettingsData,
} from '@/services/api';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  marginBottom: '6px',
  fontWeight: 600,
};

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // formulário SMTP
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');

  // teste SMTP
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // acesso remoto (WAN)
  const [accessMode, setAccessMode] = useState<'ip' | 'domain'>('ip');
  const [accessUrlIp, setAccessUrlIp] = useState('');
  const [accessUrlDomain, setAccessUrlDomain] = useState('');

  // atualizações
  const [manifestUrl, setManifestUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<Awaited<ReturnType<typeof checkForUpdate>> | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await getSystemSettings();
      setSettings(data);
      setSmtpHost(data.smtpHost ?? '');
      setSmtpPort(data.smtpPort != null ? String(data.smtpPort) : '');
      setSmtpUser(data.smtpUser ?? '');
      setSmtpFrom(data.smtpFrom ?? '');
      setSmtpFromName(data.smtpFromName ?? '');
      setAccessMode(data.accessMode ?? 'ip');
      setAccessUrlIp(data.accessUrlIp ?? '');
      setAccessUrlDomain(data.accessUrlDomain ?? '');
      setManifestUrl(data.updateManifestUrl ?? '');
    } catch (err: any) {
      setFeedback({ kind: 'err', text: err.message || 'Falha ao carregar as configurações' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      await updateSystemSettings({
        smtpHost,
        smtpPort: smtpPort.trim() ? parseInt(smtpPort, 10) : null,
        smtpUser,
        ...(smtpPassword.trim() ? { smtpPassword } : {}),
        smtpFrom,
        smtpFromName,
        updateManifestUrl: manifestUrl,
        accessMode,
        accessUrlIp,
        accessUrlDomain,
      });
      setSmtpPassword('');
      setFeedback({ kind: 'ok', text: 'Configurações salvas com sucesso.' });
      await loadSettings();
    } catch (err: any) {
      setFeedback({ kind: 'err', text: err.message || 'Falha ao salvar' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSmtp() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testSmtp(testTo.trim() || undefined);
      setTestResult({ kind: 'ok', text: `E-mail de teste enviado para ${result.to}.` });
    } catch (err: any) {
      setTestResult({ kind: 'err', text: err.message || 'Falha no envio do teste' });
    } finally {
      setTesting(false);
    }
  }

  async function handleCheckUpdate() {
    setChecking(true);
    setUpdateError(null);
    setUpdateInfo(null);
    try {
      const info = await checkForUpdate();
      setUpdateInfo(info);
    } catch (err: any) {
      setUpdateError(err.message || 'Falha ao verificar atualização');
    } finally {
      setChecking(false);
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
        <p>Carregando configurações...</p>
      </div>
    );
  }

  const banner = (fb: { kind: 'ok' | 'err'; text: string }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      background: fb.kind === 'ok' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
      border: `1px solid ${fb.kind === 'ok' ? 'var(--green-500)' : 'var(--red-500)'}`,
      color: fb.kind === 'ok' ? 'var(--green-400)' : 'var(--red-400)',
      padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: '0.85rem', marginTop: '12px',
    }}>
      {fb.kind === 'ok' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
      {fb.text}
    </div>
  );

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: '25px' }}>
        <h1><Settings size={24} /> Configurações do Sistema</h1>
        <p>SMTP para envio de e-mails e canal de atualizações — versão instalada: <strong>{settings?.appVersion}</strong></p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        {/* SMTP */}
        <div className="settings-card" style={{ margin: 0 }}>
          <div className="settings-card-header">
            <Mail size={20} />
            <h2>E-mail (SMTP)</h2>
          </div>
          <p className="text-muted" style={{ fontSize: '0.85rem', margin: '10px 0 20px' }}>
            Usado para códigos de verificação e notificações. Campos vazios usam a
            configuração do servidor (.env). Valores efetivos atuais:{' '}
            <code style={{ fontSize: '0.8rem' }}>
              {settings?.effective.user}@{settings?.effective.host}:{settings?.effective.port}
            </code>{' '}(remetente <code style={{ fontSize: '0.8rem' }}>{settings?.effective.from}</code>)
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={labelStyle}>Servidor SMTP</label>
              <input style={inputStyle} value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp-relay.brevo.com" />
            </div>
            <div>
              <label style={labelStyle}>Porta</label>
              <input style={inputStyle} value={smtpPort} onChange={(e) => setSmtpPort(e.target.value.replace(/\D/g, ''))} placeholder="587" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={labelStyle}>Usuário (login SMTP)</label>
              <input style={inputStyle} value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="login@smtp-brevo.com" />
            </div>
            <div>
              <label style={labelStyle}>Senha / chave SMTP</label>
              <input
                style={inputStyle}
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={settings?.smtpPasswordSet ? '••••••••  (mantida)' : 'obrigatória'}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <label style={labelStyle}>Remetente (e-mail validado)</label>
              <input style={inputStyle} value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="contato@seudominio.com.br" />
            </div>
            <div>
              <label style={labelStyle}>Nome do remetente</label>
              <input style={inputStyle} value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="OnliAcesso" />
            </div>
          </div>

          {/* teste */}
          <div style={{ borderTop: '1px solid var(--border-primary)', marginTop: '20px', paddingTop: '15px' }}>
            <label style={labelStyle}>Enviar e-mail de teste para</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input style={{ ...inputStyle, flex: 1 }} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="(vazio = seu e-mail de login)" />
              <button className="btn btn-secondary" onClick={handleTestSmtp} disabled={testing} style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                {testing ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} Testar
              </button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '8px' }}>
              O teste usa a configuração <strong>salva</strong> — salve antes de testar.
            </p>
            {testResult && banner(testResult)}
          </div>
        </div>

        {/* Acesso remoto (WAN) */}
        <div className="settings-card" style={{ margin: 0 }}>
          <div className="settings-card-header">
            <Globe size={20} />
            <h2>Acesso remoto (WAN)</h2>
          </div>
          <p className="text-muted" style={{ fontSize: '0.85rem', margin: '10px 0 20px' }}>
            URL que entra nos links de primeiro acesso e pré-cadastro de visitantes
            enviados a moradores. O instalador grava o IP da rede local (
            <code style={{ fontSize: '0.8rem' }}>{settings?.effectiveAccessUrl}</code> atualmente),
            que geralmente não é alcançável de fora do condomínio — configure aqui o
            IP público (com a porta liberada no roteador) ou um domínio próprio.
          </p>

          <label style={labelStyle}>Como os links devem apontar</label>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <button
              type="button"
              className={accessMode === 'ip' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setAccessMode('ip')}
              style={{ flex: 1 }}
            >
              Por IP
            </button>
            <button
              type="button"
              className={accessMode === 'domain' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setAccessMode('domain')}
              style={{ flex: 1 }}
            >
              Por domínio
            </button>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={labelStyle}>URL de acesso por IP (WAN)</label>
            <input
              style={inputStyle}
              value={accessUrlIp}
              onChange={(e) => setAccessUrlIp(e.target.value)}
              placeholder="https://201.54.12.30:8443"
              disabled={accessMode !== 'ip'}
            />
          </div>
          <div>
            <label style={labelStyle}>URL de acesso por domínio</label>
            <input
              style={inputStyle}
              value={accessUrlDomain}
              onChange={(e) => setAccessUrlDomain(e.target.value)}
              placeholder="https://acesso.meucondominio.com.br"
              disabled={accessMode !== 'domain'}
            />
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '12px' }}>
            Deixe em branco o campo do modo escolhido para voltar a usar o IP local
            detectado pelo instalador.
          </p>
        </div>

        {/* Atualizações */}
        <div className="settings-card" style={{ margin: 0 }}>
          <div className="settings-card-header">
            <DownloadCloud size={20} />
            <h2>Atualizações</h2>
          </div>
          <p className="text-muted" style={{ fontSize: '0.85rem', margin: '10px 0 20px' }}>
            URL do manifesto de versões (JSON com <code>version</code>, <code>url</code>,{' '}
            <code>sha256</code> e <code>notes</code>). Sem a URL, a verificação fica desativada.
          </p>

          <label style={labelStyle}>URL do manifesto</label>
          <input style={inputStyle} value={manifestUrl} onChange={(e) => setManifestUrl(e.target.value)} placeholder="https://exemplo.com.br/onliacesso/latest.json" />

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px' }}>
            <button className="btn btn-secondary" onClick={handleCheckUpdate} disabled={checking} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {checking ? <Loader2 className="animate-spin" size={14} /> : <DownloadCloud size={14} />} Verificar agora
            </button>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>
              Versão instalada: <strong>{settings?.appVersion}</strong>
            </span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '8px' }}>
            A verificação usa a URL <strong>salva</strong> — salve antes de verificar.
          </p>

          {updateError && banner({ kind: 'err', text: updateError })}
          {updateInfo && (
            <div style={{
              marginTop: '15px', padding: '15px',
              background: updateInfo.updateAvailable ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.08)',
              border: `1px solid ${updateInfo.updateAvailable ? 'var(--blue-500)' : 'var(--green-500)'}`,
              borderRadius: 'var(--radius)', fontSize: '0.9rem',
            }}>
              {updateInfo.updateAvailable ? (
                <>
                  <strong style={{ color: 'var(--blue-400)' }}>
                    Nova versão disponível: {updateInfo.latestVersion}
                  </strong>
                  {updateInfo.notes && (
                    <p style={{ margin: '8px 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{updateInfo.notes}</p>
                  )}
                  {updateInfo.downloadUrl && (
                    <a href={updateInfo.downloadUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                      <DownloadCloud size={14} /> Baixar instalador
                    </a>
                  )}
                  {updateInfo.sha256 && (
                    <p className="text-muted" style={{ fontSize: '0.7rem', marginTop: '8px', wordBreak: 'break-all' }}>SHA256: {updateInfo.sha256}</p>
                  )}
                </>
              ) : (
                <strong style={{ color: 'var(--green-400)' }}>
                  Sistema atualizado (versão {updateInfo.currentVersion}).
                </strong>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Salvar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '25px' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Salvar configurações
        </button>
        {feedback && <div style={{ flex: 1 }}>{banner(feedback)}</div>}
      </div>
    </div>
  );
}
