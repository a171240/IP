import "server-only"

import { readFileSync } from "node:fs"
import { join, normalize, sep } from "node:path"

import { agentsConfig } from "./config"

export type AgentPromptInfo = {
  id: string
  name: string
  prompt: string
}

function safeJoinPromptsDir(promptFile: string): string {
  const baseDir = join(process.cwd(), "\u63d0\u793a\u8bcd")
  const fullPath = join(baseDir, promptFile)
  const normalizedBase = normalize(baseDir + sep)
  const normalizedFull = normalize(fullPath)
  if (!normalizedFull.startsWith(normalizedBase)) {
    throw new Error("Invalid prompt file path")
  }
  return fullPath
}

export function getAgentPrompt(agentId: string): AgentPromptInfo | null {
  const agent = agentsConfig.find((a) => a.id === agentId)
  if (!agent?.promptFile) return null

  try {
    const promptPath = safeJoinPromptsDir(agent.promptFile)
    const prompt = readFileSync(promptPath, "utf8").trim()
    if (!prompt) return null
    return { id: agent.id, name: agent.name, prompt }
  } catch {
    return null
  }
}
