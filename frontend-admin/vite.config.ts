import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
    base: '/admin/',
    server: {
        host: true,
        port: 5174,
        strictPort: true,
        cors: true,
        allowedHosts: true,
        origin: '*',
        hmr: {
            clientPort: 8080,
        },
    },
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/pages/sessionAuditUtils.ts'],
            thresholds: {
                lines: 90,
                functions: 90,
                branches: 50,
                statements: 90,
            },
        },
    },
});
