import express from 'express'
// 使用 require 导入 multer 以避免 TypeScript 在没有安装类型声明时报错
const multer = require('multer')
import path from 'path'

const app = express()
const port = Number(process.env.PORT || 3001)

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') })

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from backend' })
})

// POST /api/review
// 接收前端上传的文件（任意数量）和表单参数，使用 multer 处理文件
// 返回 JSON: { fileCount, apiUrl, modelName, requirements }
app.post('/api/review', upload.any(), (req, res) => {
  try {
    // 为避免依赖本地类型声明，这里使用 any 来访问 multer 上传的 files
    const maybeFiles = (req as any).files
    const fileCount = Array.isArray(maybeFiles) ? maybeFiles.length : 0

    // 从表单字段中读取 modelName 和 requirements（可能的字段名）
    const body = req.body || {}
    const modelName = body.modelName || body.model || null
    const requirements = body.requirements || body.spec || body.requirement || null

    const apiUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`

    res.json({ fileCount, apiUrl, modelName, requirements })
  } catch (err) {
    console.error('Error handling /api/review:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`)
})


