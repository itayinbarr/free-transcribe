import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// GitHub Pages serves the site from /free-transcribe/. Local dev stays at /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/free-transcribe/' : '/',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  build: { target: 'es2022' },
  optimizeDeps: {
    // Keep the ORT wasm/webgpu artifacts out of the dep pre-bundler.
    exclude: ['@huggingface/transformers'],
  },
}))
