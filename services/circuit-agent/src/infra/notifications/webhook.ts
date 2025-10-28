import fetch from 'node-fetch'

export async function sendWebhook(url: string, payload: any) {
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } })
    return { ok: res.ok, status: res.status }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}


