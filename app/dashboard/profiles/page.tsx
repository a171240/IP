"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Factory,
  FileText,
  Lightbulb,
  Search,
  Store,
} from "lucide-react"

import { GlassCard, Header } from "@/components/ui/obsidian"
import type { AgentConfig, AgentScene } from "@/lib/agents/config"
import { agentsConfig, sceneConfig } from "@/lib/agents/config"

import { PromptPreviewSheet } from "./PromptPreviewSheet"

type PromptFileEntry = {
  relativePath: string
  fileName: string
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

function replaceBrand(input: string) {
  return input.replace(/星盒/g, "IP内容工厂")
}

function stripNumericPrefix(input: string) {
  return input.replace(/^\s*\d+\.\s*/, "")
}

function displayTitleFromFileName(fileName: string) {
  const base = fileName.replace(/\.(md|txt)$/i, "")
  return replaceBrand(stripNumericPrefix(base))
}

function fileNameFromRelativePath(relativePath: string) {
  const parts = relativePath.split("/")
  return parts[parts.length - 1] || relativePath
}

function subCategoryFromRelativePath(relativePath: string) {
  const parts = relativePath.split("/")
  return parts.length >= 2 ? parts[1] : ""
}

const sceneOrder: AgentScene[] = ["research", "creation", "topic", "marketing", "efficiency"]

const sceneStyles: Record<
  AgentScene,
  { iconWrap: string; icon: string; card: string; cardIconWrap: string; cardIcon: string }
> = {
  workflow: {
    iconWrap: "bg-purple-500/10 border border-purple-500/20",
    icon: "text-purple-300",
    card: "bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 hover:border-purple-500/35",
    cardIconWrap: "bg-purple-500/10 border border-purple-500/20",
    cardIcon: "text-purple-300",
  },
  research: {
    iconWrap: "bg-violet-500/10 border border-violet-500/20",
    icon: "text-violet-300",
    card: "bg-gradient-to-br from-violet-500/10 to-transparent border border-violet-500/20 hover:border-violet-500/35",
    cardIconWrap: "bg-violet-500/10 border border-violet-500/20",
    cardIcon: "text-violet-300",
  },
  creation: {
    iconWrap: "bg-emerald-500/10 border border-emerald-500/20",
    icon: "text-emerald-300",
    card: "bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 hover:border-emerald-500/35",
    cardIconWrap: "bg-emerald-500/10 border border-emerald-500/20",
    cardIcon: "text-emerald-300",
  },
  topic: {
    iconWrap: "bg-blue-500/10 border border-blue-500/20",
    icon: "text-blue-300",
    card: "bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20 hover:border-blue-500/35",
    cardIconWrap: "bg-blue-500/10 border border-blue-500/20",
    cardIcon: "text-blue-300",
  },
  marketing: {
    iconWrap: "bg-amber-500/10 border border-amber-500/20",
    icon: "text-amber-300",
    card: "bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 hover:border-amber-500/35",
    cardIconWrap: "bg-amber-500/10 border border-amber-500/20",
    cardIcon: "text-amber-300",
  },
  efficiency: {
    iconWrap: "bg-zinc-500/10 border border-zinc-500/20",
    icon: "text-zinc-300",
    card: "bg-gradient-to-br from-zinc-500/10 to-transparent border border-zinc-500/20 hover:border-zinc-500/35",
    cardIconWrap: "bg-zinc-500/10 border border-zinc-500/20",
    cardIcon: "text-zinc-300",
  },
}

export default function ProfilesPage() {
  const router = useRouter()

  const [searchQuery, setSearchQuery] = useState("")
  const query = searchQuery.trim().toLowerCase()

  const [previewOpen, setPreviewOpen] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null)

  const [retailExpanded, setRetailExpanded] = useState(true)
  const [verticalExpanded, setVerticalExpanded] = useState(false)
  const [expandedScenes, setExpandedScenes] = useState<Set<AgentScene>>(() => new Set<AgentScene>(sceneOrder))

  const [expandedRetailSubs, setExpandedRetailSubs] = useState<Set<string>>(() => new Set<string>())
  const [didInitRetailSubs, setDidInitRetailSubs] = useState(false)

  const [retailFiles, setRetailFiles] = useState<PromptFileEntry[]>([])
  const [verticalFiles, setVerticalFiles] = useState<PromptFileEntry[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        setLoadError(null)
        const retail = await fetchJson<{ files: PromptFileEntry[] }>(
          `/api/prompts?dir=${encodeURIComponent("实体店营销全家桶")}`
        )
        setRetailFiles(retail.files || [])

        const vertical = await fetchJson<{ files: PromptFileEntry[] }>(
          `/api/prompts?dir=${encodeURIComponent("各垂类正反观点情绪选题生成器")}`
        )
        setVerticalFiles(vertical.files || [])
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "加载失败")
      }
    }

    run()
  }, [])

  const handleOpenPromptAgent = (agent: AgentConfig) => {
    setSelectedAgent(agent)
    setPreviewOpen(true)
  }

  const runAgentFromLibrary = (agentId: string, promptFile?: string) => {
    const base = `/dashboard/agents/${agentId}`
    if (promptFile && promptFile.trim()) {
      router.push(`${base}?file=${encodeURIComponent(promptFile)}`)
      return
    }
    router.push(base)
  }

  const agentsForScenes = useMemo(() => {
    const filtered = agentsConfig.filter(
      (a) => a.scene !== "workflow" && a.id !== "cyber-ip-clone" && a.id !== "prompt-runner"
    )

    if (!query) return filtered

    return filtered.filter((a) => {
      const name = replaceBrand(a.name || "").toLowerCase()
      const desc = replaceBrand(a.description || "").toLowerCase()
      return name.includes(query) || desc.includes(query)
    })
  }, [query])

  const groupedByScene = useMemo(() => {
    const grouped: Record<AgentScene, AgentConfig[]> = {
      workflow: [],
      research: [],
      creation: [],
      topic: [],
      marketing: [],
      efficiency: [],
    }

    for (const a of agentsForScenes) grouped[a.scene].push(a)
    return grouped
  }, [agentsForScenes])

  const retailGroups = useMemo(() => {
    const groups = new Map<string, PromptFileEntry[]>()
    for (const f of retailFiles) {
      if (f.fileName.includes("摸象竞品视频拉片分析")) continue

      const sub = subCategoryFromRelativePath(f.relativePath) || "其它"
      const list = groups.get(sub) || []
      list.push(f)
      groups.set(sub, list)
    }

    for (const [k, list] of groups) {
      list.sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-Hans-CN"))
      groups.set(k, list)
    }

    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], "zh-Hans-CN"))
  }, [retailFiles])

  const filteredRetailGroups = useMemo(() => {
    if (!query) return retailGroups
    const out: Array<[string, PromptFileEntry[]]> = []
    for (const [sub, list] of retailGroups) {
      const filtered = list.filter((f) => displayTitleFromFileName(f.fileName).toLowerCase().includes(query))
      if (filtered.length) out.push([sub, filtered])
    }
    return out
  }, [query, retailGroups])

  useEffect(() => {
    if (didInitRetailSubs) return
    if (retailGroups.length === 0) return
    setExpandedRetailSubs(new Set([retailGroups[0][0]]))
    setDidInitRetailSubs(true)
  }, [didInitRetailSubs, retailGroups])

  const filteredVerticalFiles = useMemo(() => {
    if (!query) return verticalFiles
    return verticalFiles.filter((f) => displayTitleFromFileName(f.fileName).toLowerCase().includes(query))
  }, [query, verticalFiles])

  const toggleScene = (scene: AgentScene) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev)
      if (next.has(scene)) next.delete(scene)
      else next.add(scene)
      return next
    })
  }

  const toggleRetailSub = (sub: string) => {
    setExpandedRetailSubs((prev) => {
      const next = new Set(prev)
      if (next.has(sub)) next.delete(sub)
      else next.add(sub)
      return next
    })
  }

  const expandAllRetailSubs = () => {
    setExpandedRetailSubs(new Set(filteredRetailGroups.map(([sub]) => sub)))
  }

  const collapseAllRetailSubs = () => {
    setExpandedRetailSubs(new Set())
  }

  return (
    <div className="min-h-screen">
      <Header breadcrumbs={[{ label: "首页", href: "/dashboard" }, { label: "智能体库" }]} />

      <main className="p-6 lg:p-8">
        <div className="max-w-6xl mx-auto w-full space-y-6">
          <GlassCard className="relative overflow-hidden p-6">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/15 via-cyan-500/10 to-transparent" />
            <div className="relative">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-medium dark:text-white text-zinc-900 tracking-tight">{"智能体库"}</h1>
                  <p className="text-sm dark:text-zinc-400 text-zinc-500 mt-2">{"分类浏览提示词：预览、下载、一键调用"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-[11px] px-2.5 py-1 rounded-full border border-orange-500/20 bg-orange-500/10 text-orange-300">
                    {"实体店全家桶 "} {retailFiles.length}
                  </span>
                  <span className="text-[11px] px-2.5 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                    {"垂类情绪选题 "} {verticalFiles.length}
                  </span>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索：智能体 / 实体店全家桶 / 垂类情绪选题..."
                className="w-full pl-12 pr-4 py-3 dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl dark:text-white text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/50"
              />
            </div>
            {loadError ? <div className="text-xs text-red-400 mt-2">{loadError}</div> : null}
          </GlassCard>

          <GlassCard className="overflow-hidden">
            <button
              className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
              onClick={() => setRetailExpanded((v) => !v)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                  <Store size={18} className="text-orange-300" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-medium dark:text-white text-zinc-900">{"实体店营销全家桶"}</h3>
                  <p className="text-xs dark:text-zinc-400 text-zinc-500">{retailFiles.length} {"个智能体"}</p>
                </div>
              </div>
              {retailExpanded ? (
                <ChevronDown size={18} className="text-zinc-500" />
              ) : (
                <ChevronRight size={18} className="text-zinc-500" />
              )}
            </button>

            {retailExpanded ? (
              <div className="px-4 pb-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                    onClick={expandAllRetailSubs}
                    type="button"
                  >
                    {"展开全部"}
                  </button>
                  <button
                    className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                    onClick={collapseAllRetailSubs}
                    type="button"
                  >
                    {"收起全部"}
                  </button>
                </div>

                {filteredRetailGroups.map(([sub, list]) => {
                  const expanded = expandedRetailSubs.has(sub)
                  return (
                    <div key={sub} className="rounded-2xl border border-white/10 bg-black/10 overflow-hidden">
                      <button
                        type="button"
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                        onClick={() => toggleRetailSub(sub)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                            <FileText size={14} className="text-orange-300" />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-medium dark:text-white text-zinc-900">{sub}</div>
                            <div className="text-xs text-zinc-500">{list.length} {"个"}</div>
                          </div>
                        </div>
                        {expanded ? (
                          <ChevronDown size={18} className="text-zinc-500" />
                        ) : (
                          <ChevronRight size={18} className="text-zinc-500" />
                        )}
                      </button>

                      {expanded ? (
                        <div className="px-4 pb-4">
                          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {list.map((f) => {
                              const title = displayTitleFromFileName(fileNameFromRelativePath(f.relativePath))
                              const agent: AgentConfig = {
                                id: "prompt-runner",
                                name: title,
                                description: `实体店营销全家桶 · ${sub}`,
                                scene: "marketing",
                                icon: "Store",
                                promptFile: f.relativePath,
                              }

                              return (
                                <div
                                  key={f.relativePath}
                                  onClick={() => handleOpenPromptAgent(agent)}
                                  className="p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/20 cursor-pointer hover:scale-[1.01] hover:border-orange-500/35 transition-all"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                                      <FileText size={16} className="text-orange-300" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium dark:text-white text-zinc-900 truncate">{title}</div>
                                      <div className="text-xs text-zinc-500 truncate">{replaceBrand(f.fileName)}</div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </GlassCard>

          <GlassCard className="overflow-hidden">
            <button
              className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
              onClick={() => setVerticalExpanded((v) => !v)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Factory size={18} className="text-cyan-300" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-medium dark:text-white text-zinc-900">{"垂直行业情绪选题"}</h3>
                  <p className="text-xs dark:text-zinc-400 text-zinc-500">{verticalFiles.length} {"个行业模板"}</p>
                </div>
              </div>
              {verticalExpanded ? (
                <ChevronDown size={18} className="text-zinc-500" />
              ) : (
                <ChevronRight size={18} className="text-zinc-500" />
              )}
            </button>

            {verticalExpanded ? (
              <div className="px-4 pb-4">
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredVerticalFiles.map((f) => {
                    const title = displayTitleFromFileName(f.fileName)
                    const agent: AgentConfig = {
                      id: "prompt-runner",
                      name: title,
                      description: "垂直行业情绪选题模板",
                      scene: "topic",
                      icon: "Factory",
                      promptFile: f.relativePath,
                    }
                    return (
                      <div
                        key={f.relativePath}
                        onClick={() => handleOpenPromptAgent(agent)}
                        className="p-4 rounded-xl bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 cursor-pointer hover:scale-[1.01] hover:border-cyan-500/35 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                            <Lightbulb size={16} className="text-cyan-300" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium dark:text-white text-zinc-900 truncate">{title}</div>
                            <div className="text-xs text-zinc-500 truncate">{replaceBrand(f.fileName)}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </GlassCard>

          <div className="space-y-4">
            {sceneOrder.map((scene) => {
              const agents = groupedByScene[scene] || []
              if (agents.length === 0) return null

              const cfg = sceneConfig[scene]
              const expanded = expandedScenes.has(scene)
              const SceneIcon =
                scene === "research"
                  ? Search
                  : scene === "creation"
                    ? BookOpen
                    : scene === "topic"
                      ? Lightbulb
                      : scene === "marketing"
                        ? Store
                        : FileText

              const styles = sceneStyles[scene]

              return (
                <GlassCard key={scene} className="overflow-hidden">
                  <button
                    onClick={() => toggleScene(scene)}
                    className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${styles.iconWrap} flex items-center justify-center`}>
                        <SceneIcon size={18} className={styles.icon} />
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm font-medium dark:text-white text-zinc-900">{cfg.name}</h3>
                        <p className="text-xs dark:text-zinc-400 text-zinc-500">{agents.length} {"个"}</p>
                      </div>
                    </div>
                    {expanded ? (
                      <ChevronDown size={18} className="text-zinc-500" />
                    ) : (
                      <ChevronRight size={18} className="text-zinc-500" />
                    )}
                  </button>

                  {expanded ? (
                    <div className="px-4 pb-4">
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {agents.map((agent) => {
                          const title = replaceBrand(stripNumericPrefix(agent.name))
                          return (
                            <div
                              key={agent.id}
                              onClick={() => handleOpenPromptAgent({ ...agent, name: title })}
                              className={`p-4 rounded-xl ${styles.card} cursor-pointer hover:scale-[1.01] transition-all`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-9 h-9 rounded-lg ${styles.cardIconWrap} flex items-center justify-center shrink-0`}>
                                  <FileText size={16} className={styles.cardIcon} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium dark:text-white text-zinc-900 truncate">{title}</div>
                                  <div className="text-xs dark:text-zinc-400 text-zinc-500 mt-1 line-clamp-2">
                                    {replaceBrand(agent.description)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </GlassCard>
              )
            })}
          </div>

          <PromptPreviewSheet open={previewOpen} onOpenChange={setPreviewOpen} agent={selectedAgent} onRunAgent={runAgentFromLibrary} />
        </div>
      </main>
    </div>
  )
}
