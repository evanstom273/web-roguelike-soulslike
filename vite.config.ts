import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the site from /<repo-name>/, not the domain root.
  base: '/web-roguelike-soulslike/',
  plugins: [react(), tailwindcss()],
  define: {
    // Shown on the menu so you can tell which commit a deploy is running.
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'),
  },
})
