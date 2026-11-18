import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { interfaceThemeCss } from './scripts/interface-theme-css.ts'
import { ignoredWatchPaths } from './scripts/watch-directories.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [interfaceThemeCss()] } },
  server: { watch: { ignored: ignoredWatchPaths } },
})
