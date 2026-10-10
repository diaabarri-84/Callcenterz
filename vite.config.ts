import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' + HashRouter: the build runs from any folder on the cPanel host without rewrite rules.
// Everything in public/ (incl. the PHP API in public/api/) is copied as-is into dist/.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
