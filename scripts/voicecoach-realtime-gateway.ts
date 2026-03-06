import { startVoiceCoachRealtimeGateway } from "@/lib/voice-coach/realtime.server"
import { getVoiceCoachRealtimeConfig } from "@/lib/voice-coach/realtime-contract"
import { loadLocalEnv } from "@/scripts/load-local-env"

async function main() {
  loadLocalEnv()
  const config = getVoiceCoachRealtimeConfig()
  const gateway = await startVoiceCoachRealtimeGateway()

  console.log(
    `[voicecoach-realtime] listening on http://0.0.0.0:${config.realtimePort}${config.realtimePath}`,
  )

  const shutdown = async (signal: string) => {
    console.log(`[voicecoach-realtime] shutting down on ${signal}`)
    try {
      await gateway.close()
    } finally {
      process.exit(0)
    }
  }

  process.on("SIGINT", () => void shutdown("SIGINT"))
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
}

void main().catch((error) => {
  console.error("[voicecoach-realtime] failed to start", error)
  process.exit(1)
})
