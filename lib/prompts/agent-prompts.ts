import { readFileSync } from "node:fs"
import { join } from "node:path"

import { agentsConfig } from "@/lib/agents/config"

export type AgentPromptResult = {
  agentId: string
  agentName: string
  prompt: string
}

const PROMPTS_DIR = join(process.cwd(), "提示词")

// Very small in-memory cache; prompts are static files in production.
const cache = new Map<string, AgentPromptResult>()

export function getAgentPrompt(agentId: string): AgentPromptResult | null {
  const normalized = String(agentId || "").trim()
  if (!normalized) return null

  const cached = cache.get(normalized)
  if (cached) return cached

  const config = agentsConfig.find((a) => a.id === normalized)
  if (!config?.promptFile) return null

  try {
    const promptPath = join(PROMPTS_DIR, config.promptFile)
    const prompt = readFileSync(promptPath, "utf8").trim()
    if (!prompt) return null

    const result: AgentPromptResult = {
      agentId: normalized,
      agentName: config.name,
      prompt,
    }
    cache.set(normalized, result)
    return result
  } catch {
    return null
  }
}
