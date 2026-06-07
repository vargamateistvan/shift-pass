import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// On GitHub Pages this is served from https://<user>.github.io/shift-pass/
// so assets must be referenced under the /shift-pass/ base path. The Pages
// workflow sets GITHUB_ACTIONS=true; locally the base stays "/".
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/shift-pass/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
