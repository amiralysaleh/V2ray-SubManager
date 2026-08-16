import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/V2ray-SubManager/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
  },
}));
