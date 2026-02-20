import "server-only"

import { readPromptFile } from "@/lib/prompts/prompts.server"
import { rewritePromptFileMap } from "@/lib/prompts/step-prompts"
import type { RewriteTargetId } from "@/lib/types/content-pipeline"

type RewritePromptFileId = keyof typeof rewritePromptFileMap

const targetPromptKeyMap: Record<RewriteTargetId, RewritePromptFileId> = {
  douyin_video: "REWRITE_DOUYIN_VIDEO",
  xhs_note: "REWRITE_XHS_NOTE",
}

const promptCache = new Map<string, string>()

async function loadPrompt(relativePath: string): Promise<string> {
  const cached = promptCache.get(relativePath)
  if (cached) return cached

  const { content } = await readPromptFile(relativePath)
  const text = content.toString("utf-8").trim()
  if (!text) throw new Error(`prompt_empty:${relativePath}`)

  promptCache.set(relativePath, text)
  return text
}

export async function loadRewritePromptBundle(target: RewriteTargetId): Promise<{
  basePrompt: string
  targetPrompt: string
  files: { base: string; target: string }
}> {
  const base = rewritePromptFileMap.REWRITE_BASE
  const targetFile = rewritePromptFileMap[targetPromptKeyMap[target]]

  const [basePrompt, targetPrompt] = await Promise.all([loadPrompt(base), loadPrompt(targetFile)])

  return {
    basePrompt,
    targetPrompt,
    files: {
      base,
      target: targetFile,
    },
  }
}
