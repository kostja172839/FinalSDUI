import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createErpDevMiddleware } from './server/erp-dev-proxy';

const erpTableConnections: Plugin = {
  name: 'local-erp-table-connections',
  apply: 'serve',
  configureServer(server) {
    const { mode, envDir } = server.config;
    server.middlewares.use(createErpDevMiddleware(loadEnv(mode, envDir, 'ERP_TABLE_')));
  },
};

export default defineConfig({
  plugins: [react(), erpTableConnections],
  resolve: { dedupe: ['react', 'react-dom', '@codemirror/state', '@codemirror/view'] },
  optimizeDeps: {
    include: ['@uiw/react-codemirror', '@codemirror/lang-json', '@codemirror/lint', 'jsonc-parser'],
  },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4310' } },
  build: { sourcemap: true },
});
