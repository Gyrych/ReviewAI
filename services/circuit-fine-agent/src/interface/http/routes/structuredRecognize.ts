// Structured recognize router retired in circuit-agent. Provide a local 410 handler to avoid cross-service import.
export function makeStructuredRecognizeRouter() {
  return {
    upload: { any: () => (req: any, res: any, next: any) => next() },
    handler: (req: any, res: any) => res.status(410).json({ error: 'structured mode removed; use direct mode' })
  }
}


