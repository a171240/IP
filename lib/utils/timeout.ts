/**
 * 为 Promise 添加超时限制
 * @param promise 要执行的 Promise
 * @param timeoutMs 超时时间（毫秒）
 * @param errorMessage 超时错误信息
 * @returns Promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = '请求超时'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ])
}

/**
 * 带重试的请求函数
 * @param fn 要执行的异步函数
 * @param options 配置选项
 * @returns Promise
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number
    timeout?: number
    onRetry?: (attempt: number, error: Error) => void
  } = {}
): Promise<T> {
  const { retries = 3, timeout = 10000, onRetry } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(
        fn(),
        timeout,
        `请求超时（${timeout / 1000}秒）`
      )
      return result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // 如果不是最后一次尝试，调用重试回调
      if (attempt < retries) {
        onRetry?.(attempt, lastError)
        // 指数退避：第一次等 500ms，第二次等 1000ms
        await new Promise(resolve => setTimeout(resolve, attempt * 500))
      }
    }
  }

  throw lastError || new Error('请求失败')
}
