import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';

import { miaodaDevPlugin } from "miaoda-sc-plugin";

// https://vite.dev/config/
export default defineConfig({
  base: '/painel/',
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    cors: true,
    allowedHosts: true,
    origin: '*',
    hmr: {
      clientPort: 8080,
    },
  },
  plugins: [react(), svgr({
    svgrOptions: {
      icon: true, exportType: 'named', namedExport: 'ReactComponent',
    },
  }), miaodaDevPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
