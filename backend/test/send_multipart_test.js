const http = require('http')
const fs = require('fs')
const path = require('path')

const files = [
  path.join(__dirname, '..', 'package.json'),
  path.join(__dirname, '..', '..', 'frontend', 'index.html'),
]

const boundary = '----NodeMultipartBoundary' + Date.now()

function fieldPart(name, value) {
  return Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    'utf8'
  )
}

function filePart(fieldName, filename, content) {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      'utf8'
    ),
    content,
    Buffer.from('\r\n', 'utf8'),
  ])
}

async function run() {
  try {
    const parts = []
    parts.push(fieldPart('modelName', 'gpt-4'))
    parts.push(fieldPart('requirements', '这是设计需求或评审规范的原文'))

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i]
      const filename = path.basename(filePath)
      const content = fs.readFileSync(filePath)
      parts.push(filePart(`file${i + 1}`, filename, content))
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))

    const body = Buffer.concat(parts)

    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/review',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        console.log('STATUS:', res.statusCode)
        console.log('BODY:', data)
      })
    })

    req.on('error', (err) => {
      console.error('Request error:', err)
    })

    req.write(body)
    req.end()
  } catch (err) {
    console.error('Test script error:', err)
  }
}

run()


