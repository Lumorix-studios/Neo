import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  clearScreen: false,
  server: {
    // Must match `build.devUrl` in src-tauri/tauri.conf.json.
    // strictPort: fail loudly instead of silently hopping to another port
    // (a drifted port makes the Tauri webview load nothing -> white screen).
    port: 5173,
    strictPort: true,
  },
})
