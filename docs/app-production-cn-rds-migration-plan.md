# APP production-cn RDS/PostgreSQL 迁移清单

更新时间：2026-06-24 CST

## 结论

缺口不只是微信开放平台移动应用。微信移动应用会解除 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`，但正式国内 production-cn 全量迁到阿里云还必须完成阿里云 RDS PostgreSQL 数据层迁移。

当前阿里云后端-only 口径下，微信移动应用、Android 签名和 Apple Team ID 都是完整 APP 发布延期项；RDS/PostgreSQL 是当前后端上线前置项。

## 当前只读扫描结果

当前 `corepack pnpm aliyun:rds:migration:plan` 的只读源码扫描结果：

```text
currentDataLayer: Supabase migration source / legacy compatibility only
formalTarget: Aliyun RDS PostgreSQL
migrationReady: false
appApiRouteCount: 31
appApiRoutesWithSupabase: 31
appApiRoutesWithSupabaseDataAccess: 29
firstVersionRdsRouteCount: 25
firstVersionRdsRoutesWithSupabase: 25
firstVersionRdsRoutesWithSupabaseDataAccess: 25/25
deferredAppApiRouteCount: 6
deferredAppApiRoutesWithSupabaseDataAccess: 4
appApiRoutesWithDirectSupabase: 3
sharedSupabaseFileCount: 93
sharedSupabaseDataAccessFileCount: 92
supabaseUsageFileCount: 96
tableCount: 44
rpcCount: 3
storageBucketCount: 1
databaseUrlCnReferencedInSource: true
postgresDataAccessAdapterDetected: true
schemaMapReady: true
schemaMapRequiredTableCount: 9
```

Human-readable summary used by release checks:

```text
APP API routes using Supabase: 31
First-version RDS required routes using Supabase data access: 25
DATABASE_URL_CN referenced in source: true
PostgreSQL data access adapter detected: true
```

这表示 APP 的 31 条 `app/api/app` 路由虽然多数是复用 `app/api/mp` 和 `lib` 的既有链路，但正式 production-cn 数据层仍不能停留在 Supabase。只填写 `DATABASE_URL_CN`，或只创建微信移动应用，都不能算完成“全部迁到阿里云”。

已具备的本地代码落点：

```text
rdsAdapterFile: lib/aliyun-rds/postgres.server.ts
rdsSchemaMap: deploy/aliyun-production-cn.rds-first-version-schema-map.json
bridgeMap: deploy/app-api-production-cn.bridge-map.json
```

这只表示后端代码里已经有 server-only PostgreSQL/RDS 连接入口和第一版 schema 迁移清单；它不等于已经完成阿里云 RDS 实例、`DATABASE_URL_CN` secret 导入、业务路由切库、数据迁移或回滚验收。

## 一阶段范围

当前必须迁 RDS 的是一阶段 25 条路由。

延期的 6 条路由：

```text
/api/app/health
/api/app/auth/logout
/api/app/auth/wechat
/api/app/wechat/login
/api/app/scene-cards
/api/app/scene-cards/[cardId]
```

延期原因：

- `/api/app/auth/logout` 是 APP Auth session 边界，只校验 Bearer token 并做 best-effort sign-out；它依赖 Supabase Auth，但不拥有第一版 RDS 业务数据。
- 微信登录两条按当前目标等后端上线后再做微信开放平台移动应用。
- `scene-cards` 属于 A3 话术训练/顾客项目资料迁移。
- `/api/app/health` 是 SAE 环境和健康检查，不作为 RDS 数据访问迁移 blocker。

## 必填阻塞项

```text
DATABASE_URL_CN
rds_instance_missing_or_unverified
first_version_supabase_data_access_still_present
schema_migration_not_verified
data_migration_not_verified
rollback_validation_not_verified
```

已解除的本地代码阻塞：

```text
postgres_data_access_adapter_missing
```

仍然阻塞的原因是 APP 第一版必须上线的 25 条 RDS 路由还在直接或间接使用 Supabase 数据访问，真实 RDS 实例与迁移验收也没有完成。

## RDS 迁移包

当前 `corepack pnpm aliyun:rds:migration:package` 能生成 value-free 迁移包，用于动作时交给 RDS/后端迁移操作员复核。最近一次本地生成摘要：

```text
sourceFileCount: 6
requiredTableCount: 9
requiredFunctionCount: 1
requiredStorageCount: 1
schemaSqlSha256: 7da2a25fd73733939bb799b912f86484ba954cb027b2046c44903d96b8b5b9d4
validationSqlSha256: 3975d5f2f7808bf51694b82ff8f817aa5fccff6d983a36c68de2c2a38d261d50
rollbackChecklistSha256: f2dbdf60cf7d6700d1b93ed66d9123ce089fa462b55be2f6188d502b11aa27dd
```

迁移包输出文件：

```text
rds-migration-package.json
rds-migration-package.md
rds-schema.sql
rds-validation.sql
rds-rollback-checklist.md
```

迁移包只能作为 schema/validation/rollback 的无值执行材料。它不包含 `DATABASE_URL_CN`、数据库密码、dump 内容、Supabase service role key、AccessKeySecret、token 或 cookie。

## DATABASE_URL_CN

获得位置：

```text
阿里云控制台 -> RDS -> PostgreSQL -> cn-hangzhou 实例 -> 数据库连接信息
```

导入位置：

```text
阿里云 KMS / Secrets Manager / SAE secret env
```

禁止位置：

```text
git
Markdown / JSON 报告
Docker image
APP 包
小程序包
shell history
```

## 迁移阶段

```text
RDS01_FREEZE_SCHEMA_INVENTORY
RDS02_CREATE_ALIYUN_RDS_POSTGRES
RDS03_BUILD_POSTGRES_DATA_ACCESS_ADAPTER
RDS04_MIGRATE_SCHEMA_AND_DATA
RDS05_VALIDATE_APP_API_ON_RDS
RDS06_SWITCH_PRODUCTION_CN_AND_ROLLBACK
```

当前可开始但不能自动越权完成的是：

```text
RDS02_CREATE_ALIYUN_RDS_POSTGRES
```

`RDS02` 涉及创建/确认阿里云 RDS PostgreSQL 实例和受控数据库账号；完成后只能把连接串作为 secret env 导入，不能写入文档或仓库。

## 回填证据

RDS 动作完成后，只能把非密钥证据写入 ignored 的本地文件：

```text
deploy/aliyun-production-cn.rds-migration.local.json
```

必须闭合的字段组：

- `rdsPostgres.*`：RDS 实例、数据库账号、网络、database 名称、`DATABASE_URL_CN` secret env 导入状态。
- `migration.*`：数据访问层迁移、schema/data 迁移、row count、关键记录、APP API smoke、Supabase 不再是正式目标、rollback runbook 和 rollback validation。

禁止写入：

```text
DATABASE_URL_CN value
database password
dump contents
customer data
Supabase service role key
AccessKeySecret
STS token
cookie
```

## 与微信移动应用的关系

微信开放平台移动应用负责 APP 微信登录：

```text
WECHAT_OPEN_APP_ID
WECHAT_OPEN_APP_SECRET
WECHAT_OPEN_APP_REVIEW_STATUS
```

阿里云 RDS PostgreSQL 负责正式数据库：

```text
DATABASE_URL_CN
PostgreSQL data access adapter
schema/data migration evidence
rollback validation evidence
```

这两条是并行前置项，不是互相替代关系。小程序的 `WECHAT_MINI_APPID`、`WECHAT_MINI_SECRET`、`WECHAT_LOGIN_SECRET` 也不能替代 APP 微信开放平台移动应用凭证。

## 验证命令

```bash
corepack pnpm aliyun:rds:migration:plan
corepack pnpm aliyun:rds:migration:package
corepack pnpm aliyun:rds:migration:evidence
corepack pnpm aliyun:rds:migration:evidence:strict
corepack pnpm aliyun:backend-cn:status
corepack pnpm aliyun:predeploy
```

这些命令只读本地源码和非密钥规格，不连接 Supabase、不连接阿里云 RDS、不读取 `.env` 值、不创建云资源、不导入环境变量、不部署 production-cn。
