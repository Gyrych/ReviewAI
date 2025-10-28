import fs from 'fs'
import path from 'path'

export function executeDelete(artifactPath: string) {
  try {
    if (fs.existsSync(artifactPath)) {
      fs.unlinkSync(artifactPath)
      return true
    }
    return false
  } catch (e) { console.error('deleteExecutor failed', (e as Error).message); return false }
}


