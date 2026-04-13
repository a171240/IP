import { describe, expect, it } from "vitest"
import { SentenceSplitter } from "../pipeline/sentence-splitter.js"

describe("SentenceSplitter", () => {
  it("emits normal sentences", () => {
    const splitter = new SentenceSplitter()
    expect(splitter.feed("这是一句足够长的话。今")).toEqual(["这是一句足够长的话。"])
    expect(splitter.feed("天具体怎么样呢？")).toEqual(["今天具体怎么样呢？"])
  })

  it("keeps short sentences buffered until they can be merged", () => {
    const splitter = new SentenceSplitter({ minSentenceLength: 8 })
    expect(splitter.feed("好。")).toEqual([])
    expect(splitter.feed("那我们继续聊一下。")).toEqual(["好。那我们继续聊一下。"])
  })

  it("forces split on long buffers", () => {
    const splitter = new SentenceSplitter({ maxBufferLength: 10 })
    expect(splitter.feed("这是一个没有标点的很长很长的句子")).toEqual(["这是一个没有标点的很长很长的句子".slice(0, 10)])
  })

  it("does not split punctuation inside quotes", () => {
    const splitter = new SentenceSplitter()
    expect(splitter.feed("她说“你好。”然后继续。")).toEqual(["她说“你好。”然后继续。"])
  })

  it("flushes trailing text", () => {
    const splitter = new SentenceSplitter()
    splitter.feed("最后一句还没结束")
    expect(splitter.flush()).toBe("最后一句还没结束")
  })
})
