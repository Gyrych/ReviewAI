export class ProgressMemoryStore {
    constructor() {
        this.store = new Map();
    }
    async init(id) { if (!id)
        return; if (!this.store.has(id))
        this.store.set(id, []); }
    async push(id, item) { if (!id)
        return; const arr = this.store.get(id); if (arr)
        arr.push(item);
    else
        this.store.set(id, [item]); }
    async get(id) { return this.store.get(id) || []; }
    async clear(id) { this.store.delete(id); }
}
