import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `SINGLE=1 vite build` emits one self-contained HTML (for sharing / artifact publishing).
export default defineConfig(({ mode }) => ({
  base: './',
  server: { port: 4620, strictPort: true },
  build: {
    outDir: process.env.SINGLE ? 'dist-single' : 'dist',
    target: 'es2022',
    sourcemap: mode !== 'production',
  },
  plugins: process.env.SINGLE ? [viteSingleFile()] : [],
}));
