// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'quiz': resolve(__dirname, 'src/quiz/main.jsx'),
        'custom-quiz': resolve(__dirname, 'src/custom-quiz/main.jsx'),
      },
      output: {
        entryFileNames: 'js/bundles/[name].js',      // ← NO HASH
        chunkFileNames: 'js/bundles/assets/[name].js', // ← NO HASH
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.')
          const ext = info[info.length - 1]
          if (/\.(css)$/i.test(assetInfo.name)) {
            return `css/[name][extname]`               // ← NO HASH
          }
          return `assets/[name][extname]`              // ← NO HASH
        },
      },
    },
    outDir: '../static',
    manifest: false,
    sourcemap: true,
  },
})