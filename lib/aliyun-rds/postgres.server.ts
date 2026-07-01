import "server-only"

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg"

import {
  getAliyunKmsDatabaseUrlSecretValue,
  isAliyunKmsSecretDatabaseUrlConfigured,
} from "@/lib/aliyun-rds/kms-secret.server"

const DEFAULT_APPLICATION_NAME = "meiye-huajing-app-api-production-cn"
const DEFAULT_POOL_MAX = 10

declare global {
  var __meiyeAliyunRdsPool: Pool | undefined
  var __meiyeAliyunRdsPoolInit: Promise<Pool> | undefined
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
  return Boolean(readDatabaseUrl({ allowMissing: true }) || isAliyunKmsSecretDatabaseUrlConfigured())
}

export function getAliyunRdsDatabaseUrl(): string {
  const databaseUrl = readDatabaseUrl({ allowMissing: false })
  if (!databaseUrl) {
    throw new AliyunRdsConfigurationError("DATABASE_URL_CN is required for Aliyun RDS PostgreSQL access")
  }
  return databaseUrl
}

export async function getAliyunRdsPool(): Promise<Pool> {
  if (!globalThis.__meiyeAliyunRdsPool) {
    if (!globalThis.__meiyeAliyunRdsPoolInit) {
      globalThis.__meiyeAliyunRdsPoolInit = createAliyunRdsPool()
    }
    try {
      globalThis.__meiyeAliyunRdsPool = await globalThis.__meiyeAliyunRdsPoolInit
    } catch (error) {
      globalThis.__meiyeAliyunRdsPoolInit = undefined
      throw error
    }
  }
  return globalThis.__meiyeAliyunRdsPool
}

export async function queryAliyunRds<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: readonly unknown[],
): Promise<QueryResult<T>> {
  const pool = await getAliyunRdsPool()
  return pool.query<T>(text, values ? [...values] : undefined)
}

export async function withAliyunRdsClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = await getAliyunRdsPool()
  const client = await pool.connect()
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

export async function withAliyunRdsRequestContext<T>(
  currentUserId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const normalizedUserId = normalizeRdsRequestUserId(currentUserId)
  return withAliyunRdsTransaction(async (client) => {
    await client.query("select set_config('app.current_user_id', $1, true)", [normalizedUserId])
    return fn(client)
  })
}

export async function closeAliyunRdsPoolForTests(): Promise<void> {
  const pool = globalThis.__meiyeAliyunRdsPool
  globalThis.__meiyeAliyunRdsPool = undefined
  globalThis.__meiyeAliyunRdsPoolInit = undefined
  if (pool) await pool.end()
}

async function createAliyunRdsPool(): Promise<Pool> {
  return new Pool({
    connectionString: await resolveDatabaseUrl(),
    application_name: readTextEnv("ALIYUN_RDS_APPLICATION_NAME") || DEFAULT_APPLICATION_NAME,
    max: readPositiveIntEnv("ALIYUN_RDS_POOL_MAX") || DEFAULT_POOL_MAX,
    idleTimeoutMillis: readPositiveIntEnv("ALIYUN_RDS_IDLE_TIMEOUT_MS") || 30_000,
    connectionTimeoutMillis: readPositiveIntEnv("ALIYUN_RDS_CONNECTION_TIMEOUT_MS") || 10_000,
  })
}

function readDatabaseUrl(options: { allowMissing: boolean }): string {
  const value = readConfiguredTextEnv("DATABASE_URL_CN")
  if (!value && !options.allowMissing) {
    throw new AliyunRdsConfigurationError("DATABASE_URL_CN is required for Aliyun RDS PostgreSQL access")
  }
  return value
}

async function resolveDatabaseUrl(): Promise<string> {
  const envValue = readDatabaseUrl({ allowMissing: true })
  if (envValue) return envValue
  if (isAliyunKmsSecretDatabaseUrlConfigured()) return getAliyunKmsDatabaseUrlSecretValue()
  throw new AliyunRdsConfigurationError("DATABASE_URL_CN is required for Aliyun RDS PostgreSQL access")
}

function readTextEnv(key: string): string {
  return String(process.env[key] || "").trim()
}

function readConfiguredTextEnv(key: string): string {
  const value = readTextEnv(key)
  return value && !value.startsWith("TODO_") ? value : ""
}

function readPositiveIntEnv(key: string): number | undefined {
  const value = Number.parseInt(readTextEnv(key), 10)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function normalizeRdsRequestUserId(value: string): string {
  const userId = String(value || "").trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new AliyunRdsConfigurationError("A valid APP user UUID is required for Aliyun RDS request context")
  }
  return userId
}
