# APP production-cn RDS knowledge membership attempt - 2026-07-02

## Conclusion

- status: blocked_before_persistent_writes
- production writes completed: no
- transaction outcome: aborted before permanent table writes
- cleanup outcome: temporary ECS instance count 0; temporary security group count 0
- authorization scope used: production-cn RDS test-account membership plus knowledge spaces schema/data only

## Why This Stopped

The patch now requires the employee and manager test accounts to share one declared company/store scope from `deploy/app-live-smoke-test-login-users.local.json`.

The production-cn RDS run stopped at the active-scope preflight:

```text
declared_scope_not_active
```

This means the company/store declared by the local test-account file was not found as one active company/store pair in production-cn RDS. The script intentionally did not fall back to "latest active store".

## Commands And Results

Dry-run:

```bash
node -- scripts/apply-production-cn-rds-knowledge-membership.mjs --env-file /tmp/meiye-do-not-load-env
```

Result:

```text
ok=true
dryRun=true
envFileLoaded=false
accounts=employee,manager
manifest=manbeilian_store_knowledge_v1
groupCount=26
cardCount=217
remoteCommandBase64Bytes=18412
containsSecretTokens=false
```

Focused tests:

```bash
node --test tests/app-api-test-accounts.static.test.js tests/aliyun-app-knowledge-spaces.static.test.js tests/aliyun-app-rds-auth.static.test.js tests/app-api-live-smoke-env.static.test.js
```

Result:

```text
17 tests passed
```

Production execution attempt:

```bash
MEIYE_ALLOW_PRODUCTION_CN_RDS_KNOWLEDGE_MEMBERSHIP=1 node -- scripts/apply-production-cn-rds-knowledge-membership.mjs --execute
```

Result:

```text
runId=20260702061555-rgm4xu
remote error=declared_scope_not_active
cleanupAttempted=true
```

Cleanup verification:

```text
instanceCount=0
securityGroupCount=0
```

## Explicitly Not Done

- No git push.
- No WeChat upload.
- No backend deployment.
- No unrelated business data writes.
- No token, database URL, password, AccessKeySecret, or STS token printed.
- No successful production RDS membership or knowledge-space rows were written.

## Next Decision

One of these must be true before retrying:

1. Rebind the two test accounts to an explicit production-cn active company/store scope, then retry.
2. Create or activate the declared company/store scope in production-cn RDS, if that is the intended test store.
3. Re-register the two test accounts against a confirmed production-cn active scope.

Do not retry with an implicit "latest active store" fallback.
