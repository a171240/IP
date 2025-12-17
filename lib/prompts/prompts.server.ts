import "server-only"

import { promises as fs } from "node:fs"
import { join, normalize, sep } from "node:path"

export type PromptFileEntry = {
  relativePath: string
  fileName: string
}

function safeJoinPromptsDir(relativePath: string): { baseDir: string; fullPath: string } {
  const baseDir = join(process.cwd(), "\u63d0\u793a\u8bcd")
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

export async function listPromptFiles(relativeDirOrFile: string): Promise<PromptFileEntry[]> {
  const { baseDir, fullPath } = safeJoinPromptsDir(relativeDirOrFile)
  const stat = await fs.stat(fullPath)

  const fileFullPaths = stat.isDirectory() ? await listFilesRecursive(fullPath) : [fullPath]

  const files: PromptFileEntry[] = []
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
  return files
}

export async function readPromptFile(relativePath: string): Promise<{ content: Buffer; fileName: string }> {
  const { fullPath } = safeJoinPromptsDir(relativePath)

  if (!isAllowedPromptFile(fullPath.toLowerCase())) {
    throw new Error("File type not allowed")
  }

  const content = await fs.readFile(fullPath)
  const fileName = relativePath.split("/").pop() || relativePath
  return { content, fileName }
}
