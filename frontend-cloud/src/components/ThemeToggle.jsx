import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

/**
 * Alterna claro/escuro. O tema padrão é o CLARO; a escolha do usuário fica
 * salva no aparelho e é aplicada já em main.jsx, antes do primeiro render
 * (senão a tela piscaria branca antes de escurecer).
 *
 * A cor da barra do sistema (theme-color) acompanha o tema.
 */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#14171d' : '#ffffff');
  localStorage.setItem('onlitec_theme', theme);
}

export function currentTheme() {
  return localStorage.getItem('onlitec_theme') === 'dark' ? 'dark' : 'light';
}

export default function ThemeToggle({ variant = 'nav' }) {
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const label = theme === 'dark' ? 'Claro' : 'Escuro';
  const Icon = theme === 'dark' ? Sun : Moon;

  if (variant === 'icon') {
    return (
      <button className="icon-btn" onClick={toggle} title={`Mudar para o tema ${label.toLowerCase()}`}>
        <Icon size={18} />
      </button>
    );
  }

  return (
    <button className="nav-item" onClick={toggle} title={`Mudar para o tema ${label.toLowerCase()}`}>
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );
}
