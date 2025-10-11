import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

// 中文注释：轻量级国际化实现，不引入第三方依赖

export type Lang = 'zh' | 'en'

type I18nContextType = {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang') as Lang | null
    if (saved === 'zh' || saved === 'en') return saved
  } catch {}
  try {
    const navLangs: string[] = (navigator as any).languages || []
    const navPrimary: string = (navigator as any).language || ''
    const all = (navLangs && navLangs.length > 0) ? navLangs : [navPrimary]
    const matchZh = all.some((l) => typeof l === 'string' && l.toLowerCase().includes('zh'))
    return matchZh ? 'zh' : 'en'
  } catch {}
  return 'zh'
}

// 中文注释：翻译字典
const dictZh: Record<string, string> = {
  // app 层
  'app.title': '评审工具',
  'app.brand.title_en': 'ReviewAI',
  'app.brand.title_cn': 'AI评审助手',
  'app.theme.toDark': '切换暗色',
  'app.theme.toLight': '切换亮色',
  'app.lang.toggle': 'EN/中',
  'app.modelApi.label': '模型 API 地址',
  'app.modelApi.option.custom': '自定义（输入其它 API 地址）',
  'app.modelApi.placeholder.customUrl': 'https://your-api.example.com/path',
  'app.modelApi.note.fixed': '固定模型 API 地址',
  'app.modelName.label': '模型名称',
  'app.modelName.option.custom': '自定义（输入模型名称）',
  'app.modelName.placeholder.customName': '自定义模型名称（例如 my-custom-model）',
  'app.modelName.note.customApi': '已选择自定义 API：请在此处输入模型名称，输入后将作为提交时的模型名；下拉已冻结。',
  'app.modelName.note.openrouter': '已选择 OpenRouter：可填写自定义模型名称，填写后将作为提交时的模型名；若留空，将使用下拉默认模型。',
  'app.apiKey.label': 'API Key',
  'app.apiKey.placeholder': '在此粘贴 API Key',
  'app.apiKey.hint': '点击以输入或粘贴你的 OpenRouter API Key',
  'app.sessions.toggle.show': '加载会话',
  'app.sessions.toggle.hide': '隐藏会话',
  'app.sessions.refresh': '刷新',
  'app.sessions.empty': '暂无会话，点击右侧刷新重试。',
  'app.sessions.load': '加载会话',
  'app.sessions.delete': '删除',
  'app.tabs.circuit': '电路评审',
  'app.tabs.circuit_single': '电路图\n单agent评审',
  'app.tabs.circuit_multi': '电路图\n多agent评审',
  'app.tabs.code': '代码评审',
  'app.tabs.doc': '文档评审',
  'app.tabs.req': '需求评审',
  'app.tab.todo': '（待开发）',
  'app.result.title': '评审结果',
  'app.result.waiting': '等待提交结果...',
  'app.error.loadSession': '加载会话失败：{msg}',
  'app.error.deleteSession': '删除会话失败：{msg}',

  // ReviewForm 层
  'form.upload.label': '文件上传',
  'form.req.label': '设计需求（系统提示）',
  'form.spec.label': '设计规范（系统提示）',
  'form.advanced.label': '高级配置',
  'form.multiPass.enable': '启用多轮识别',
  'form.multiPass.passes': '识别轮数（固定为5步）',
  'form.multiPass.singleNote': '未启用多轮时使用通用识别',
  'form.multiPass.multiNote': '启用多轮识别（5步）',
  'form.search.enable': '启用器件搜索',
  'form.search.topN': '搜索结果数量',
  'form.search.note': '启用器件检索以辅助识别',
  'form.directReview.label': '启用直接 LLM 评审（跳过视觉解析）',
  'form.directReview.note': '启用后图片与可选器件资料会直接发送给语言模型进行评审',
  'form.saveEnriched.enable': '保存解析结果',
  'form.qc.label': '问题确认（模型反馈）',
  'form.qc.placeholder': '模型返回的问题或疑问将显示在此（按页显示）',
  'form.dialog.label': '对话（与模型交互）',
  'form.dialog.placeholder.editable': '输入与大模型的对话/问题（与当前页对应）',
  'form.dialog.placeholder.readonly': '非最后一页只读：聚焦将自动跳到最后一页以编辑',
  'form.paging.current': '第 {page} / {total} 页',
  'form.paging.prev': '上一页',
  'form.paging.next': '下一页',
  'form.progress.current': '当前步骤：{step}',
  'form.progress.elapsed': '已用时：{seconds}s',
  'form.submit.loading': '提交中...',
  'form.submit': '提交',
  'form.reset': '重置',
  'form.abort': '中止',
  'form.save.loading': '保存中...',
  'form.save': '保存会话',
  'form.save.ok': '会话已保存',
  'form.save.fail': '保存会话失败：{msg}',
  'form.reset.confirm': '当前会话有未保存内容，是否先保存？',
  'form.customApi.warning': '提示：您使用的是自定义或未知的 API 地址，系统不会验证其可用性。若上游返回错误，请检查地址或切换到下拉中的受支持地址。',
  'form.error.timeout': '请求超时：上游响应较慢或网络不稳定，请尝试切换为 /beta 路径或稍后重试。',
  'form.error.submitFail': '提交失败',
  'form.error.aborted': '已中止',
  // 时间线/步骤历史标签
  'timeline.label': '步骤历史',
  'timeline.detail': '步骤详情',
  'timeline.llmResponse': '大模型返回内容',
  'timeline.visionResult': '图片解析结果',
  'timeline.clarifyingQuestions': '澄清问题',
  'timeline.reviewReport': '评审报告',
  'timeline.fullResponse': '完整响应',
  'timeline.componentsCount': '器件数量',
  'timeline.connectionsCount': '连接数量',
  'timeline.netsCount': '网络数量',
  'timeline.hasOverlay': '包含可视化覆盖层',
  'timeline.enrichedComponentsCount': '参数补充器件数',
  'timeline.visualization': '可视化',
  'timeline.paramEnrichment': '参数补充',
  'timeline.uploadInfo': '上传文件信息',
  'timeline.requestInfo': '请求信息',
  'timeline.cachedData': '缓存数据',
  'timeline.fileCount': '文件数量',
  'timeline.apiUrl': 'API地址',
  'timeline.model': '模型',
  'timeline.hasSystemPrompt': '包含系统提示',
  'timeline.hasFiles': '包含文件',
  'timeline.hasDialog': '包含对话',
  'timeline.visionModel': '视觉模型',
  'timeline.languageModel': '语言模型',
  'timeline.processedFiles': '处理文件数',
  'timeline.hasCircuitData': '包含电路数据',
  'timeline.hasRequirements': '包含需求',
  'timeline.hasSpecs': '包含规格',
  'timeline.hasHistory': '包含历史',
  'timeline.returnContent': '返回内容',
  'timeline.fullStructuredDescription': '查看完整结构化描述 (JSON)',
  'timeline.datasheetDetails': '器件资料下载详情',
  'timeline.retrievedComponents': '检索器件数',
  'timeline.successfulDownloads': '成功下载数',
  'timeline.allDatasheetInfo': '查看所有器件资料信息',
  'timeline.sourceType': '来源类型',
  'timeline.documentTitle': '文档标题',
  'timeline.sourceUrl': '来源网址',
  'timeline.confidence': '置信度',
  'timeline.retrievalTime': '检索时间',
  'timeline.status': '状态',
  'timeline.otherCandidates': '其他候选结果',
  'timeline.multiPassRecognition': '多轮识别',
  'timeline.consolidation': '结果整合',
  'timeline.totalPasses': '总轮数',
  'timeline.successfulPasses': '成功轮数',
  'timeline.totalProcessingTime': '总处理时间',
  'timeline.averageTimePerPass': '平均每轮时间',
  'timeline.multiPassInfo': '多轮信息',
  'timeline.multiPassResult': '多轮结果',
  'timeline.resultCount': '结果数量',
  'timeline.consolidatedComponents': '整合器件数',
  'timeline.consolidatedConnections': '整合连接数',
  'timeline.consolidationInfo': '整合信息',
  'timeline.consolidationResult': '整合结果',
  'timeline.consolidationFallback': '整合回退',
  'timeline.group.vision': '视觉处理',
  'timeline.group.llm': '语言模型',
  'timeline.group.response': '响应处理',

  // 步骤标签
  'step_idle': '空闲',
  'step_preparing': '准备中',
  'step_uploading_files': '上传文件',
  'step_using_cached_enriched_json': '使用已解析数据',
  'step_sending_request': '发送请求',
  'step_done': '完成',
  'step_images_processing_start': '图像处理 - 开始',
  'step_images_processing_done': '图像处理 - 完成',
  'step_images_processing_skipped': '图像处理 - 跳过',
  'step_request_received': '请求已接收',
  'step_datasheets_fetch_done': '器件资料下载 - 完成',
  'step_second_stage_analysis_start': '二次分析 - 开始',
  'step_second_stage_analysis_done': '二次分析 - 完成',
  'step_analysis_result': '分析结果',
  'step_clarifying_question': '问题确认',
  'step_aborted': '已中止',
  'step_llm_request_start': '调用模型 - 开始',
  'step_llm_request_done': '调用模型 - 完成',
  // 新增步骤（汉化）
  'step_request_payload_received': '请求载荷 - 已接收',
  'step_vision_batch_request': '视觉批处理请求',
  'step_vision_model_request': '视觉模型请求',
  'step_vision_model_response': '视觉模型响应',
  // 后端保存上传文件（直接评审时使用）
  'step_backend.saved_uploads': '已保存上传文件（用于直接评审）',
  'step_backend_saved_uploads': '已保存上传文件（用于直接评审）',
  // 视觉处理 - 跳过（directReview 模式下）
  'step_vision.processing_skipped': '图像处理 - 已跳过（直接评审）',
  'step_vision_processing_skipped': '图像处理 - 已跳过（直接评审）',
  'step_llm_request': '大语言模型请求',
  'step_llm_response': '大语言模型响应',
  // 兼容点号形式（后端时间线使用点号命名）
  'step_llm.request': '大语言模型请求',
  'step_llm.response': '大语言模型响应',
  // 新增：识别轮与检索相关（点号与下划线双写，兼容不同命名）
  'step_identify.request': '识别关键元器件 - 请求',
  'step_identify.response': '识别关键元器件 - 响应',
  'step_identify_request': '识别关键元器件 - 请求',
  'step_identify_response': '识别关键元器件 - 响应',
  'step_search.query': '在线检索 - 查询',
  'step_search.hit': '在线检索 - 命中',
  'step_search.summary': '在线检索 - 摘要',
  'step_search.summary.saved': '在线检索 - 摘要已保存',
  'step_search.summary.failed': '检索摘要失败',
  'step_search.fallback.query': '在线检索 - 回退查询',
  'step_search.trace.summary.saved': '在线检索 - 摘要追踪已保存',
  // 新增：检索 LLM 原始交互（点号与下划线双写）
  'step_search.llm.request': '检索 LLM 请求',
  'step_search.llm.response': '检索 LLM 响应',
  'step_search_llm_request': '检索 LLM 请求',
  'step_search_llm_response': '检索 LLM 响应',
  'step_search_query': '在线检索 - 查询',
  'step_search_hit': '在线检索 - 命中',
  'step_search_summary': '在线检索 - 摘要',
  'step_search_summary_saved': '在线检索 - 摘要已保存',
  'step_search_fallback_query': '在线检索 - 回退查询',
  'step_search_trace_summary_saved': '在线检索 - 摘要追踪已保存',
  'step_multi_pass_recognition_start': '多轮识别 - 开始',
  'step_multi_pass_recognition_done': '多轮识别 - 完成',
  'step_recognition_consolidation_start': '识别整合 - 开始',
  'step_recognition_consolidation_done': '识别整合 - 完成',
  'step_recognition_consolidation_fallback': '识别整合 - 回退',
  'step_ocr_recognition_start': 'OCR辅助识别 - 开始',
  'step_ocr_recognition_done': 'OCR辅助识别 - 完成',
  'step_ocr_recognition_failed': 'OCR辅助识别 - 失败',
  'step_component_enrichment_start': '组件参数补充 - 开始',
  'step_component_enrichment_done': '组件参数补充 - 完成',
  'step_ic_datasheet_fetch_start': '器件资料获取 - 开始',
  'step_ic_datasheet_fetch_done': '器件资料获取 - 完成',
  // 分组标签
  'timeline.group.parse': '解析阶段',
  'timeline.group.search': '检索阶段',
  'timeline.group.analyze': '分析阶段',
  'timeline.group.request': '请求阶段',
  'timeline.group.frontend': '前端操作',
  'timeline.group.other': '其他',
  // 来源标识（前端 / 后端）
  'timeline.origin.frontend': '前端',
  'timeline.origin.backend': '后端',
  // LLM 交互标签
  'timeline.tag.llm_sent': '发给LLM',
  'timeline.tag.llm_received': '收到LLM',

  // FileUpload 层
  'upload.select': '选择文件',
  'upload.selected': '已选 {count} / {max}',
  'upload.remove': '移除',

  // ResultView 层
  'overlay.mapping.entries': 'Overlay 映射条目：{count}',
  'overlay.enrichedJson.title': '结构化描述（enrichedJson）',

  // 通用/告警
  'warning.noSystemPrompt': '当前运行在无系统提示词环境下，输出质量与一致性无法保证。请在 `./ReviewAIPrompt/` 子目录或仓库根目录添加或完善系统提示词文件。',
  'common.close': '关闭',
  'common.none': '无',
}

const dictEn: Record<string, string> = {
  // app layer
  'app.title': 'Review Tool',
  'app.theme.toDark': 'Dark Mode',
  'app.theme.toLight': 'Light Mode',
  'app.lang.toggle': 'EN/中',
  'app.modelApi.label': 'Model API URL',
  'app.modelApi.option.custom': 'Custom (enter API URL)',
  'app.modelApi.placeholder.customUrl': 'https://your-api.example.com/path',
  'app.modelName.label': 'Model Name',
  'app.modelName.option.custom': 'Custom (enter model name)',
  'app.modelName.placeholder.customName': 'Custom model name (e.g. my-custom-model)',
  'app.modelApi.note.fixed': 'Fixed model API URL',
  'app.modelName.note.customApi': 'Custom API selected: please input a model name; the dropdown is frozen.',
  'app.modelName.note.openrouter': 'OpenRouter selected: you may enter a custom model name; if empty, the dropdown model will be used.',
  'app.apiKey.label': 'API Key',
  'app.apiKey.placeholder': 'Paste your API Key here',
  'app.apiKey.hint': 'Click to input or paste your OpenRouter API Key',
  'app.sessions.toggle.show': 'Load Sessions',
  'app.sessions.toggle.hide': 'Hide Sessions',
  'app.sessions.refresh': 'Refresh',
  'app.sessions.empty': 'No sessions. Click Refresh to retry.',
  'app.sessions.load': 'Load Session',
  'app.sessions.delete': 'Delete',
  'app.tabs.circuit': 'Circuit Review',
  'app.tabs.circuit_single': 'Circuit Single-agent Review',
  'app.tabs.circuit_multi': 'Circuit Multi-agent Review',
  'app.sessions.list': 'Sessions',
  'app.tabs.code': 'Code Review',
  'app.tabs.doc': 'Doc Review',
  'app.tabs.req': 'Requirements Review',
  'app.tab.todo': '(TBD)',
  'app.result.title': 'Results',
  'app.result.waiting': 'Waiting for result...',
  'app.error.loadSession': 'Failed to load session: {msg}',
  'app.error.deleteSession': 'Failed to delete session: {msg}',

  // ReviewForm layer
  'form.upload.label': 'File Upload',
  'form.req.label': 'Requirements (system prompt)',
  'form.spec.label': 'Specs (system prompt)',
  'form.advanced.label': 'Advanced Settings',
  'form.multiPass.enable': 'Enable Multi-Pass Recognition',
  'form.multiPass.passes': 'Recognition Passes (fixed to 5)',
  'form.multiPass.singleNote': 'Uses general recognition when disabled',
  'form.multiPass.multiNote': 'Multi-pass enabled (5 steps)',
  'form.search.enable': 'Enable Component Search',
  'form.directReview.label': 'Enable Direct LLM Review (skip vision parsing)',
  'form.directReview.note': 'When enabled the image and optional datasheets are sent directly to the language model for review',
  'form.search.topN': 'Search Results Count',
  'form.search.note': 'Enable component search to assist recognition',
  'form.saveEnriched.enable': 'Save Parsed Results',
  'form.qc.label': 'Question Confirm (model feedback)',
  'form.qc.placeholder': 'Questions or clarifications from the model will show here (paged).',
  'form.dialog.label': 'Dialog (LLM)',
  'form.dialog.placeholder.editable': 'Enter your message to the model (for current page)',
  'form.dialog.placeholder.readonly': 'Read-only on non-last page: focusing will jump to the last page for editing',
  'form.paging.current': 'Page {page} / {total}',
  'form.paging.prev': 'Prev',
  'form.paging.next': 'Next',
  'form.progress.current': 'Current step: {step}',
  'form.progress.elapsed': 'Elapsed: {seconds}s',
  'form.submit.loading': 'Submitting...',
  'form.submit': 'Submit',
  'form.reset': 'Reset',
  'form.abort': 'Abort',
  'form.save.loading': 'Saving...',
  'form.save': 'Save Session',
  'form.save.ok': 'Session saved',
  'form.save.fail': 'Failed to save session: {msg}',
  'form.reset.confirm': 'There are unsaved changes. Save first?',
  'form.customApi.warning': 'Warning: You are using a custom/unknown API URL. The system will not validate its availability. If errors occur, check the URL or switch to a supported one.',
  'form.error.timeout': 'Request timed out: upstream is slow or network unstable. Try /beta path or retry later.',
  'form.error.submitFail': 'Submit failed',
  'form.error.aborted': 'Aborted',
  // timeline label
  'timeline.label': 'Step timeline',
  'timeline.detail': 'Step detail',
  'timeline.llmResponse': 'LLM Response Content',
  'timeline.visionResult': 'Vision Analysis Result',
  'timeline.clarifyingQuestions': 'Clarifying Questions',
  'timeline.reviewReport': 'Review Report',
  'timeline.fullResponse': 'Full Response',
  'timeline.componentsCount': 'Components Count',
  'timeline.connectionsCount': 'Connections Count',
  'timeline.netsCount': 'Nets Count',
  'timeline.hasOverlay': 'Includes visual overlay',
  'timeline.enrichedComponentsCount': 'Enriched components',
  'timeline.visualization': 'Visualization',
  'timeline.paramEnrichment': 'Parameter enrichment',
  'timeline.uploadInfo': 'Upload File Information',
  'timeline.requestInfo': 'Request Information',
  'timeline.cachedData': 'Cached Data',
  'timeline.fileCount': 'File Count',
  'timeline.apiUrl': 'API URL',
  'timeline.model': 'Model',
  'timeline.hasSystemPrompt': 'Has System Prompt',
  'timeline.hasFiles': 'Has Files',
  'timeline.hasDialog': 'Has Dialog',
  'timeline.visionModel': 'Vision Model',
  'timeline.languageModel': 'Language Model',
  'timeline.processedFiles': 'Processed Files',
  'timeline.hasCircuitData': 'Has Circuit Data',
  'timeline.hasRequirements': 'Has Requirements',
  'timeline.hasSpecs': 'Has Specifications',
  'timeline.hasHistory': 'Has History',
  'timeline.returnContent': 'Return Content',
  'timeline.fullStructuredDescription': 'View Full Structured Description (JSON)',
  'timeline.datasheetDetails': 'IC Component Datasheet Download Details',
  'timeline.retrievedComponents': 'Retrieved IC Components',
  'timeline.successfulDownloads': 'Successful Downloads',
  'timeline.allDatasheetInfo': 'View All IC Component Datasheet Information',
  'timeline.sourceType': 'Source Type',
  'timeline.documentTitle': 'Document Title',
  'timeline.sourceUrl': 'Source URL',
  'timeline.confidence': 'Confidence',
  'timeline.retrievalTime': 'Retrieval Time',
  'timeline.status': 'Status',
  'timeline.otherCandidates': 'Other Candidates',
  'timeline.multiPassRecognition': 'Multi-Pass Recognition',
  'timeline.consolidation': 'Result Consolidation',
  'timeline.totalPasses': 'Total Passes',
  'timeline.successfulPasses': 'Successful Passes',
  'timeline.totalProcessingTime': 'Total Processing Time',
  'timeline.averageTimePerPass': 'Average Time Per Pass',
  'timeline.multiPassInfo': 'Multi-Pass Info',
  'timeline.multiPassResult': 'Multi-Pass Result',
  'timeline.resultCount': 'Result Count',
  'timeline.consolidatedComponents': 'Consolidated Components',
  'timeline.consolidatedConnections': 'Consolidated Connections',
  'timeline.consolidationInfo': 'Consolidation Info',
  'timeline.consolidationResult': 'Consolidation Result',
  'timeline.consolidationFallback': 'Consolidation Fallback',
  'timeline.group.vision': 'Vision Processing',
  'timeline.group.llm': 'Language Model',
  'timeline.group.response': 'Response Processing',

  // steps
  'step_idle': 'Idle',
  'step_preparing': 'Preparing',
  'step_uploading_files': 'Uploading files',
  'step_using_cached_enriched_json': 'Using parsed data',
  'step_sending_request': 'Sending request',
  'step_done': 'Done',
  'step_images_processing_start': 'Image processing - start',
  'step_images_processing_done': 'Image processing - done',
  'step_images_processing_skipped': 'Image processing - skipped',
  'step_request_received': 'Request received',
  'step_datasheets_fetch_done': 'Datasheets fetch - done',
  'step_second_stage_analysis_start': 'Second-stage analysis - start',
  'step_second_stage_analysis_done': 'Second-stage analysis - done',
  'step_analysis_result': 'Analysis result',
  'step_clarifying_question': 'Clarifying question',
  'step_aborted': 'Aborted',
  'step_llm_request_start': 'LLM request - start',
  'step_llm_request_done': 'LLM request - done',
  'step_multi_pass_recognition_start': 'Multi-pass recognition - start',
  'step_multi_pass_recognition_done': 'Multi-pass recognition - done',
  // 兼容 dot 形式（backend timeline uses dotted names）
  'step_llm.request': 'LLM request',
  'step_llm.response': 'LLM response',
  // Identify & Search steps (dot and underscore forms)
  'step_identify.request': 'Identify key facts - request',
  'step_identify.response': 'Identify key facts - response',
  'step_identify_request': 'Identify key facts - request',
  'step_identify_response': 'Identify key facts - response',
  'step_search.query': 'Web search - query',
  'step_search.hit': 'Web search - hit',
  'step_search.summary': 'Web search - summary',
  'step_search.summary.saved': 'Web search - summary saved',
  'step_search.summary.failed': 'Search summary failed',
  'step_search.fallback.query': 'Web search - fallback query',
  'step_search.trace.summary.saved': 'Web search - trace summary saved',
  // Added: search LLM raw interaction (dot and underscore)
  'step_search.llm.request': 'Search LLM request',
  'step_search.llm.response': 'Search LLM response',
  'step_search_llm_request': 'Search LLM request',
  'step_search_llm_response': 'Search LLM response',
  'step_search_query': 'Web search - query',
  'step_search_hit': 'Web search - hit',
  'step_search_summary': 'Web search - summary',
  'step_search_summary_saved': 'Web search - summary saved',
  'step_search_fallback_query': 'Web search - fallback query',
  'step_search_trace_summary_saved': 'Web search - trace summary saved',
  'step_recognition_consolidation_start': 'Recognition consolidation - start',
  'step_recognition_consolidation_done': 'Recognition consolidation - done',
  'step_recognition_consolidation_fallback': 'Recognition consolidation - fallback',
  'step_ocr_recognition_start': 'OCR recognition - start',
  'step_ocr_recognition_done': 'OCR recognition - done',
  'step_ocr_recognition_failed': 'OCR recognition - failed',
  'step_component_enrichment_start': 'Component enrichment - start',
  'step_component_enrichment_done': 'Component enrichment - done',
  'step_ic_datasheet_fetch_start': 'IC datasheet fetch - start',
  'step_ic_datasheet_fetch_done': 'IC datasheet fetch - done',
  // groups
  'timeline.group.parse': 'Parse',
  'timeline.group.search': 'Search',
  'timeline.group.analyze': 'Analyze',
  'timeline.group.request': 'Request',
  'timeline.group.frontend': 'Frontend',
  'timeline.group.other': 'Other',
  // origin tags
  'timeline.origin.frontend': 'Frontend',
  'timeline.origin.backend': 'Backend',
  // LLM tags
  'timeline.tag.llm_sent': 'Sent to LLM',
  'timeline.tag.llm_received': 'Received from LLM',

  // FileUpload
  'upload.select': 'Select Files',
  'upload.selected': 'Selected {count} / {max}',
  'upload.remove': 'Remove',

  // ResultView
  'overlay.mapping.entries': 'Overlay mapping entries: {count}',
  'overlay.enrichedJson.title': 'Structured description (enrichedJson)',

  // Common/Warnings
  'warning.noSystemPrompt': 'Running without a system prompt; output quality and consistency cannot be guaranteed. Please add a system prompt file at the repository root.',
  'common.close': 'Close',
  'common.none': 'None',
}

const DICTS: Record<Lang, Record<string, string>> = { zh: dictZh, en: dictEn }

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(.*?)\}/g, (_, k) => {
    const v = params[k]
    return (v === undefined || v === null) ? '' : String(v)
  })
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang())

  // 中文注释：同步 <html lang> 与本地存储
  useEffect(() => {
    try { localStorage.setItem('lang', lang) } catch {}
    try { document.documentElement.setAttribute('lang', lang) } catch {}
  }, [lang])

  const setLang = (l: Lang) => setLangState(l)

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>) => {
      const d = DICTS[lang] || dictZh
      let template = d[key]
      if (!template) {
        template = (dictZh as any)[key] || key
        try { console.warn('[i18n] Missing key:', key) } catch {}
      }
      return interpolate(template, params)
    }
  }, [lang])

  const value = useMemo<I18nContextType>(() => ({ lang, setLang, t }), [lang, t])

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}


