import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: { include: ['tests/**/*.test.ts'], env: { JWT_SECRET: 'segredo-de-teste-com-mais-de-16', HIK_HOST: 'https://hik.invalid' } },
});
