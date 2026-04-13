const BOUNDARY_CHARS = new Set(["。", "！", "？", "…", "；", "\n"])
const OPEN_QUOTES = new Map<string, string>([
  ["“", "”"],
  ["‘", "’"],
  ["「", "」"],
  ["『", "』"],
  ["《", "》"],
  ["(", ")"],
  ["（", "）"],
  ["[", "]"],
  ["{", "}"],
])
const CLOSE_QUOTES = new Set(Array.from(OPEN_QUOTES.values()).concat(["\"", "'"]))

function isBoundaryChar(ch: string): boolean {
  return BOUNDARY_CHARS.has(ch)
}

function quoteDepth(text: string, endExclusive: number): number {
  const stack: string[] = []
  for (let i = 0; i < endExclusive; i += 1) {
    const ch = text[i]
    if (!ch) continue
    if (ch === "\"") {
      if (stack[stack.length - 1] === "\"") stack.pop()
      else stack.push("\"")
      continue
    }
    if (OPEN_QUOTES.has(ch)) {
      stack.push(OPEN_QUOTES.get(ch) || "")
      continue
    }
    if (CLOSE_QUOTES.has(ch)) {
      const expected = stack[stack.length - 1]
      if (expected === ch) stack.pop()
    }
  }
  return stack.length
}

/**
 * Detect sentence boundaries in streamed Chinese text.
 */
export class SentenceSplitter {
  private buffer = ""
  private sentenceIndex = 0
  private readonly minSentenceLength: number
  private readonly maxBufferLength: number

  constructor(opts: { minSentenceLength?: number; maxBufferLength?: number } = {}) {
    this.minSentenceLength = Math.max(1, opts.minSentenceLength ?? 8)
    this.maxBufferLength = Math.max(this.minSentenceLength, opts.maxBufferLength ?? 80)
  }

  /**
   * Feed streaming text and emit completed sentences.
   */
  feed(delta: string): string[] {
    if (!delta) return []
    this.buffer += delta
    const emitted: string[] = []

    while (this.buffer.length) {
      const boundaryIndex = this.findBoundaryIndex(this.buffer)
      if (boundaryIndex >= 0) {
        const sentence = this.buffer.slice(0, boundaryIndex + 1).trim()
        this.buffer = this.buffer.slice(boundaryIndex + 1)
        if (sentence) {
          emitted.push(sentence)
          this.sentenceIndex += 1
        }
        continue
      }

      if (this.buffer.length >= this.maxBufferLength) {
        const forced = this.buffer.slice(0, this.maxBufferLength).trim()
        this.buffer = this.buffer.slice(this.maxBufferLength)
        if (forced) {
          emitted.push(forced)
          this.sentenceIndex += 1
        }
        continue
      }

      break
    }

    return emitted
  }

  /**
   * Flush any remaining buffered text as the last sentence.
   */
  flush(): string | null {
    const remaining = this.buffer.trim()
    this.buffer = ""
    if (!remaining) return null
    this.sentenceIndex += 1
    return remaining
  }

  private findBoundaryIndex(text: string): number {
    let lastCandidate = -1
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i]
      if (!ch || !isBoundaryChar(ch)) continue
      const candidate = text.slice(0, i + 1).trim()
      if (candidate.length < this.minSentenceLength) continue
      if (quoteDepth(text, i + 1) > 0) continue
      lastCandidate = i
    }
    return lastCandidate
  }
}
