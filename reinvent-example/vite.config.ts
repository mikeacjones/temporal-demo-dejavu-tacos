import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served under /_reinvent_example/ on the demo host (and by its own nginx locally).
export default defineConfig({
  base: '/_reinvent_example/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/_reinvent_example/api': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/_reinvent_example/, ''),
      },
    },
  },
})
