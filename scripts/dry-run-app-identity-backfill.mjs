import { Pool } from "pg"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

function readOption(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : ""
}

export function assertLocalDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl)
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"])
  if (!localHosts.has(parsed.hostname)) {
    throw new Error("dry_run_local_database_required")
  }
  if (!/(test|local|trial)/i.test(parsed.pathname)) {
    throw new Error("dry_run_test_database_name_required")
  }
}

export async function inspectBackfillCandidates(pool) {
  const result = await pool.query(`
    select
      profile.id as app_user_id,
      identity.canonical_user_id,
      count(membership.id)::integer as membership_count
    from public.profiles profile
    left join public.app_auth_identities identity
      on identity.app_user_id = profile.id
    left join public.mp_account_memberships membership
      on membership.user_id = profile.id
    group by profile.id, identity.canonical_user_id
    order by profile.id
  `)

  const candidates = result.rows.filter((row) => !row.canonical_user_id)
  const linked = result.rows.filter((row) => row.canonical_user_id)
  return {
    mode: "dry-run",
    scanned_profiles: result.rows.length,
    already_linked: linked.length,
    candidates_without_canonical_identity: candidates.length,
    candidates_with_membership: candidates.filter((row) => Number(row.membership_count) > 0).length,
    writes_performed: 0,
  }
}

async function main() {
  if (!process.argv.includes("--dry-run")) {
    throw new Error("only_--dry-run_is_supported")
  }
  const databaseUrl = readOption("--database-url")
  if (!databaseUrl) throw new Error("--database-url is required")
  assertLocalDatabaseUrl(databaseUrl)

  const pool = new Pool({ connectionString: databaseUrl })
  try {
    const report = await inspectBackfillCandidates(pool)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } finally {
    await pool.end()
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
