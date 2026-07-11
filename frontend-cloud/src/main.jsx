import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyTheme, currentTheme } from './components/ThemeToggle.jsx'

// aplica o tema ANTES do primeiro render — senão a tela pisca clara antes de
// escurecer (para quem escolheu o tema escuro). O padrão é o claro.
applyTheme(currentTheme())

/**
 * O Chrome dispara `beforeinstallprompt` assim que decide que o app é
 * instalável — em geral ANTES do React montar. Se ninguém estiver ouvindo
 * nesse instante, o evento se perde e o botão "Instalar" nunca aparece.
 * Por isso capturamos aqui, no primeiro script da página, e guardamos.
 */
window.__installPrompt = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()                      // sem o mini-banner padrão do Chrome
  window.__installPrompt = e
  window.dispatchEvent(new Event('installpromptready'))
})
window.addEventListener('appinstalled', () => {
  window.__installPrompt = null
  window.dispatchEvent(new Event('installpromptready'))
})

/**
 * Watchdog do service worker.
 *
 * A PWA usa precache (vite-plugin-pwa): sem isto, um navegador que já visitou o
 * site continua servindo a versão antiga do app indefinidamente — foi o que
 * aconteceu quando o login mudou e os usuários seguiam vendo a tela antiga.
 * Aqui forçamos a checagem de atualização e recarregamos a página assim que a
 * nova versão assume o controle.
 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((reg) => reg.update()))
    .catch(() => { /* sem SW registrado ainda */ })

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  // checa novas versões periodicamente (app fica aberto por horas na portaria)
  setInterval(() => {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((reg) => reg.update()))
      .catch(() => { /* ignora */ })
  }, 5 * 60 * 1000)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
