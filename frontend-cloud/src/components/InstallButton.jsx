import React, { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

/**
 * Botão "Instalar app".
 *
 * Android/Chrome: o evento `beforeinstallprompt` é capturado em main.jsx (ele
 * dispara antes do React montar e se perderia aqui) e guardado em
 * window.__installPrompt; este componente só o consome.
 *
 * iOS/Safari: NÃO existe convite automático — a única forma é "Compartilhar >
 * Adicionar à Tela de Início". Mostramos essa instrução, senão o usuário de
 * iPhone não descobre que dá para instalar.
 *
 * variant="nav" desenha como item da barra de navegação; "icon" é compacto.
 */
export default function InstallButton({ variant = 'icon' }) {
  const [prompt, setPrompt] = useState(() => window.__installPrompt || null);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  useEffect(() => {
    const sync = () => setPrompt(window.__installPrompt || null);
    window.addEventListener('installpromptready', sync);
    return () => window.removeEventListener('installpromptready', sync);
  }, []);

  // já instalado: nada a oferecer
  if (isStandalone) return null;
  // fora do iOS, só aparece quando o navegador confirma que é instalável
  if (!prompt && !isIos) return null;

  const handleClick = async () => {
    if (isIos) {
      setShowIosHelp(true);
      return;
    }
    prompt.prompt();
    await prompt.userChoice;
    window.__installPrompt = null;
    setPrompt(null);
  };

  const Btn = variant === 'nav'
    ? (
      <button className="nav-item" onClick={handleClick} title="Instalar o app no dispositivo">
        <Download size={20} />
        <span>Instalar</span>
      </button>
    )
    : (
      <button
        className="icon-btn"
        onClick={handleClick}
        title="Instalar o app no dispositivo"
        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        <Download size={18} />
        <span style={{ fontSize: '12px' }}>Instalar</span>
      </button>
    );

  return (
    <>
      {Btn}

      {showIosHelp && (
        <div
          onClick={() => setShowIosHelp(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
        >
          <div
            className="login-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '340px', padding: '24px', position: 'relative' }}
          >
            <button
              onClick={() => setShowIosHelp(false)}
              className="icon-btn"
              style={{ position: 'absolute', top: '10px', right: '10px' }}
            >
              <X size={18} />
            </button>
            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Instalar no iPhone</h3>
            <ol style={{ paddingLeft: '18px', fontSize: '13px', lineHeight: 1.7, color: 'var(--text-dim)' }}>
              <li>
                Toque em <Share size={14} style={{ verticalAlign: 'middle' }} /> <strong>Compartilhar</strong>,
                na barra do Safari
              </li>
              <li>Escolha <strong>Adicionar à Tela de Início</strong></li>
              <li>Confirme em <strong>Adicionar</strong></li>
            </ol>
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0 }}>
              O iPhone não permite instalar automaticamente — e só funciona pelo Safari.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
