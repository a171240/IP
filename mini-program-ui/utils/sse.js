function parseChatSse(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return { content: "", reasoning: "" }
  }

  const lines = rawText.split("\n")
  let content = ""
  let reasoning = ""

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("data:")) continue

    const payload = trimmed.replace(/^data:\s*/, "")
    if (!payload || payload === "[DONE]") continue

    try {
      const json = JSON.parse(payload)
      if (typeof json.reasoning === "string") reasoning += json.reasoning
      if (typeof json.content === "string") content += json.content
    } catch (_) {
      // ignore partial chunks
    }
  }

  return { content, reasoning }
}

module.exports = {
  parseChatSse,
}

