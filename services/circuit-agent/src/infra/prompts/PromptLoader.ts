/*
功能：提示词加载器（PromptLoader）
用途：从 ReviewAIPrompt/ 目录读取提示词文本并缓存；在严格模式下缺失或空文件抛出 PromptLoadError。
参数：
- loadPrompt(agentName, filename)
- preloadPrompts(agentName, filenames, { strict })
返回：
- Promise<string> 或 Promise<void>
示例：
// await PromptLoader.preloadPrompts('circuit-agent', ['system_prompt_initial_zh.md'], { strict: true })
*/
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * PromptLoadError - 提示词加载错误
 */
export class PromptLoadError extends Error {
  constructor(message: string, public readonly path: string) {
    super(`${message} (path: ${path})`);
    this.name = 'PromptLoadError';
  }
}

/**
 * PromptLoader - 提示词加载器
 * 从 ReviewAIPrompt/ 目录加载提示词文件，支持静态缓存
 */
export class PromptLoader {
  private static cache = new Map<string, string>();

  /**
   * 加载提示词文件
   * @param agentName - agent 名称（'circuit-agent' | 'circuit-fine-agent'）
   * @param promptType - 提示词类型（'system' | 'pass'）
   * @param language - 语言（'zh' | 'en'）
   * @param variant - 变体（'initial' | 'revision' | 'macro' | 'ic' | 'rc' | 'net' | 'verify' | 'consolidation'）
   * @returns 提示词内容
   * @throws PromptLoadError - 文件不存在或为空
   */
  static loadPrompt(
    agentName: string,
    promptType: 'system' | 'pass',
    language: 'zh' | 'en',
    variant?: string
  ): string {
    // 构建文件路径
    let filename: string;
    if (promptType === 'system') {
      if (variant === 'initial' || variant === 'revision') {
        filename = `system_prompt_${variant}_${language}.md`;
      } else {
        filename = `system_prompt_${language}.md`;
      }
    } else {
      // pass 类型，variant 必须提供
      if (!variant) {
        throw new PromptLoadError(
          'variant is required for pass type prompts',
          `ReviewAIPrompt/${agentName}/[variant]_prompt.md`
        );
      }
      filename = `${variant}_prompt.md`;
    }

    const relativePath = `ReviewAIPrompt/${agentName}/${filename}`;
    // 中文注释：ES modules 环境下获取当前文件目录，然后向上回溯到项目根
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const projectRoot = path.resolve(__dirname, '../../../../..');
    const absolutePath = path.resolve(projectRoot, relativePath);

    // 检查缓存
    if (this.cache.has(absolutePath)) {
      return this.cache.get(absolutePath)!;
    }

    // 读取文件
    try {
      if (!fs.existsSync(absolutePath)) {
        throw new PromptLoadError(`Prompt file not found`, absolutePath);
      }

      const content = fs.readFileSync(absolutePath, 'utf-8').trim();

      if (content.length === 0) {
        throw new PromptLoadError(`Prompt file is empty`, absolutePath);
      }

      // 缓存内容
      this.cache.set(absolutePath, content);
      return content;
    } catch (error) {
      if (error instanceof PromptLoadError) {
        throw error;
      }
      throw new PromptLoadError(
        `Failed to load prompt file: ${(error as Error).message}`,
        absolutePath
      );
    }
  }

  /**
   * 清除缓存（用于测试或热更新）
   */
  static clearCache(): void {
    this.cache.clear();
  }

  /**
   * 预热缓存（可选，用于启动时加载所有提示词）
   * @param agentName - agent 名称
   * @param variants - 变体列表
   * @param languages - 语言列表
   */
  static preloadPrompts(
    agentName: string,
    variants: Array<{ type: 'system' | 'pass'; variant?: string }>,
    languages: Array<'zh' | 'en'>,
    options?: { strict?: boolean }
  ): void {
    const strict = Boolean(options?.strict)
    for (const { type, variant } of variants) {
      for (const language of languages) {
        try {
          this.loadPrompt(agentName, type, language, variant);
        } catch (error) {
          const msg = `[PromptLoader] Failed to preload prompt: ${(error as Error).message}`
          if (strict) {
            // 严格模式：直接抛出，以便调用方 fail-fast
            throw new PromptLoadError(msg, (error as any)?.path || '')
          } else {
            // 非严格模式：记录错误但不中断
            console.error(msg)
          }
        }
      }
    }
  }
}

