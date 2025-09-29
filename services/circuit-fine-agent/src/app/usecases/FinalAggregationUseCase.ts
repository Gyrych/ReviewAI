export class FinalAggregationUseCase {
  constructor(private provider: any, private timeline: any) {}
  async execute(params: any){ return { markdown: '', timeline: [], enriched: {} } }
}


