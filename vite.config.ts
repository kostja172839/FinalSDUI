import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom', '@codemirror/state', '@codemirror/view'] },
  optimizeDeps: {
    include: ['@uiw/react-codemirror', '@codemirror/lang-json', '@codemirror/lint', 'jsonc-parser'],
  },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4310' } },
  build: { sourcemap: true },
});
