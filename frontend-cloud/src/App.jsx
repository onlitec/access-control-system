import React, { useState, useEffect, useCallback } from 'react';
import { Camera, Lock, User, LogOut, RefreshCw, AlertCircle, MonitorPlay, Film, Building2 } from 'lucide-react';
import LiveView from './views/LiveView';
import PlaybackView from './views/PlaybackView';
import InstallButton from './components/InstallButton';
import ThemeToggle from './components/ThemeToggle';
import { login, clearSession, getToken, getUser, authFetch, ensureFreshToken } from './auth';
import { getTenant, setTenant, normalizeSlug, tenantKey } from './tenant';
import './index.css';

/**
 * Onlitec Cloud — visualização remota das câmeras, no formato de um VMS/NVR:
 * navegação lateral (Ao vivo / Reprodução), árvore de câmeras e mosaico.
 *
 * Autenticação real contra o backend do OnliAcesso (mesmos usuários do painel),
 * com sessão persistente renovada pelo refresh token. Vídeo ao vivo por WebRTC
 * (latência abaixo de 1s), com HLS como plano B.
 */
function App() {
  const [token, setToken] = useState(() => getToken());
  const [user, setUser] = useState(() => getUser());

  // ?t=slug num link/QR code pré-preenche o código do cliente
  const [tenantInput, setTenantInput] = useState(() => {
    const fromUrl = normalizeSlug(new URLSearchParams(window.location.search).get('t'));
    if (fromUrl) setTenant(fromUrl);
    return fromUrl || getTenant();
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [view, setView] = useState('live'); // 'live' | 'playback'

  /**
   * As câmeras vêm em cache do último acesso: os players começam a conectar no
   * primeiro instante, sem esperar o ida-e-volta até o servidor (que, pelo
   * cloud, custa uns bons centenas de ms). A lista é atualizada logo em
   * seguida — se algo mudou, o mosaico se corrige sozinho.
   */
  const [cameras, setCameras] = useState(() => {
    localStorage.removeItem('onlitec_cameras'); // chave da era single-tenant
    try { return JSON.parse(localStorage.getItem(tenantKey('onlitec_cameras')) || '[]'); } catch { return []; }
  });
  const [statusMap, setStatusMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const handleLogout = useCallback(() => {
    clearSession();
    localStorage.removeItem(tenantKey('onlitec_cameras'));
    setToken('');
    setUser(null);
    setCameras([]);
  }, []);

  // renova o token ao abrir: as URLs de vídeo o carregam embutido
  useEffect(() => {
    if (!getToken()) return;
    void ensureFreshToken().then((fresh) => { if (fresh) setToken(fresh); });
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const slug = normalizeSlug(tenantInput);
      if (!slug) throw new Error('Informe o código do cliente (ex.: onlitec)');
      const previous = getTenant();
      setTenant(slug);
      if (previous && previous !== slug) setCameras([]); // sem câmeras "fantasma" do tenant anterior
      const data = await login(email, password);
      setToken(data.token);
      setUser(data.user || null);
      setPassword('');
    } catch (err) {
      setLoginError(err.message || 'Falha no login');
    } finally {
      setLoggingIn(false);
    }
  };

  /** Câmeras e status vêm do backend do OnliAcesso (a API do MediaMTX não é exposta). */
  const fetchCameras = useCallback(async () => {
    if (!getToken()) return;
    setLoading(true);
    setLoadError('');
    try {
      const [devRes, stRes] = await Promise.all([
        authFetch('/api/vms/devices'),
        authFetch('/api/vms/live-status').catch(() => null),
      ]);

      if (devRes.status === 401 || devRes.status === 403) { handleLogout(); return; }
      if (!devRes.ok) throw new Error(`Erro ${devRes.status} ao carregar câmeras`);

      const current = getToken();
      setToken((prev) => (prev === current ? prev : current));

      const { devices = [] } = await devRes.json();
      const status = stRes && stRes.ok ? (await stRes.json()).channels || [] : [];
      setStatusMap(Object.fromEntries(status.map((s) => [s.channelId, s])));

      const list = [];
      for (const device of devices) {
        if (!device.enabled) continue;
        for (const ch of device.channels || []) {
          if (!ch.enabled) continue;
          const hasSub = device.protocol === 'hikvision_isapi' || Boolean(ch.rtspUrlSub);
          list.push({
            id: ch.id,
            name: ch.name,
            deviceId: device.id,
            deviceName: device.name,
            mainPath: ch.streamPath,
            subPath: hasSub ? `${ch.streamPath}-sub` : ch.streamPath,
          });
        }
      }
      setCameras(list);
      localStorage.setItem(tenantKey('onlitec_cameras'), JSON.stringify(list));
    } catch (err) {
      // com cache em tela, um erro de rede não precisa apagar as câmeras
      if (cameras.length === 0) setLoadError(err.message || 'Falha ao carregar câmeras');
    } finally {
      setLoading(false);
    }
  }, [handleLogout, cameras.length]);

  useEffect(() => {
    if (!token) return;
    void fetchCameras();
    const timer = setInterval(() => { void fetchCameras(); }, 30000);
    return () => clearInterval(timer);
  }, [token, fetchCameras]);

  // ── Login ────────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="logo-container">
            {/* o logotipo real, com proporção preservada (object-fit: contain) */}
            <img src="/pwa-512x512.png" alt="Onlitec" className="brand-logo" />
            <h1>Onlitec Cloud</h1>
            <p>Monitoramento de câmeras</p>
          </div>
          <form onSubmit={handleLogin} className="login-form">
            <label className="input-group">
              <Building2 className="input-icon" size={18} />
              <input
                type="text"
                placeholder="Código do cliente (ex.: onlitec)"
                value={tenantInput}
                onChange={(e) => setTenantInput(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </label>
            <label className="input-group">
              <User className="input-icon" size={18} />
              <input
                type="email"
                placeholder="E-mail do OnliAcesso"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="input-group">
              <Lock className="input-icon" size={18} />
              <input
                type="password"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {loginError && (
              <div className="login-error"><AlertCircle size={15} /> {loginError}</div>
            )}
            <button type="submit" className="login-btn" disabled={loggingIn}>
              {loggingIn ? 'Entrando…' : 'Entrar'}
            </button>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-faint)', textAlign: 'center', margin: '4px 0 0' }}>
              A sessão fica salva neste dispositivo por 7 dias.
            </p>
          </form>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '10px' }}>
            <InstallButton />
            <ThemeToggle variant="icon" />
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'live', label: 'Ao vivo', icon: MonitorPlay },
    { id: 'playback', label: 'Reprodução', icon: Film },
  ];

  // ── App ──────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      {/* navegação lateral (desktop) */}
      <nav className="nav-rail">
        <Camera className="nav-logo" size={24} />
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${view === id ? 'active' : ''}`}
            onClick={() => setView(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
        <div className="nav-spacer" />
        <ThemeToggle variant="nav" />
        <InstallButton variant="nav" />
        <button className="nav-item" onClick={fetchCameras} title="Atualizar">
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          <span>Atualizar</span>
        </button>
        <button className="nav-item" onClick={handleLogout} title={user?.email || 'Sair'}>
          <LogOut size={18} />
          <span>Sair</span>
        </button>
      </nav>

      <div className="main-area">
        {loadError ? (
          <div className="empty">
            <AlertCircle size={36} />
            <p>{loadError}</p>
            <button className="login-btn" style={{ maxWidth: '180px' }} onClick={fetchCameras}>
              Tentar novamente
            </button>
          </div>
        ) : view === 'live' ? (
          <LiveView cameras={cameras} statusMap={statusMap} token={token} onStatusChange={fetchCameras} />
        ) : (
          <PlaybackView cameras={cameras} />
        )}
      </div>

      {/* navegação inferior (celular) — é aqui que o "Instalar" precisa estar,
          já que a barra lateral não existe em telas pequenas */}
      <nav className="bottom-nav">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${view === id ? 'active' : ''}`}
            onClick={() => setView(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
        <ThemeToggle variant="nav" />
        <InstallButton variant="nav" />
        <button className="nav-item" onClick={handleLogout}>
          <LogOut size={20} />
          <span>Sair</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
