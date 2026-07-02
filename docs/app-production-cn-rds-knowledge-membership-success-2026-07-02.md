# APP production-cn RDS knowledge membership success - 2026-07-02

## Conclusion

- status: production_cn_rds_patch_passed
- target scope: 椿舍日式美肌 / 吴江店
- scope match mode: fuzzy match from user request `椿舍`
- persistent writes completed: yes
- deployment: not run
- git push: not run
- WeChat upload: not run
- token/env values printed: no

## Scope

This run only covered the authorized production-cn RDS range:

- `public.mp_account_memberships` for the two APP live-smoke test accounts.
- `public.mp_knowledge_spaces` schema/data for Manbeilian APP knowledge space.
- `public.mp_knowledge_space_access` grants for the two APP live-smoke test accounts.
- `public.voice_training_packs` Manbeilian pack metadata.

No other production business data write was included.

## Commands And Results

Target scope lookup:

```text
target=椿舍
matchMode=fuzzy
companyName=椿舍日式美肌
storeName=吴江店
accountFileUpdated=true
secretValuesPrinted=false
```

Patch dry-run:

```bash
node -- scripts/apply-production-cn-rds-knowledge-membership.mjs --env-file /tmp/meiye-do-not-load-env
```

Result:

```text
ok=true
dryRun=true
accounts=employee,manager
manifest=manbeilian_store_knowledge_v1
groupCount=26
cardCount=217
containsSecretTokens=false
```

Production patch:

```bash
MEIYE_ALLOW_PRODUCTION_CN_RDS_KNOWLEDGE_MEMBERSHIP=1 node -- scripts/apply-production-cn-rds-knowledge-membership.mjs --execute
```

Result:

```text
runId=20260702063001-jhy85m
ok=true
scopeSource=declared_scope
membershipRows=2
knowledgeSpaceRows=1
knowledgeAccessRows=2
trainingPackRows=1
manifestGroupCount=26
manifestCardCount=217
secretValuePrinted=false
```

Cleanup verification:

```text
patch runner instanceCount=0
patch securityGroupCount=0
scope reader instanceCount=0
scope reader securityGroupCount=0
```

Read-only live-smoke:

```text
mode=read_only_executed
networkRequestsAttempted=true
checkedProbes=18
ok=true
all probe status=200
onlineBoundary ok=true
routeBlockers=[]
noSecretValuesPrinted=true
onlyGetRequests=true
```

Covered read-only scopes:

```text
account=3
service-records=1
content-poster=2
content-xhs=1
content-private-copy=1
learning-progress=1
voice-coach=1
context=4
knowledge-spaces=1
store-admin=3
```

## Remaining Gaps

- This proves production-cn read-only APP API connectivity for the covered GET routes.
- This does not prove mutating workflows such as invite creation, service-record creation/end/process, OSS upload, ASR polling, publish, submit, or payment.
- This does not prove true-device L1/L5/L12 recording behavior.
- Manager detail positive/negative live evidence is still separate from the list smoke.

## Adversarial Review

- The target was a fuzzy match, not an exact name match. It was accepted because it returned one active company/store pair only.
- Tokens were consumed from the local ignored test-account file for read-only smoke, but token values were not printed or committed.
- The RDS patch reused `create table if not exists` / `add column if not exists`, so existing schema was preserved instead of rebuilt.
- A transient security group dependency warning appeared during cleanup, then explicit post-checks confirmed no runner or security group remained.
