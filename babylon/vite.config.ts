import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  publicDir: '../public',
  build: {
    outDir: '../dist/babylon',
    emptyOutDir: true,
  },
});
