import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', // Windows 上个别环境绑定 0.0.0.0 可能触发 EACCES，改用回环地址
    port: 5173, // 使用 Vite 默认端口，避免 Windows 权限限制（3002/3003 受限）
    strictPort: false, // 若 5173 被占用，允许 Vite 自动尝试其他端口
    proxy: {
      '/api': {
        // 将代理目标指向 circuit-agent 子服务默认端口
        target: 'http://localhost:4001',
        changeOrigin: true,
        secure: false
      }
    }
  }
})


