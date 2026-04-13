/**
 * Minimal controller for aborting an in-flight realtime turn.
 */
export class BargeInController {
  private abortControllers: AbortController[] = []
  private asrAbortable: { abort(): void } | null = null
  private ttsAbortables: Array<{ abort(): void }> = []

  /**
   * Register the active turn resources that should be aborted together.
   */
  register(params: {
    abortControllers?: AbortController[]
    asrInstance?: { abort(): void } | null
    ttsInstances?: Array<{ abort(): void }>
  }): void {
    this.abortControllers = [...(params.abortControllers || [])]
    this.asrAbortable = params.asrInstance ?? null
    this.ttsAbortables = [...(params.ttsInstances || [])]
  }

  /**
   * Abort all currently tracked realtime work.
   */
  execute(): { interrupted: boolean } {
    let interrupted = false

    for (const controller of this.abortControllers) {
      try {
        controller.abort("barge_in")
        interrupted = true
      } catch {
        // Ignore abort errors.
      }
    }

    try {
      this.asrAbortable?.abort()
      interrupted = true
    } catch {
      // Ignore abort errors.
    }

    for (const tts of this.ttsAbortables) {
      try {
        tts.abort()
        interrupted = true
      } catch {
        // Ignore abort errors.
      }
    }

    this.reset()
    return { interrupted }
  }

  /**
   * Clear the tracked realtime work without aborting it.
   */
  reset(): void {
    this.abortControllers = []
    this.asrAbortable = null
    this.ttsAbortables = []
  }
}
