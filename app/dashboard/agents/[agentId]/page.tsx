import { notFound } from "next/navigation"

import { Header } from "@/components/ui/obsidian"
import { agentsConfig } from "@/lib/agents/config"

import AgentChatClient from "./AgentChatClient"

function displayTitleFromPromptFile(promptFile: string) {
  const last = promptFile.split("/").pop() || promptFile
  return last.replace(/\.(md|txt)$/i, "")
}

function replaceBrand(input: string) {
  return input.replace(/星盒/g, "IP内容工厂")
}

export default async function AgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>
  searchParams?: Promise<{ file?: string }>
}) {
  const { agentId } = await params
  const agent = agentsConfig.find((a) => a.id === agentId)
  if (!agent) return notFound()

  const sp = searchParams ? await searchParams : undefined
  const file = typeof sp?.file === "string" ? sp.file : undefined

  const promptFile = agent.promptFile || file
  if (!promptFile) return notFound()

  const displayName =
    agent.id === "prompt-runner" && file ? replaceBrand(displayTitleFromPromptFile(file)) : replaceBrand(agent.name)

  const displayDescription =
    agent.id === "prompt-runner" && file
      ? `提示词执行器 · ${replaceBrand(file)}`
      : replaceBrand(agent.description)

  return (
    <div className="min-h-screen">
      <Header
        breadcrumbs={[
          { label: "首页", href: "/dashboard" },
          { label: "智能体库", href: "/dashboard/profiles" },
          { label: displayName },
        ]}
      />
      <AgentChatClient
        agentId={agent.id}
        agentName={displayName}
        agentDescription={displayDescription}
        promptFile={promptFile}
      />
    </div>
  )
}
