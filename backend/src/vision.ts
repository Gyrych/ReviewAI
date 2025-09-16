import fetch from 'node-fetch'
import fs from 'fs'

// 将图片文件转发给用户指定的模型 API，请求返回遵循 circuit schema 的 JSON
export async function extractCircuitJsonFromImages(images: { path: string; originalname: string }[], apiUrl: string, model: string, authHeader?: string): Promise<any> {
  if (!apiUrl) {
    throw new Error('apiUrl missing for vision extraction')
  }

  // 对于每张图片，向 apiUrl 发送 multipart/form-data 请求，要求返回 JSON
  const combined: any = { components: [], connections: [] }

  for (const img of images) {
    const form = new (require('form-data'))()
    form.append('file', fs.createReadStream(img.path), { filename: img.originalname })
    // 在 prompt 中指示模型返回严格的 JSON，遵循约定 schema
    form.append('prompt', `Please analyze the circuit diagram image and return a JSON with keys: components (array), connections (array). Each component should have id,type,label,params,pins. connections should list from/to with componentId and pin. Return only JSON.`)
    form.append('model', model)

    const headers: any = Object.assign({}, form.getHeaders())
    if (authHeader) headers['Authorization'] = authHeader

    const resp = await fetch(apiUrl, { method: 'POST', body: form, headers, timeout: 30000 })
    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error(`vision upstream error: ${resp.status} ${txt.substring(0, 200)}`)
    }
    const txt = await resp.text()
    let j: any = null
    try {
      j = JSON.parse(txt)
    } catch (e) {
      // 如果返回不是纯 JSON，尝试抽取首个 JSON 对象
      const m = txt.match(/\{[\s\S]*\}/)
      if (m) {
        try { j = JSON.parse(m[0]) } catch (e2) { throw new Error('vision: failed to parse JSON response') }
      } else {
        throw new Error('vision: no JSON in response')
      }
    }

    // 合并 components 与 connections（简单拼接，未做去重）
    if (Array.isArray(j.components)) combined.components.push(...j.components)
    if (Array.isArray(j.connections)) combined.connections.push(...j.connections)
  }

  return combined
}


