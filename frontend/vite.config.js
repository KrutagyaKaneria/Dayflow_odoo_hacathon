import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Backend dev server runs on 4000 — no conflict.
    port: 5173,
    strictPort: true,
  },
});
