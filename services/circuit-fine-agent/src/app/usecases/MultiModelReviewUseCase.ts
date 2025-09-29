export { MultiModelReviewUseCase } from '../../../../circuit-agent/src/app/usecases/MultiModelReviewUseCase'

export class MultiModelReviewUseCase {
  constructor(private provider: any, private timeline: any) {}
  async execute(params: any){ return { reports: [], timeline: [] } }
}


