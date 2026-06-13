import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@smart-qr/shared': path.resolve(__dirname, '../../packages/shared/src')
    }
  }
})
