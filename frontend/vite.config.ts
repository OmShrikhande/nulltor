import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // FastAPI backend (auth, projects, branches, merges, etc.)
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      // Terminal WebSocket proxy
      '/ws': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        ws: true,
      },
      // Socket.IO server (Yjs real-time collaborative editing)
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: '../public_react',   // built output served by Node.js in production
  },
})
