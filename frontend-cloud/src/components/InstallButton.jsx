import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

/**
 * Botão "Instalar app" — SEMPRE visível (exceto quando o app já está instalado).
 *
 * Chrome/Edge/Opera/Samsung (Android e desktop): quando o navegador confirma que
 * é instalável, dispara `beforeinstallprompt` (capturado em main.jsx →
 * window.__installPrompt) e o clique instala direto.
 *
 * Nos demais casos (iOS, Firefox, Safari desktop, ou Chromium antes do evento),
 * o clique abre instruções MANUAIS específicas do navegador/plataforma — só o
 * Chromium tem instalação programática; no resto o usuário precisa do passo a
 * passo, senão nunca descobre que dá para instalar.
 *
 * variant="nav" desenha como item da barra de navegação; "icon" é compacto.
 */

function detectPlatform() {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && 'ontouchend' in document);
  const isAndroid = /android/i.test(ua);
  const isEdge = /edg\//i.test(ua);
  const isSamsung = /samsungbrowser/i.test(ua);
  const isFirefox = /firefox|fxios/i.test(ua);
  const isOpera = /opr\/|opera|opt\//i.test(ua);
  const isChromium = (/chrome|crios|chromium/i.test(ua) || isEdge || isSamsung || isOpera) && !isFirefox;
  const isSafari = /safari/i.test(ua) && !isChromium && !isFirefox;
  return { isIos, isAndroid, isEdge, isSamsung, isFirefox, isOpera, isChromium, isSafari, isDesktop: !isIos && !isAndroid };
}

/** Passo a passo de instalação conforme o navegador/plataforma detectados. */
function helpFor(p) {
  if (p.isIos) {
    if (p.isSafari) {
      return {
        title: 'Instalar no iPhone/iPad',
        steps: ['Toque em Compartilhar, na barra do Safari', 'Escolha "Adicionar à Tela de Início"', 'Confirme em "Adicionar"'],
        note: 'No iPhone só é possível instalar pelo Safari.',
      };
    }
    return {
      title: 'Instalar no iPhone/iPad',
      steps: ['Abra este endereço no Safari (o único que instala no iOS)', 'Toque em Compartilhar → "Adicionar à Tela de Início"', 'Confirme em "Adicionar"'],
      note: 'Outros navegadores no iOS não instalam — use o Safari.',
    };
  }
  if (p.isAndroid) {
    if (p.isFirefox) {
      return { title: 'Instalar no Android (Firefox)', steps: ['Abra o menu (⋮) do navegador', 'Toque em "Instalar" (ou "Adicionar à tela inicial")', 'Confirme'], note: '' };
    }
    if (p.isSamsung) {
      return { title: 'Instalar (Samsung Internet)', steps: ['Abra o menu (≡)', 'Toque em "Adicionar página a" → "Tela inicial"', 'Confirme'], note: '' };
    }
    return { title: 'Instalar no Android', steps: ['Abra o menu (⋮) do navegador', 'Toque em "Instalar app" (ou "Adicionar à tela inicial")', 'Confirme'], note: '' };
  }
  // desktop
  if (p.isFirefox) {
    return { title: 'Instalar no computador', steps: ['O Firefox no computador não instala apps web.', 'Para instalar, abra este site no Chrome, Edge ou Opera.'], note: 'Pelo Firefox, dá para criar um atalho pelo menu → "Salvar página".' };
  }
  if (p.isSafari) {
    return { title: 'Instalar no Mac (Safari)', steps: ['Menu "Arquivo" → "Adicionar à Dock…"', '(ou Compartilhar → "Adicionar à Dock")', 'Confirme'], note: 'Disponível no macOS Sonoma ou mais recente.' };
  }
  // Chromium desktop (Chrome/Edge/Opera) antes do beforeinstallprompt
  return {
    title: 'Instalar no computador',
    steps: ['Clique no ícone de instalar (⊕ / monitor) na barra de endereço', 'ou abra o menu (⋮) → "Instalar Onlitec Cloud…"', 'Confirme em "Instalar"'],
    note: '',
  };
}

export default function InstallButton({ variant = 'icon' }) {
  const [prompt, setPrompt] = useState(() => window.__installPrompt || null);
  const [showHelp, setShowHelp] = useState(false);

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  useEffect(() => {
    const sync = () => setPrompt(window.__installPrompt || null);
    window.addEventListener('installpromptready', sync);
    return () => window.removeEventListener('installpromptready', sync);
  }, []);

  // já instalado: nada a oferecer
  if (isStandalone) return null;

  const handleClick = async () => {
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice;
      window.__installPrompt = null;
      setPrompt(null);
      return;
    }
    setShowHelp(true); // sem convite nativo → instruções manuais do navegador
  };

  const help = helpFor(detectPlatform());

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

      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
        >
          <div
            className="login-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '360px', padding: '24px', position: 'relative' }}
          >
            <button
              onClick={() => setShowHelp(false)}
              className="icon-btn"
              style={{ position: 'absolute', top: '10px', right: '10px' }}
            >
              <X size={18} />
            </button>
            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>{help.title}</h3>
            <ol style={{ paddingLeft: '18px', fontSize: '13px', lineHeight: 1.7, color: 'var(--text-dim)' }}>
              {help.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            {help.note && (
              <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0 }}>{help.note}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
