export class TimelineService {
  constructor(private store: any) {}
  make(type: string, payload: any){ return { type, payload, ts: Date.now() } }
  async push(id: string | undefined, item: any){ /* no-op for memory */ }
  async get(id: string){ return [] }
}


