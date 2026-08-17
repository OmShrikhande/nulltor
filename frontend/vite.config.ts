import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      // FastAPI backend (auth, projects, branches, merges, etc.)
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      // FastAPI WebSocket endpoints (e.g. terminal)
      '/ws': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        ws: true,
      },
      // Socket.IO server (Yjs real-time collaborative editing)
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if ((err as any).code === 'ECONNRESET' || (err as any).code === 'ECONNABORTED') return;
            console.log('Proxy Error:', err);
          });
          proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
            // Remove Vite's noisy internal error listeners
            socket.removeAllListeners('error');
            socket.on('error', (err: any) => {
              if (err.code === 'ECONNRESET' || err.code === 'ECONNABORTED') return;
              console.error('WS Socket Error:', err);
            });

            proxyReq.removeAllListeners('error');
            proxyReq.on('error', (err: any) => {
              if (err.code === 'ECONNRESET' || err.code === 'ECONNABORTED') return;
              console.error('WS ProxyReq Error:', err);
            });
          });
        }
      },
    },
  },
  build: {
    outDir: '../public_react',   // built output served by Node.js in production
    emptyOutDir: true,
  },
})
