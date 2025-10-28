// 中文注释：为 .js usecase 导出的缺失类型提供最小声明，以消除 TS 报错
declare module '../../../app/usecases/StructuredRecognitionUseCase.js' {
  export class StructuredRecognitionUseCase {}
}
declare module '../../../app/usecases/MultiModelReviewUseCase.js' {
  export class MultiModelReviewUseCase {}
}
declare module '../../../app/usecases/FinalAggregationUseCase.js' {
  export class FinalAggregationUseCase {}
}

// 通配：允许缺失声明的 .js 模块按 any 处理
declare module '*UseCase.js'


