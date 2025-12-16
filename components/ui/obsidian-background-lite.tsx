import * as React from "react"

export function ObsidianBackgroundLite() {
  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
      <div className="absolute inset-0 bg-[#030304]" />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(700px 420px at 50% 28%, rgba(168,85,247,0.16), transparent 60%),radial-gradient(560px 380px at 18% 22%, rgba(99,102,241,0.12), transparent 60%),radial-gradient(560px 380px at 82% 76%, rgba(139,92,246,0.10), transparent 60%)",
        }}
      />
    </div>
  )
}

