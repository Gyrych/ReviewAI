export class StructuredRecognitionUseCase {
  constructor(private vision: any, private search: any, private timeline: any) {}
  async execute(params: any){ return { circuit: {}, timeline: [] } }
}


