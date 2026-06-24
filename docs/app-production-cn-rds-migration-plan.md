# APP production-cn RDS/PostgreSQL 迁移清单

更新时间：2026-06-24 CST

## 结论

缺口不只是微信开放平台移动应用。微信移动应用会解除 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`，但正式国内 production-cn 全量迁到阿里云还必须完成阿里云 RDS PostgreSQL 数据层迁移。

当前 `corepack pnpm aliyun:rds:migration:plan` 的只读源码扫描结果：

```text
currentDataLayer: Supabase migration source / legacy compatibility only
formalTarget: Aliyun RDS PostgreSQL
migrationReady: false
appApiRouteCount: 30
appApiRoutesWithSupabase: 30
appApiRoutesWithSupabaseDataAccess: 29
firstVersionRdsRouteCount: 25
firstVersionRdsRoutesWithSupabaseDataAccess: 25/25
deferredAppApiRouteCount: 5
deferredAppApiRoutesWithSupabaseDataAccess: 4
appApiRoutesWithDirectSupabase: 2
sharedSupabaseFileCount: 93
supabaseUsageFileCount: 95
tableCount: 44
rpcCount: 3
storageBucketCount: 1
databaseUrlCnReferencedInSource: false
postgresDataAccessAdapterDetected: false
```

这表示 APP 的 30 条 `app/api/app` 路由虽然多数是复用 `app/api/mp` 和 `lib` 的既有链路，但最终仍触达 Supabase 数据访问。只创建微信移动应用或只填写 `DATABASE_URL_CN`，都不能算完成“全部迁到阿里云”。

2026-06-24 追加：本地已补第一版阿里云 RDS 接入落点：

```text
databaseUrlCnReferencedInSource: true
postgresDataAccessAdapterDetected: true
rdsAdapterFile: lib/aliyun-rds/postgres.server.ts
rdsSchemaMap: deploy/aliyun-production-cn.rds-first-version-schema-map.json
```

这只表示后端代码里已经有 server-only PostgreSQL/RDS 连接入口和第一版 schema 迁移清单；它不等于已经完成阿里云 RDS 实例、`DATABASE_URL_CN` secret 导入、业务路由切库、数据迁移或回滚验收。

2026-06-24 追加：RDS 阻塞口径已按 APP 第一版范围收窄，完整 inventory 仍保留 30 条 `app/api/app` 路由，但当前必须迁 RDS 的是一阶段 25 条路由：

```text
firstVersionRdsRouteCount: 25
firstVersionRdsRoutesWithSupabaseDataAccess: 25/25
deferredAppApiRouteCount: 5
deferredAppApiRoutes: /api/app/health, /api/app/auth/wechat, /api/app/wechat/login, /api/app/scene-cards, /api/app/scene-cards/[cardId]
```

延期的 5 条里，微信登录两条按用户要求等后端上线后再做微信开放平台移动应用；`scene-cards` 属于 A3 话术训练/顾客项目资料迁移；`/api/app/health` 是 SAE 环境和健康检查，不作为 RDS 数据访问迁移 blocker。

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

仍然阻塞的原因是 APP 第一版必须上线的 25 条 RDS 路由还在直接或间接使用 Supabase 数据访问，真实 RDS 实例与迁移验收也没有完成。完整 30 条路由仍继续纳入 inventory，但延期路由不再错误地作为当前阿里云后端上线 blocker。

`DATABASE_URL_CN` 的获得位置：

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
RDS01_FREEZE_SCHEMA_INVENTORY
RDS02_CREATE_ALIYUN_RDS_POSTGRES
```

`RDS02` 涉及创建/确认阿里云 RDS PostgreSQL 实例和受控数据库账号；完成后只能把连接串作为 secret env 导入，不能写入文档或仓库。

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
corepack pnpm aliyun:rds:migration:plan:test
corepack pnpm aliyun:deploy:spec
corepack pnpm aliyun:predeploy
```

这些命令只读本地源码和非密钥规格，不连接 Supabase、不连接阿里云 RDS、不读取 `.env` 值、不创建云资源、不导入环境变量、不部署 production-cn。
