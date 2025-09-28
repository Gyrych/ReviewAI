import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 绑定所有接口以绕开回环地址绑定限制（注意安全）
    port: 3002, // 改用未被系统排除的端口以避免 EACCES
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


