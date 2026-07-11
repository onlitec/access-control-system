import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'masked-icon.svg',
        'pwa-maskable-192x192.png', 'pwa-maskable-512x512.png',
      ],
      manifest: {
        id: '/',
        name: 'Onlitec Cloud',
        short_name: 'Onlitec',
        description: 'Visualização remota das câmeras do condomínio',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        // tema padrão do app é o claro (o usuário pode alternar no botão de tema)
        theme_color: '#ffffff',
        background_color: '#ffffff',
        categories: ['security', 'utilities'],
        // "any"      = ícone exibido inteiro (o logo pode ocupar quase tudo)
        // "maskable" = o Android RECORTA num círculo/squircle e só garante a
        //              área central; por isso o logo aqui vem menor e centrado,
        //              senão o texto "ONLITEC" seria cortado nas bordas.
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // o vídeo e a API nunca podem ser servidos do cache
        navigateFallbackDenylist: [/^\/api/, /^\/hls/, /^\/webrtc/],
        runtimeCaching: []
      }
    })
  ]
})
