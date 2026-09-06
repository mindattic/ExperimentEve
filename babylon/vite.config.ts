import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  publicDir: '../public',
  build: {
    outDir: '../dist/babylon',
    emptyOutDir: true,
  },
  server: {
    // Vite already busts cache on JS modules it transforms, but static assets served straight out
    // of publicDir (babylon.js if it's ever vendored, textures, etc.) are still cacheable by the
    // browser with no header at all — a plain reload can then serve a stale copy. no-cache forces
    // revalidation on every request instead (a cheap 304 when nothing changed).
    headers: { 'Cache-Control': 'no-cache' },
  },
});
