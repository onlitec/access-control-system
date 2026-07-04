'use client';

import { useEffect } from 'react';

// Registra o service worker do PWA. Navegadores só permitem service worker
// em contexto seguro (HTTPS ou localhost) - em HTTP puro isso vira no-op
// silencioso, então é seguro manter registrado desde já.
export default function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/login/sw.js', { scope: '/login/' })
        .catch(() => { /* HTTP sem TLS ou navegador sem suporte: ignora */ });
    }
  }, []);
  return null;
}
