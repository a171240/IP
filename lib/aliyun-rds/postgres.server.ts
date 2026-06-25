import "server-only"

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg"

const DEFAULT_APPLICATION_NAME = "meiye-huajing-app-api-production-cn"
const DEFAULT_POOL_MAX = 10

declare global {
  // eslint-disable-next-line no-var
  var __meiyeAliyunRdsPool: Pool | undefined
}

export class AliyunRdsConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AliyunRdsConfigurationError"
  }
}

export function isAliyunRdsRuntimeUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = String((error as { code?: unknown }).code || "")
  const message = String((error as { message?: unknown }).message || "")
  return [
    "ECONNABORTED",
    "ECONNREFUSED",
    "ECONNRESET",
    "EAI_AGAIN",
    "ENOTFOUND",
    "ETIMEDOUT",
    "08000",
    "08001",
    "08003",
    "08004",
    "08006",
    "53300",
    "57P01",
    "57P02",
    "57P03",
  ].includes(code) ||
    /Connection terminated unexpectedly|terminating connection|connection timeout|connect ETIMEDOUT|connect ECONNREFUSED|Client has encountered a connection error|no pg_hba\.conf entry|password authentication failed|database .* does not exist|role .* does not exist/i.test(message)
}

export function isAliyunRdsConfigured(): boolean {
  return Boolean(readDatabaseUrl({ allowMissing: true }))
}

export function getAliyunRdsDatabaseUrl(): string {
  const databaseUrl = readDatabaseUrl({ allowMissing: false })
  if (!databaseUrl) {
    throw new AliyunRdsConfigurationError("DATABASE_URL_CN is required for Aliyun RDS PostgreSQL access")
  }
  return databaseUrl
}

export function getAliyunRdsPool(): Pool {
  if (!globalThis.__meiyeAliyunRdsPool) {
    globalThis.__meiyeAliyunRdsPool = new Pool({
      connectionString: getAliyunRdsDatabaseUrl(),
      application_name: readTextEnv("ALIYUN_RDS_APPLICATION_NAME") || DEFAULT_APPLICATION_NAME,
      max: readPositiveIntEnv("ALIYUN_RDS_POOL_MAX") || DEFAULT_POOL_MAX,
      idleTimeoutMillis: readPositiveIntEnv("ALIYUN_RDS_IDLE_TIMEOUT_MS") || 30_000,
      connectionTimeoutMillis: readPositiveIntEnv("ALIYUN_RDS_CONNECTION_TIMEOUT_MS") || 10_000,
    })
  }
  return globalThis.__meiyeAliyunRdsPool
}

export async function queryAliyunRds<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: readonly unknown[],
): Promise<QueryResult<T>> {
  return getAliyunRdsPool().query<T>(text, values ? [...values] : undefined)
}

export async function withAliyunRdsClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getAliyunRdsPool().connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export async function withAliyunRdsTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withAliyunRdsClient(async (client) => {
    await client.query("BEGIN")
    try {
      const result = await fn(client)
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }
  })
}

export async function closeAliyunRdsPoolForTests(): Promise<void> {
  const pool = globalThis.__meiyeAliyunRdsPool
  globalThis.__meiyeAliyunRdsPool = undefined
  if (pool) await pool.end()
}

function readDatabaseUrl(options: { allowMissing: boolean }): string {
  const value = readTextEnv("DATABASE_URL_CN")
  if (!value && !options.allowMissing) {
    throw new AliyunRdsConfigurationError("DATABASE_URL_CN is required for Aliyun RDS PostgreSQL access")
  }
  return value
}

function readTextEnv(key: string): string {
  return String(process.env[key] || "").trim()
}

function readPositiveIntEnv(key: string): number | undefined {
  const value = Number.parseInt(readTextEnv(key), 10)
  return Number.isFinite(value) && value > 0 ? value : undefined
}
