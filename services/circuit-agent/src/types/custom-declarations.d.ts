// 中文注释：为仓库中若干以 JS/相对路径导入的模块提供临时的 any 类型声明，
// 以消除 TypeScript 在未完全迁移到 .ts 时的声明缺失错误。
// 这些声明是兼容性的占位符，建议在后续工作中为相关模块添加准确的类型定义。

declare module 'cors' {
  const whatever: any
  export = whatever
}

declare module '../app/usecases/StructuredRecognitionUseCase' {
  const whatever: any
  export = whatever
}

declare module '../interface/http/routes/structuredRecognize' {
  const whatever: any
  export = whatever
}

declare module '../app/usecases/MultiModelReviewUseCase' {
  const whatever: any
  export = whatever
}

declare module '../interface/http/routes/structuredReview' {
  const whatever: any
  export = whatever
}

declare module '../app/usecases/FinalAggregationUseCase' {
  const whatever: any
  export = whatever
}

declare module '../interface/http/routes/aggregate' {
  const whatever: any
  export = whatever
}

// 通配符声明：为同目录下的其他 JS 模块提供临时 any 类型
declare module '../app/usecases/*' {
  const whatever: any
  export = whatever
}

declare module '../interface/http/routes/*' {
  const whatever: any
  export = whatever
}


