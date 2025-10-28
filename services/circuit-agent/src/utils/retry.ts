/**
 * 简单的 retry 工具：执行异步函数，失败时重试一次
 */
export async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    // 再试一次
    return await fn()
  }
}

export default { retryOnce }


