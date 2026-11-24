import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/art-qr/',
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
