# APP production-cn RDS/PostgreSQL migration inventory

Generated at: 2026-06-25T05:22:59.813Z

## Conclusion

- Current data layer: Supabase migration source / legacy compatibility only
- Formal target: Aliyun RDS PostgreSQL
- Migration ready: false
- APP API routes: 31
- APP API routes using Supabase: 31
- APP API routes using Supabase data access: 23
- First-version RDS required APP API routes: 25
- First-version RDS required routes using Supabase: 25
- First-version RDS required routes using Supabase data access: 19
- Deferred APP API routes: 6
- Deferred APP API routes using Supabase data access: 4
- Shared Supabase files: 93
- Shared Supabase data access files: 75
- Supabase usage files: 101
- DATABASE_URL_CN referenced in source: true
- PostgreSQL data access adapter detected: true
- RDS schema map ready: true
- RDS schema map required tables: 15
- requiredBlockingCodes: DATABASE_URL_CN, data_migration_not_verified, first_version_supabase_data_access_still_present, rds_instance_missing_or_unverified, rollback_validation_not_verified, schema_migration_not_verified
- APP API bridge map ready: true
- Tables: activation_requests, analytics_events, content_rewrites, content_sources, conversations, credit_transactions, delivery_packs, distribution_jobs, distribution_tasks, entitlements, knowledge_docs, mp_account_invites, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_knowledge_space_access, mp_knowledge_spaces, mp_stores, platform_connections, poster_generations, private_copy_drafts, profiles, reports, service_record_markers, service_record_segments, service_record_sessions, store_profiles, video_render_jobs, voice_coach_customer_profiles, voice_coach_events, voice_coach_jobs, voice_coach_knowledge_spaces, voice_coach_opening_preparations, voice_coach_scene_cards, voice_coach_sessions, voice_coach_training_packs, voice_coach_training_progress, voice_coach_turns, voice_training_packs, voice_training_progress, voice_training_tasks, wechatpay_orders, workflow_progress, xhs_drafts
- RPCs: consume_credits, grant_trial_credits, update_profile_public
- Storage buckets: delivery-packs
- RDS adapter files: app/api/app/customer-profiles/[profileId]/route.ts, app/api/app/customer-profiles/route.ts, app/api/app/profile/route.ts, app/api/app/store-profiles/[profileId]/route.ts, app/api/app/store-profiles/route.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/customer-profiles.server.ts, lib/aliyun-rds/repositories/store-profiles.server.ts
- RDS schema map file: deploy/aliyun-production-cn.rds-first-version-schema-map.json

## Required Blockers

### DATABASE_URL_CN

- status: todo
- obtainFrom: Aliyun console -> RDS PostgreSQL -> database connection endpoint and credential
- importTarget: Aliyun KMS / Secrets Manager / SAE secret env only
- note: A connection string alone is not enough; source code, schema, data, and rollback evidence must also be migrated.

### ALIYUN_RDS_POSTGRES

- status: not_verified
- obtainFrom: Aliyun console -> RDS -> PostgreSQL instance in cn-hangzhou
- importTarget: deploy/aliyun-production-cn.cloud-inventory-results.local.json and cloud confirmations
- note: Current strict read-only inventory is incomplete, so RDS PostgreSQL presence or absence is unverified; confirm in Aliyun console or allowlisted read-only inventory before treating DATABASE_URL_CN as available.

### SUPABASE_TO_RDS_DATA_ACCESS_MIGRATION

- status: adapter_scaffolded_first_version_routes_still_using_supabase
- obtainFrom: Code migration from Supabase SDK calls to a PostgreSQL/RDS data access layer
- importTarget: backend source plus migration manifest
- note: A DATABASE_URL_CN/PostgreSQL server adapter exists, but first-version APP API routes still depend on Supabase business data access.

### SCHEMA_DATA_ROLLBACK_VALIDATION

- status: not_started
- obtainFrom: schema dump, data migration runbook, smoke validation, and rollback rehearsal
- importTarget: release evidence package
- note: No production-cn RDS schema/data migration evidence is included yet.

## First-version RDS Supabase Data Access Routes

- /api/app/service-records/device-files/check
  - file: app/api/app/service-records/device-files/check/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/asr/poll
  - file: app/api/app/service-records/sessions/[sessionId]/asr/poll/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/audio/[segmentId]
  - file: app/api/app/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/end
  - file: app/api/app/service-records/sessions/[sessionId]/end/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/markers
  - file: app/api/app/service-records/sessions/[sessionId]/markers/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/oss-upload
  - file: app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/process
  - file: app/api/app/service-records/sessions/[sessionId]/process/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/resume
  - file: app/api/app/service-records/sessions/[sessionId]/resume/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]
  - file: app/api/app/service-records/sessions/[sessionId]/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/segments/oss
  - file: app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/segments
  - file: app/api/app/service-records/sessions/[sessionId]/segments/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions
  - file: app/api/app/service-records/sessions/route.ts
  - capability: service_record_long_recording
  - scopeClass: service-records
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/analytics
  - file: app/api/app/store-admin/analytics/route.ts
  - capability: store_manager_service_record_read
  - scopeClass: store-admin
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/invites/[token]/accept
  - file: app/api/app/store-admin/invites/[token]/accept/route.ts
  - capability: store_invite
  - scopeClass: invites
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/invites/[token]/preview
  - file: app/api/app/store-admin/invites/[token]/preview/route.ts
  - capability: store_invite
  - scopeClass: invites
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/invites/[token]/qrcode
  - file: app/api/app/store-admin/invites/[token]/qrcode/route.ts
  - capability: store_invite
  - scopeClass: invites
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/invites
  - file: app/api/app/store-admin/invites/route.ts
  - capability: store_invite
  - scopeClass: invites
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/members
  - file: app/api/app/store-admin/members/route.ts
  - capability: store_manager_service_record_read
  - scopeClass: store-admin
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/overview
  - file: app/api/app/store-admin/overview/route.ts
  - capability: store_manager_service_record_read
  - scopeClass: store-admin
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none

## Deferred APP API Routes

- /api/app/auth/logout
  - file: app/api/app/auth/logout/route.ts
  - reason: Logout is an Auth session boundary and does not own first-version RDS business data.
  - usesSupabaseDataAccess: false
- /api/app/auth/wechat
  - file: app/api/app/auth/wechat/route.ts
  - reason: WeChat Open Platform mobile app creation and its env are explicitly deferred from the current Aliyun backend-only target.
  - usesSupabaseDataAccess: true
- /api/app/health
  - file: app/api/app/health/route.ts
  - reason: Health is a deployment/env smoke route; it is handled by SAE env import and health smoke, not RDS data migration.
  - usesSupabaseDataAccess: false
- /api/app/scene-cards/[cardId]
  - file: app/api/app/scene-cards/[cardId]/route.ts
  - reason: Scene cards belong to A3 voice-coach/customer-project migration, not the current first-version backend closure.
  - usesSupabaseDataAccess: true
- /api/app/scene-cards
  - file: app/api/app/scene-cards/route.ts
  - reason: Scene cards belong to A3 voice-coach/customer-project migration, not the current first-version backend closure.
  - usesSupabaseDataAccess: true
- /api/app/wechat/login
  - file: app/api/app/wechat/login/route.ts
  - reason: WeChat Open Platform mobile app creation and its env are explicitly deferred from the current Aliyun backend-only target.
  - usesSupabaseDataAccess: true

## Full APP API Supabase Routes

- /api/app/auth/logout
  - file: app/api/app/auth/logout/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/auth/wechat
  - file: app/api/app/auth/wechat/route.ts
  - tables: profiles
  - rpcs: none
  - storageBuckets: none
  - envKeys: IPgongchang_SUPABASE_ANON_KEY, IPgongchang_SUPABASE_PUBLISHABLE_KEY, IPgongchang_SUPABASE_URL, NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY, NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_IPgongchang_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL
- /api/app/customer-profiles/[profileId]
  - file: app/api/app/customer-profiles/[profileId]/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: DATABASE_URL_CN
- /api/app/customer-profiles
  - file: app/api/app/customer-profiles/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: DATABASE_URL_CN
- /api/app/entitlements
  - file: app/api/app/entitlements/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/health
  - file: app/api/app/health/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: IPgongchang_SUPABASE_ANON_KEY, IPgongchang_SUPABASE_PUBLISHABLE_KEY, IPgongchang_SUPABASE_SECRET_KEY, IPgongchang_SUPABASE_SERVICE_ROLE_KEY, IPgongchang_SUPABASE_URL, NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY, NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_IPgongchang_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- /api/app/profile
  - file: app/api/app/profile/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: DATABASE_URL_CN
- /api/app/scene-cards/[cardId]
  - file: app/api/app/scene-cards/[cardId]/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/scene-cards
  - file: app/api/app/scene-cards/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/device-files/check
  - file: app/api/app/service-records/device-files/check/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/asr/poll
  - file: app/api/app/service-records/sessions/[sessionId]/asr/poll/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/audio/[segmentId]
  - file: app/api/app/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/end
  - file: app/api/app/service-records/sessions/[sessionId]/end/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/markers
  - file: app/api/app/service-records/sessions/[sessionId]/markers/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/oss-upload
  - file: app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/process
  - file: app/api/app/service-records/sessions/[sessionId]/process/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/resume
  - file: app/api/app/service-records/sessions/[sessionId]/resume/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]
  - file: app/api/app/service-records/sessions/[sessionId]/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/segments/oss
  - file: app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions/[sessionId]/segments
  - file: app/api/app/service-records/sessions/[sessionId]/segments/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/service-records/sessions
  - file: app/api/app/service-records/sessions/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/analytics
  - file: app/api/app/store-admin/analytics/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/invites/[token]/accept
  - file: app/api/app/store-admin/invites/[token]/accept/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/invites/[token]/preview
  - file: app/api/app/store-admin/invites/[token]/preview/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/invites/[token]/qrcode
  - file: app/api/app/store-admin/invites/[token]/qrcode/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/invites
  - file: app/api/app/store-admin/invites/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/members
  - file: app/api/app/store-admin/members/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-admin/overview
  - file: app/api/app/store-admin/overview/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none
- /api/app/store-profiles/[profileId]
  - file: app/api/app/store-profiles/[profileId]/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: DATABASE_URL_CN
- /api/app/store-profiles
  - file: app/api/app/store-profiles/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: DATABASE_URL_CN
- /api/app/wechat/login
  - file: app/api/app/wechat/login/route.ts
  - tables: none
  - rpcs: none
  - storageBuckets: none
  - envKeys: none

## Migration Phases

### RDS01_FREEZE_SCHEMA_INVENTORY

- canStartNow: false
- blockedBy: none
- expectedEvidence: Supabase table/RPC/storage inventory reviewed; first-version APP scope confirmed; deploy/aliyun-production-cn.rds-first-version-schema-map.json contains non-secret table/function/storage scope

### RDS02_CREATE_ALIYUN_RDS_POSTGRES

- canStartNow: true
- blockedBy: none
- expectedEvidence: RDS PostgreSQL instance exists in cn-hangzhou; DATABASE_URL_CN imported only through secret env

### RDS03_BUILD_POSTGRES_DATA_ACCESS_ADAPTER

- canStartNow: false
- blockedBy: RDS01_FREEZE_SCHEMA_INVENTORY
- expectedEvidence: First-version APP API routes no longer depend on Supabase as formal production-cn data layer; adapter uses DATABASE_URL_CN in server runtime only

### RDS04_MIGRATE_SCHEMA_AND_DATA

- canStartNow: false
- blockedBy: RDS02_CREATE_ALIYUN_RDS_POSTGRES, RDS03_BUILD_POSTGRES_DATA_ACCESS_ADAPTER
- expectedEvidence: schema migration completed; data migration completed; row counts and critical records validated

### RDS05_VALIDATE_APP_API_ON_RDS

- canStartNow: false
- blockedBy: RDS04_MIGRATE_SCHEMA_AND_DATA
- expectedEvidence: profile / tenant / invite / service-record smoke passes against RDS; production-cn health strict passes database dependency checks

### RDS06_SWITCH_PRODUCTION_CN_AND_ROLLBACK

- canStartNow: false
- blockedBy: RDS05_VALIDATE_APP_API_ON_RDS
- expectedEvidence: production-cn switch confirmed; rollback runbook rehearsed

## Safety Boundary

- This command does not connect to Supabase, Aliyun RDS, Vercel, or WeChat.
- This command does not read .env files or output secret values.
- This command does not create resources, import environment variables, push images, or deploy production-cn.

## Next Actions

- Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou before importing DATABASE_URL_CN.
- Keep Supabase variables only as migration-source or legacy-compatibility env, not as the final production-cn database target.
- Plan code migration for the first-version APP API routes and shared Supabase data access files listed in this report.
- Add schema/data migration and rollback evidence before marking Aliyun RDS PostgreSQL migration confirmed.
