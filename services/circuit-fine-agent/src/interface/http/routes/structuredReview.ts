// Structured review handler retired in circuit-agent. Provide a local 410 handler to avoid cross-service import.
export function makeStructuredReviewHandler() {
  return function handler(req: any, res: any) {
    res.status(410).json({ error: 'structured mode removed; use direct mode' })
  }
}


