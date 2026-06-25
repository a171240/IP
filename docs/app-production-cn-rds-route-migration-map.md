# Aliyun RDS Route Migration Map

- ok: true
- containsValues: false
- readOnlyOnly: true
- cloudApiCalled: false
- mutationPerformed: false
- currentScope: backend_aliyun_only
- formalTarget: Aliyun RDS PostgreSQL
- currentSource: Supabase migration source / legacy compatibility only
- firstVersionRouteCount: 25
- routesStillUsingSupabaseDataAccess: 25
- sharedDataAccessFileCount: 31
- observedTables: credit_transactions, entitlements, mp_account_invites, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions, store_profiles, voice_coach_customer_profiles, voice_coach_sessions, voice_coach_turns
- observedRpcs: consume_credits, grant_trial_credits
- schemaMapMissingObservedTables: none
- requiredTablesWithoutRouteObservation: none
- blockedCredentialNames: DATABASE_URL_CN

## Route Groups

### account

- routeCount: 2
- tableNames: credit_transactions, entitlements, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles
- dataAccessFiles: app/api/mp/profile/route.ts, lib/mp/account-context.server.ts, lib/mp/ai-points.server.ts, lib/pricing/profile.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- /api/app/profile
- /api/app/entitlements

### store-admin

- routeCount: 3
- tableNames: mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- dataAccessFiles: app/api/mp/store-admin/analytics/route.ts, app/api/mp/store-admin/members/route.ts, app/api/mp/store-admin/overview/route.ts, lib/mp/account-context.server.ts, lib/mp/org-analytics.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- /api/app/store-admin/overview
- /api/app/store-admin/members
- /api/app/store-admin/analytics

### invites

- routeCount: 4
- tableNames: mp_account_invites, mp_account_memberships, mp_companies, mp_stores, profiles
- dataAccessFiles: app/api/mp/store-admin/invites/[token]/accept/route.ts, app/api/mp/store-admin/invites/[token]/preview/route.ts, app/api/mp/store-admin/invites/[token]/qrcode/route.ts, app/api/mp/store-admin/invites/route.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- /api/app/store-admin/invites
- /api/app/store-admin/invites/[token]/preview
- /api/app/store-admin/invites/[token]/accept
- /api/app/store-admin/invites/[token]/qrcode

### context

- routeCount: 4
- tableNames: profiles, store_profiles, voice_coach_customer_profiles
- dataAccessFiles: app/api/mp/store-profiles/[profileId]/route.ts, app/api/mp/store-profiles/route.ts, app/api/mp/voice-coach/customer-profiles/[profileId]/route.ts, app/api/mp/voice-coach/customer-profiles/route.ts, lib/supabase/server.ts
- /api/app/store-profiles
- /api/app/store-profiles/[profileId]
- /api/app/customer-profiles
- /api/app/customer-profiles/[profileId]

### service-records

- routeCount: 12
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: app/api/mp/service-records/sessions/[sessionId]/asr/poll/route.ts, app/api/mp/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts, app/api/mp/service-records/sessions/[sessionId]/end/route.ts, app/api/mp/service-records/sessions/[sessionId]/markers/route.ts, app/api/mp/service-records/sessions/[sessionId]/resume/route.ts, app/api/mp/service-records/sessions/[sessionId]/route.ts, app/api/mp/service-records/sessions/[sessionId]/segments/oss/route.ts, app/api/mp/service-records/sessions/[sessionId]/segments/route.ts, app/api/mp/service-records/sessions/route.ts, lib/mp/account-context.server.ts, lib/service-records/processing.server.ts, lib/service-records/segments.server.ts, lib/service-records/server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts, lib/voice-coach/storage.server.ts
- /api/app/service-records/sessions
- /api/app/service-records/sessions/[sessionId]
- /api/app/service-records/device-files/check
- /api/app/service-records/sessions/[sessionId]/segments
- /api/app/service-records/sessions/[sessionId]/oss-upload
- /api/app/service-records/sessions/[sessionId]/segments/oss
- /api/app/service-records/sessions/[sessionId]/markers
- /api/app/service-records/sessions/[sessionId]/resume
- /api/app/service-records/sessions/[sessionId]/end
- /api/app/service-records/sessions/[sessionId]/process
- /api/app/service-records/sessions/[sessionId]/asr/poll
- /api/app/service-records/sessions/[sessionId]/audio/[segmentId]

## Route Details

### /api/app/profile

- methods: GET
- scope: account
- appFile: app/api/app/profile/route.ts
- sourceRoute: /api/mp/profile
- sourceFiles: app/api/mp/profile/route.ts
- tableNames: credit_transactions, entitlements, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles
- rpcNames: consume_credits, grant_trial_credits
- dataAccessFiles: app/api/mp/profile/route.ts, lib/mp/ai-points.server.ts, lib/mp/account-context.server.ts, lib/pricing/profile.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/entitlements

- methods: GET
- scope: account
- appFile: app/api/app/entitlements/route.ts
- sourceRoute: /api/mp/profile
- sourceFiles: app/api/mp/profile/route.ts
- tableNames: credit_transactions, entitlements, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles
- rpcNames: consume_credits, grant_trial_credits
- dataAccessFiles: app/api/mp/profile/route.ts, lib/mp/ai-points.server.ts, lib/mp/account-context.server.ts, lib/pricing/profile.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/store-admin/overview

- methods: GET
- scope: store-admin
- appFile: app/api/app/store-admin/overview/route.ts
- sourceRoute: /api/mp/store-admin/overview
- sourceFiles: app/api/mp/store-admin/overview/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- rpcNames: none
- dataAccessFiles: app/api/mp/store-admin/overview/route.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/store-admin/members

- methods: GET
- scope: store-admin
- appFile: app/api/app/store-admin/members/route.ts
- sourceRoute: /api/mp/store-admin/members
- sourceFiles: app/api/mp/store-admin/members/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- rpcNames: none
- dataAccessFiles: app/api/mp/store-admin/members/route.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/store-admin/analytics

- methods: GET
- scope: store-admin
- appFile: app/api/app/store-admin/analytics/route.ts
- sourceRoute: /api/mp/store-admin/analytics
- sourceFiles: app/api/mp/store-admin/analytics/route.ts
- tableNames: mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- rpcNames: none
- dataAccessFiles: app/api/mp/store-admin/analytics/route.ts, lib/mp/account-context.server.ts, lib/mp/org-analytics.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/store-admin/invites

- methods: POST
- scope: invites
- appFile: app/api/app/store-admin/invites/route.ts
- sourceRoute: /api/mp/store-admin/invites
- sourceFiles: app/api/mp/store-admin/invites/route.ts
- tableNames: mp_account_invites, mp_account_memberships, mp_companies, mp_stores, profiles
- rpcNames: none
- dataAccessFiles: app/api/mp/store-admin/invites/route.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/store-admin/invites/[token]/preview

- methods: GET
- scope: invites
- appFile: app/api/app/store-admin/invites/[token]/preview/route.ts
- sourceRoute: /api/mp/store-admin/invites/[token]/preview
- sourceFiles: app/api/mp/store-admin/invites/[token]/preview/route.ts
- tableNames: mp_account_invites, mp_account_memberships, mp_companies, mp_stores, profiles
- rpcNames: none
- dataAccessFiles: app/api/mp/store-admin/invites/[token]/preview/route.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/store-admin/invites/[token]/accept

- methods: POST
- scope: invites
- appFile: app/api/app/store-admin/invites/[token]/accept/route.ts
- sourceRoute: /api/mp/store-admin/invites/[token]/accept
- sourceFiles: app/api/mp/store-admin/invites/[token]/accept/route.ts
- tableNames: mp_account_invites, mp_account_memberships, mp_companies, mp_stores, profiles
- rpcNames: none
- dataAccessFiles: app/api/mp/store-admin/invites/[token]/accept/route.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/store-admin/invites/[token]/qrcode

- methods: GET
- scope: invites
- appFile: app/api/app/store-admin/invites/[token]/qrcode/route.ts
- sourceRoute: /api/mp/store-admin/invites/[token]/qrcode
- sourceFiles: app/api/mp/store-admin/invites/[token]/qrcode/route.ts
- tableNames: mp_account_invites, mp_account_memberships, mp_companies, mp_stores, profiles
- rpcNames: none
- dataAccessFiles: app/api/mp/store-admin/invites/[token]/qrcode/route.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/store-profiles

- methods: GET, POST
- scope: context
- appFile: app/api/app/store-profiles/route.ts
- sourceRoute: /api/mp/store-profiles
- sourceFiles: app/api/mp/store-profiles/route.ts
- tableNames: profiles, store_profiles
- rpcNames: none
- dataAccessFiles: app/api/mp/store-profiles/route.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/store-profiles/[profileId]

- methods: GET, PUT, DELETE
- scope: context
- appFile: app/api/app/store-profiles/[profileId]/route.ts
- sourceRoute: /api/mp/store-profiles/[profileId]
- sourceFiles: app/api/mp/store-profiles/[profileId]/route.ts
- tableNames: store_profiles
- rpcNames: none
- dataAccessFiles: app/api/mp/store-profiles/[profileId]/route.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/customer-profiles

- methods: GET, POST
- scope: context
- appFile: app/api/app/customer-profiles/route.ts
- sourceRoute: /api/mp/voice-coach/customer-profiles
- sourceFiles: app/api/mp/voice-coach/customer-profiles/route.ts
- tableNames: voice_coach_customer_profiles
- rpcNames: none
- dataAccessFiles: app/api/mp/voice-coach/customer-profiles/route.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/customer-profiles/[profileId]

- methods: GET, PUT, DELETE
- scope: context
- appFile: app/api/app/customer-profiles/[profileId]/route.ts
- sourceRoute: /api/mp/voice-coach/customer-profiles/[profileId]
- sourceFiles: app/api/mp/voice-coach/customer-profiles/[profileId]/route.ts
- tableNames: voice_coach_customer_profiles
- rpcNames: none
- dataAccessFiles: app/api/mp/voice-coach/customer-profiles/[profileId]/route.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/sessions

- methods: GET, POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/route.ts
- sourceRoute: /api/mp/service-records/sessions
- sourceFiles: app/api/mp/service-records/sessions/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_sessions
- rpcNames: none
- dataAccessFiles: app/api/mp/service-records/sessions/route.ts, lib/service-records/server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/sessions/[sessionId]

- methods: GET
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/route.ts
- sourceRoute: /api/mp/service-records/sessions/[sessionId]
- sourceFiles: app/api/mp/service-records/sessions/[sessionId]/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- rpcNames: none
- dataAccessFiles: app/api/mp/service-records/sessions/[sessionId]/route.ts, lib/service-records/server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/voice-coach/storage.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/device-files/check

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/device-files/check/route.ts
- sourceRoute: /api/mp/service-records/device-files/check
- sourceFiles: app/api/mp/service-records/device-files/check/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_segments, service_record_sessions
- rpcNames: none
- dataAccessFiles: lib/service-records/segments.server.ts, lib/service-records/server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/voice-coach/storage.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/sessions/[sessionId]/segments

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/segments/route.ts
- sourceRoute: /api/mp/service-records/sessions/[sessionId]/segments
- sourceFiles: app/api/mp/service-records/sessions/[sessionId]/segments/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_segments, service_record_sessions
- rpcNames: none
- dataAccessFiles: app/api/mp/service-records/sessions/[sessionId]/segments/route.ts, lib/service-records/segments.server.ts, lib/service-records/server.ts, lib/voice-coach/storage.server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/sessions/[sessionId]/oss-upload

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts
- sourceRoute: /api/mp/service-records/sessions/[sessionId]/oss-upload
- sourceFiles: app/api/mp/service-records/sessions/[sessionId]/oss-upload/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_segments, service_record_sessions
- rpcNames: none
- dataAccessFiles: lib/service-records/segments.server.ts, lib/service-records/server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/voice-coach/storage.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/sessions/[sessionId]/segments/oss

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts
- sourceRoute: /api/mp/service-records/sessions/[sessionId]/segments/oss
- sourceFiles: app/api/mp/service-records/sessions/[sessionId]/segments/oss/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_segments, service_record_sessions
- rpcNames: none
- dataAccessFiles: app/api/mp/service-records/sessions/[sessionId]/segments/oss/route.ts, lib/service-records/segments.server.ts, lib/service-records/server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/voice-coach/storage.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/sessions/[sessionId]/markers

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/markers/route.ts
- sourceRoute: /api/mp/service-records/sessions/[sessionId]/markers
- sourceFiles: app/api/mp/service-records/sessions/[sessionId]/markers/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_sessions
- rpcNames: none
- dataAccessFiles: app/api/mp/service-records/sessions/[sessionId]/markers/route.ts, lib/service-records/server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/sessions/[sessionId]/resume

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/resume/route.ts
- sourceRoute: /api/mp/service-records/sessions/[sessionId]/resume
- sourceFiles: app/api/mp/service-records/sessions/[sessionId]/resume/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_sessions
- rpcNames: none
- dataAccessFiles: app/api/mp/service-records/sessions/[sessionId]/resume/route.ts, lib/service-records/server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/sessions/[sessionId]/end

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/end/route.ts
- sourceRoute: /api/mp/service-records/sessions/[sessionId]/end
- sourceFiles: app/api/mp/service-records/sessions/[sessionId]/end/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_sessions
- rpcNames: none
- dataAccessFiles: app/api/mp/service-records/sessions/[sessionId]/end/route.ts, lib/service-records/server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/sessions/[sessionId]/process

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/process/route.ts
- sourceRoute: /api/mp/service-records/sessions/[sessionId]/process
- sourceFiles: app/api/mp/service-records/sessions/[sessionId]/process/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- rpcNames: none
- dataAccessFiles: lib/service-records/processing.server.ts, lib/service-records/server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/voice-coach/storage.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/sessions/[sessionId]/asr/poll

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/asr/poll/route.ts
- sourceRoute: /api/mp/service-records/sessions/[sessionId]/asr/poll
- sourceFiles: app/api/mp/service-records/sessions/[sessionId]/asr/poll/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_segments, service_record_sessions
- rpcNames: none
- dataAccessFiles: app/api/mp/service-records/sessions/[sessionId]/asr/poll/route.ts, lib/service-records/server.ts, lib/voice-coach/storage.server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

### /api/app/service-records/sessions/[sessionId]/audio/[segmentId]

- methods: GET
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts
- sourceRoute: /api/mp/service-records/sessions/[sessionId]/audio/[segmentId]
- sourceFiles: app/api/mp/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts
- tableNames: mp_account_memberships, mp_companies, mp_stores, profiles, service_record_segments, service_record_sessions
- rpcNames: none
- dataAccessFiles: app/api/mp/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts, lib/service-records/server.ts, lib/mp/account-context.server.ts, lib/supabase/admin.server.ts, lib/voice-coach/storage.server.ts, lib/supabase/server.ts
- rdsMigrationStatus: blocked_until_route_repository_uses_database_url_cn

## Next Required Actions

- Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou before importing DATABASE_URL_CN.
- Replace first-version APP API shared Supabase data access with PostgreSQL repositories backed by DATABASE_URL_CN.
- Run schema/data migration, row-count validation, critical-record validation, APP API smoke, and rollback rehearsal.
