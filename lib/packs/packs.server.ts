import "server-only"

import { promises as fs } from "node:fs"
import { join, normalize, sep } from "node:path"

import { solutionPacksConfig } from "@/lib/agents/config"

export type PackFileEntry = {
  relativePath: string
  fileName: string
}

type PackFileListResult = {
  packId: string
  packName: string
  sourcePath: string
  files: PackFileEntry[]
}

function safeJoinPromptsDir(relativePath: string): { baseDir: string; fullPath: string } {
  const baseDir = join(process.cwd(), "提示词")
  const fullPath = join(baseDir, relativePath)

  const normalizedBase = normalize(baseDir + sep)
  const normalizedFull = normalize(fullPath)
  if (!normalizedFull.startsWith(normalizedBase)) {
    throw new Error("Invalid prompts path")
  }

  return { baseDir, fullPath }
}

function isAllowedPromptFile(pathname: string) {
  return pathname.endsWith(".md") || pathname.endsWith(".txt")
}

async function listFilesRecursive(dirFullPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirFullPath, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const childFullPath = join(dirFullPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursive(childFullPath)))
    } else if (entry.isFile()) {
      results.push(childFullPath)
    }
  }

  return results
}

export async function listPackFiles(packId: string): Promise<PackFileListResult> {
  const pack = solutionPacksConfig.find((p) => p.id === packId)
  if (!pack) throw new Error("Pack not found")

  const sourcePath = (pack as unknown as { sourcePath?: string }).sourcePath
  if (!sourcePath) throw new Error("Pack sourcePath not configured")

  const { baseDir, fullPath: sourceFullPath } = safeJoinPromptsDir(sourcePath)

  const stat = await fs.stat(sourceFullPath)

  const fileFullPaths = stat.isDirectory() ? await listFilesRecursive(sourceFullPath) : [sourceFullPath]

  const files: PackFileEntry[] = []
  for (const fileFullPath of fileFullPaths) {
    if (!isAllowedPromptFile(fileFullPath.toLowerCase())) continue

    const normalizedBase = normalize(baseDir + sep)
    const normalizedFile = normalize(fileFullPath)
    if (!normalizedFile.startsWith(normalizedBase)) continue

    const relativePath = normalizedFile.slice(normalizedBase.length).split(sep).join("/")
    const fileName = relativePath.split("/").pop() || relativePath
    files.push({ relativePath, fileName })
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-Hans-CN"))

  return {
    packId: pack.id,
    packName: pack.name,
    sourcePath,
    files,
  }
}

export async function readPackFileForDownload(packId: string, relativePath: string) {
  const pack = solutionPacksConfig.find((p) => p.id === packId)
  if (!pack) throw new Error("Pack not found")

  const sourcePath = (pack as unknown as { sourcePath?: string }).sourcePath
  if (!sourcePath) throw new Error("Pack sourcePath not configured")

  const { baseDir, fullPath: requestedFullPath } = safeJoinPromptsDir(relativePath)
  const { fullPath: allowedRootFullPath } = safeJoinPromptsDir(sourcePath)

  const normalizedBase = normalize(baseDir + sep)
  const normalizedRequested = normalize(requestedFullPath)
  const normalizedAllowedRoot = normalize(allowedRootFullPath)

  if (!normalizedRequested.startsWith(normalizedBase)) {
    throw new Error("Invalid requested file")
  }

  // Must be inside the pack's source folder/file
  const isAllowed =
    normalizedRequested === normalizedAllowedRoot ||
    normalizedRequested.startsWith(normalize(normalizedAllowedRoot + sep))

  if (!isAllowed) {
    throw new Error("Requested file not in pack")
  }

  if (!isAllowedPromptFile(normalizedRequested.toLowerCase())) {
    throw new Error("File type not allowed")
  }

  const content = await fs.readFile(normalizedRequested)
  return { content, normalizedRequested }
}
