import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: undefined,
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    },
    // Ensure external resources are handled properly
    assetsInlineLimit: 4096,
    // Don't fail build on warnings
    onwarn(warning, warn) {
      // Suppress certain warnings that don't affect functionality
      if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
      warn(warning)
    }
  },
  // Server configuration for development
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  // Preview configuration
  preview: {
    port: 4173,
    open: true
  }
})

