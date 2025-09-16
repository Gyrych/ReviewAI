import fetch from 'node-fetch'
import { URL } from 'url'
import { logInfo, logError } from './logger'

const COMMON_PATHS = ['/chat', '/chat/completions', '/responses', '/v1/chat', '/v1/responses', '/v1/completions', '/completions']

export async function deepseekTextDialog(apiUrl: string, message: string, model?: string, authHeader?: string): Promise<string> {
  if (!apiUrl) throw new Error('apiUrl missing for deepseek')
  const useModel = model && String(model).trim().length > 0 ? model : 'deepseek-chat'
  const payloadMsg = { model: useModel, messages: [{ role: 'user', content: message }], stream: false }
  const headers: any = { 'Content-Type': 'application/json' }
  if (authHeader) headers['Authorization'] = authHeader

  // build try urls; for deepseek host pin to chat/completions then beta
  let urlsToTry: string[] = []
  try {
    const u = new URL(apiUrl)
    const host = (u.hostname || '').toLowerCase()
    const isDeepseek = host.includes('deepseek.com')
    if (isDeepseek) {
      urlsToTry.push(u.origin + '/chat/completions')
      urlsToTry.push(u.origin + '/chat')
      urlsToTry.push(u.origin + '/completions')
      const betaBase = u.origin + '/beta'
      urlsToTry.push(betaBase + '/chat/completions')
      urlsToTry.push(betaBase + '/chat')
    } else {
      if (u.pathname && u.pathname !== '/') {
        urlsToTry.push(apiUrl)
      } else {
        for (const p of COMMON_PATHS) urlsToTry.push(u.origin + p)
        urlsToTry.push(u.origin)
      }
    }
  } catch (e) {
    urlsToTry = [apiUrl]
  }

  // auth header variants
  const authToken = (headers['Authorization'] || '').toString().replace(/^Bearer\s+/i, '')
  const altHeaderSets = [headers]
  if (authToken) {
    const h1: any = Object.assign({}, headers)
    h1['X-Api-Key'] = authToken
    const h2: any = Object.assign({}, headers)
    h2['Api-Key'] = authToken
    altHeaderSets.push(h1, h2)
  }

  let lastErr: any = null
  for (const tryUrl of urlsToTry) {
    for (const tryHeaders of altHeaderSets) {
      try {
        logInfo('deepseek.try', { tryUrl })
        const resp = await fetch(tryUrl, { method: 'POST', body: JSON.stringify(payloadMsg), headers: tryHeaders, timeout: 15000 })
        if (resp.ok) {
          logInfo('deepseek.try.success', { tryUrl, status: resp.status })
          const txt = await resp.text()
          try {
            const j = JSON.parse(txt)
            if (j.reply) return j.reply
            if (j.text) return j.text
            if (j.output) return j.output
            if (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) return j.choices[0].message.content
          } catch (e) { return txt }
        }
        const txt = await resp.text()
        lastErr = `status ${resp.status} ${txt.substring(0,200)}`
        logError('deepseek.try.failed', { tryUrl, status: resp.status })
      } catch (e) {
        lastErr = e
        logError('deepseek.try.exception', { tryUrl, error: String(e) })
      }
    }
  }

  throw new Error(`deepseek upstream error: ${lastErr || 'no response'}`)
}


