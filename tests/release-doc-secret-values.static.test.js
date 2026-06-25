const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()

const secretValuePatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
]

test("release-facing Markdown docs do not contain literal API secret values", () => {
  const files = listMarkdownFiles()
  const matches = []

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8")
    const lines = content.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (secretValuePatterns.some((pattern) => pattern.test(line))) {
        matches.push(`${path.relative(root, file)}:${index + 1}`)
      }
    })
  }

  assert.deepEqual(matches, [])
})

function listMarkdownFiles() {
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(path.join(root, entry.name))
  }
  const docsDir = path.join(root, "docs")
  if (fs.existsSync(docsDir)) collectMarkdown(docsDir, files)
  return files.sort()
}

function collectMarkdown(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectMarkdown(fullPath, files)
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(fullPath)
  }
}
