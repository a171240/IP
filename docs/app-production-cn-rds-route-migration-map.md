# Aliyun RDS Route Migration Map

- ok: true
- containsValues: false
- readOnlyOnly: true
- cloudApiCalled: false
- mutationPerformed: false
- currentScope: backend_aliyun_only
- formalTarget: Aliyun RDS PostgreSQL
- currentSource: Supabase migration source / legacy compatibility only
- firstVersionRouteCount: 28
- routesStillUsingSupabaseDataAccess: 0
- routesUsingAliyunRdsDataAccess: 28
- sharedDataAccessFileCount: 0
- sharedRdsDataAccessFileCount: 42
- implementationWorkPackageCount: 6
- proposedRepositoryFileCount: 12
- observedTables: app_auth_token_revocations, app_learning_progress_events, entitlements, mp_account_invites, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions, store_profiles, voice_coach_customer_profiles, voice_coach_sessions, voice_coach_turns
- observedRpcs: none
- schemaMapMissingObservedTables: none
- requiredTablesWithoutRouteObservation: app_compliance_requests, credit_transactions
- blockedCredentialNames: DATABASE_URL_CN

## Route Groups

### account

- routeCount: 2
- routesStillUsingSupabaseDataAccess: 0
- tableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles
- rpcNames: none
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/entitlements/route.ts, app/api/app/profile/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts
- /api/app/profile
- /api/app/entitlements

### store-admin

- routeCount: 3
- routesStillUsingSupabaseDataAccess: 0
- tableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- rpcNames: none
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-admin/analytics/route.ts, app/api/app/store-admin/members/route.ts, app/api/app/store-admin/overview/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/store-admin.server.ts
- /api/app/store-admin/overview
- /api/app/store-admin/members
- /api/app/store-admin/analytics

### invites

- routeCount: 4
- routesStillUsingSupabaseDataAccess: 0
- tableNames: app_auth_token_revocations, entitlements, mp_account_invites, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- rpcNames: none
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-admin/invites/[token]/accept/route.ts, app/api/app/store-admin/invites/[token]/preview/route.ts, app/api/app/store-admin/invites/[token]/qrcode/route.ts, app/api/app/store-admin/invites/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/store-admin.server.ts, lib/aliyun-rds/repositories/store-invites.server.ts
- /api/app/store-admin/invites
- /api/app/store-admin/invites/[token]/preview
- /api/app/store-admin/invites/[token]/accept
- /api/app/store-admin/invites/[token]/qrcode

### context

- routeCount: 4
- routesStillUsingSupabaseDataAccess: 0
- tableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, store_profiles, voice_coach_customer_profiles
- rpcNames: none
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/customer-profiles/[profileId]/route.ts, app/api/app/customer-profiles/route.ts, app/api/app/store-profiles/[profileId]/route.ts, app/api/app/store-profiles/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/customer-profiles.server.ts, lib/aliyun-rds/repositories/store-profiles.server.ts
- /api/app/store-profiles
- /api/app/store-profiles/[profileId]
- /api/app/customer-profiles
- /api/app/customer-profiles/[profileId]

### learning-progress

- routeCount: 3
- routesStillUsingSupabaseDataAccess: 0
- tableNames: app_auth_token_revocations, app_learning_progress_events, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles
- rpcNames: none
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/learning/progress/events/route.ts, app/api/app/learning/progress/route.ts, app/api/app/learning/progress/sync/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/learning-progress.server.ts
- /api/app/learning/progress
- /api/app/learning/progress/events
- /api/app/learning/progress/sync

### service-records

- routeCount: 12
- routesStillUsingSupabaseDataAccess: 0
- tableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- rpcNames: none
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/device-files/check/route.ts, app/api/app/service-records/sessions/[sessionId]/asr/poll/route.ts, app/api/app/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts, app/api/app/service-records/sessions/[sessionId]/end/route.ts, app/api/app/service-records/sessions/[sessionId]/markers/route.ts, app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts, app/api/app/service-records/sessions/[sessionId]/process/route.ts, app/api/app/service-records/sessions/[sessionId]/resume/route.ts, app/api/app/service-records/sessions/[sessionId]/route.ts, app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts, app/api/app/service-records/sessions/[sessionId]/segments/route.ts, app/api/app/service-records/sessions/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/service-record-processing.server.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-asr.server.ts, lib/aliyun-rds/service-record-oss.server.ts
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

## Implementation Work Packages

### RDS_WP01_ACCOUNT_PROFILE_ENTITLEMENTS

- order: 1
- title: Profile, entitlement, account context, and AI point billing repositories
- status: rds_repository_in_source_pending_runtime_evidence
- scope: account
- routeCount: 2
- routesStillUsingSupabaseDataAccess: 0
- routes: /api/app/profile, /api/app/entitlements
- tableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles
- rpcNames: none
- currentSupabaseDataAccessFiles: none
- rdsDataAccessFiles: app/api/app/entitlements/route.ts, app/api/app/profile/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts
- proposedRepositoryFiles: lib/aliyun-rds/repositories/account-context.server.ts, lib/aliyun-rds/repositories/ai-points.server.ts, lib/aliyun-rds/repositories/pricing-profile.server.ts
- blockedBy: DATABASE_URL_CN, profiles_entitlements_membership_rows_migrated, request_auth_identity_boundary_ready, schema_data_rollback_validation
- acceptanceGate: /api/app/profile and /api/app/entitlements read profile, membership, entitlement, and point data through DATABASE_URL_CN.
- acceptanceGate: First-version account routes no longer require Supabase SDK business data access files.
- acceptanceGate: consume_credits and grant_trial_credits are implemented as PostgreSQL functions or equivalent transactions on RDS.

### RDS_WP02_CONTEXT_PROFILES

- order: 2
- title: Store profile and customer profile repositories
- status: rds_repository_in_source_pending_runtime_evidence
- scope: context
- routeCount: 4
- routesStillUsingSupabaseDataAccess: 0
- routes: /api/app/store-profiles, /api/app/store-profiles/[profileId], /api/app/customer-profiles, /api/app/customer-profiles/[profileId]
- tableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, store_profiles, voice_coach_customer_profiles
- rpcNames: none
- currentSupabaseDataAccessFiles: none
- rdsDataAccessFiles: app/api/app/customer-profiles/[profileId]/route.ts, app/api/app/customer-profiles/route.ts, app/api/app/store-profiles/[profileId]/route.ts, app/api/app/store-profiles/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/customer-profiles.server.ts, lib/aliyun-rds/repositories/store-profiles.server.ts
- proposedRepositoryFiles: lib/aliyun-rds/repositories/store-profiles.server.ts, lib/aliyun-rds/repositories/customer-profiles.server.ts
- blockedBy: DATABASE_URL_CN, request_auth_identity_boundary_ready, schema_data_rollback_validation, store_profiles_and_customer_profiles_migrated
- acceptanceGate: /api/app/store-profiles and /api/app/customer-profiles CRUD use DATABASE_URL_CN-backed repositories.
- acceptanceGate: Profile ownership and tenant filters are enforced in SQL or repository guards before returning rows.
- acceptanceGate: Create/update/delete paths preserve existing API response shapes used by the APP bridge.

### RDS_WP03_SERVICE_RECORDS_CORE

- order: 3
- title: Service record session, segment, marker, and playback repositories
- status: rds_repository_in_source_pending_runtime_evidence
- scope: service-records
- routeCount: 12
- routesStillUsingSupabaseDataAccess: 0
- routes: /api/app/service-records/sessions, /api/app/service-records/sessions/[sessionId], /api/app/service-records/device-files/check, /api/app/service-records/sessions/[sessionId]/segments, /api/app/service-records/sessions/[sessionId]/oss-upload, /api/app/service-records/sessions/[sessionId]/segments/oss, /api/app/service-records/sessions/[sessionId]/markers, /api/app/service-records/sessions/[sessionId]/resume, /api/app/service-records/sessions/[sessionId]/end, /api/app/service-records/sessions/[sessionId]/process, /api/app/service-records/sessions/[sessionId]/asr/poll, /api/app/service-records/sessions/[sessionId]/audio/[segmentId]
- tableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- rpcNames: none
- currentSupabaseDataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/device-files/check/route.ts, app/api/app/service-records/sessions/[sessionId]/asr/poll/route.ts, app/api/app/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts, app/api/app/service-records/sessions/[sessionId]/end/route.ts, app/api/app/service-records/sessions/[sessionId]/markers/route.ts, app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts, app/api/app/service-records/sessions/[sessionId]/process/route.ts, app/api/app/service-records/sessions/[sessionId]/resume/route.ts, app/api/app/service-records/sessions/[sessionId]/route.ts, app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts, app/api/app/service-records/sessions/[sessionId]/segments/route.ts, app/api/app/service-records/sessions/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/service-record-processing.server.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-asr.server.ts, lib/aliyun-rds/service-record-oss.server.ts
- proposedRepositoryFiles: lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/repositories/service-record-segments.server.ts, lib/aliyun-rds/repositories/service-record-processing.server.ts
- blockedBy: DATABASE_URL_CN, oss_audio_runtime_access_ready, request_auth_identity_boundary_ready, schema_data_rollback_validation, service_record_tables_migrated
- acceptanceGate: Long-recording create/resume/end/process/poll/audio routes persist and read sessions through DATABASE_URL_CN.
- acceptanceGate: Segment and marker mutations run in PostgreSQL transactions where the previous Supabase chain used multiple writes.
- acceptanceGate: Playback routes use RDS metadata plus Aliyun OSS storage access and keep unauthenticated access blocked.

### RDS_WP04_STORE_ADMIN_READ_MODELS

- order: 4
- title: Store-admin overview, member, and analytics read models
- status: rds_repository_in_source_pending_runtime_evidence
- scope: store-admin
- routeCount: 3
- routesStillUsingSupabaseDataAccess: 0
- routes: /api/app/store-admin/overview, /api/app/store-admin/members, /api/app/store-admin/analytics
- tableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- rpcNames: none
- currentSupabaseDataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-admin/analytics/route.ts, app/api/app/store-admin/members/route.ts, app/api/app/store-admin/overview/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/store-admin.server.ts
- proposedRepositoryFiles: lib/aliyun-rds/repositories/store-admin.server.ts, lib/aliyun-rds/repositories/org-analytics.server.ts
- blockedBy: DATABASE_URL_CN, account_context_repository_ready, schema_data_rollback_validation, voice_session_history_rows_migrated
- acceptanceGate: Store manager overview, members, and analytics routes query RDS with tenant/company/store scoping.
- acceptanceGate: Manager-only access remains enforced before analytics or member lists are returned.
- acceptanceGate: APP smoke confirms store managers can view their own store records and cannot view other tenant records.

### RDS_WP05_STORE_INVITES

- order: 5
- title: Store invitation repositories and token lookup
- status: rds_repository_in_source_pending_runtime_evidence
- scope: invites
- routeCount: 4
- routesStillUsingSupabaseDataAccess: 0
- routes: /api/app/store-admin/invites, /api/app/store-admin/invites/[token]/preview, /api/app/store-admin/invites/[token]/accept, /api/app/store-admin/invites/[token]/qrcode
- tableNames: app_auth_token_revocations, entitlements, mp_account_invites, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- rpcNames: none
- currentSupabaseDataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-admin/invites/[token]/accept/route.ts, app/api/app/store-admin/invites/[token]/preview/route.ts, app/api/app/store-admin/invites/[token]/qrcode/route.ts, app/api/app/store-admin/invites/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/store-admin.server.ts, lib/aliyun-rds/repositories/store-invites.server.ts
- proposedRepositoryFiles: lib/aliyun-rds/repositories/store-invites.server.ts
- blockedBy: DATABASE_URL_CN, account_context_repository_ready, mp_account_invites_rows_migrated, production_cn_public_base_url_ready, schema_data_rollback_validation
- acceptanceGate: Invite create, preview, accept, and qrcode routes use RDS invite rows and existing hashed-token semantics.
- acceptanceGate: Accept flow inserts or updates memberships in a PostgreSQL transaction.
- acceptanceGate: Generated invite links point to the production-cn backend/app base URL without exposing token hashes.

### RDS_WP06_PROFESSIONAL_LEARNING_PROGRESS

- order: 6
- title: Professional and speech learning progress event repository
- status: rds_repository_in_source_pending_runtime_evidence
- scope: learning-progress
- routeCount: 3
- routesStillUsingSupabaseDataAccess: 0
- routes: /api/app/learning/progress, /api/app/learning/progress/events, /api/app/learning/progress/sync
- tableNames: app_auth_token_revocations, app_learning_progress_events, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles
- rpcNames: none
- currentSupabaseDataAccessFiles: none
- rdsDataAccessFiles: app/api/app/learning/progress/events/route.ts, app/api/app/learning/progress/route.ts, app/api/app/learning/progress/sync/route.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/learning-progress.server.ts
- proposedRepositoryFiles: lib/aliyun-rds/repositories/learning-progress.server.ts
- blockedBy: DATABASE_URL_CN, account_context_repository_ready, app_learning_progress_events_table_migrated, schema_data_rollback_validation
- acceptanceGate: Learning progress query, event, and sync routes use the DATABASE_URL_CN-backed event store.
- acceptanceGate: Company, store, membership, and user scope remain enforced before progress is returned or written.
- acceptanceGate: Client event idempotency and viewed/practiced aggregation are validated against migrated RDS data.

## Route Details

### /api/app/profile

- methods: GET
- scope: account
- appFile: app/api/app/profile/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/profile/route.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/profile/route.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/entitlements

- methods: GET
- scope: account
- appFile: app/api/app/entitlements/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/entitlements/route.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/entitlements/route.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/store-admin/overview

- methods: GET
- scope: store-admin
- appFile: app/api/app/store-admin/overview/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/store-admin/overview/route.ts, lib/aliyun-rds/repositories/store-admin.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-admin/overview/route.ts, lib/aliyun-rds/repositories/store-admin.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/store-admin/members

- methods: GET
- scope: store-admin
- appFile: app/api/app/store-admin/members/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/store-admin/members/route.ts, lib/aliyun-rds/repositories/store-admin.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-admin/members/route.ts, lib/aliyun-rds/repositories/store-admin.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/store-admin/analytics

- methods: GET
- scope: store-admin
- appFile: app/api/app/store-admin/analytics/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/store-admin/analytics/route.ts, lib/aliyun-rds/repositories/store-admin.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-admin/analytics/route.ts, lib/aliyun-rds/repositories/store-admin.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/store-admin/invites

- methods: POST
- scope: invites
- appFile: app/api/app/store-admin/invites/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/store-admin/invites/route.ts, lib/aliyun-rds/repositories/store-invites.server.ts, lib/aliyun-rds/repositories/store-admin.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_invites, mp_account_memberships, mp_ai_point_ledger, mp_companies, mp_stores, profiles, voice_coach_sessions, voice_coach_turns
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-admin/invites/route.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/store-admin.server.ts, lib/aliyun-rds/repositories/store-invites.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/store-admin/invites/[token]/preview

- methods: GET
- scope: invites
- appFile: app/api/app/store-admin/invites/[token]/preview/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/store-admin/invites/[token]/preview/route.ts, lib/aliyun-rds/repositories/store-invites.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: entitlements, mp_account_invites, mp_account_memberships, mp_companies, mp_stores, profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-admin/invites/[token]/preview/route.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/store-invites.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/store-admin/invites/[token]/accept

- methods: POST
- scope: invites
- appFile: app/api/app/store-admin/invites/[token]/accept/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/store-admin/invites/[token]/accept/route.ts, lib/aliyun-rds/repositories/store-invites.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_invites, mp_account_memberships, mp_companies, mp_stores, profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-admin/invites/[token]/accept/route.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/store-invites.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/store-admin/invites/[token]/qrcode

- methods: GET
- scope: invites
- appFile: app/api/app/store-admin/invites/[token]/qrcode/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/store-admin/invites/[token]/qrcode/route.ts, lib/aliyun-rds/repositories/store-invites.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: entitlements, mp_account_invites, mp_account_memberships, mp_companies, mp_stores, profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-admin/invites/[token]/qrcode/route.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/store-invites.server.ts, lib/aliyun-rds/kms-secret.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/store-profiles

- methods: GET, POST
- scope: context
- appFile: app/api/app/store-profiles/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/store-profiles/route.ts, lib/aliyun-rds/repositories/store-profiles.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, store_profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-profiles/route.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/store-profiles.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/store-profiles/[profileId]

- methods: GET, PUT, DELETE
- scope: context
- appFile: app/api/app/store-profiles/[profileId]/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/store-profiles/[profileId]/route.ts, lib/aliyun-rds/repositories/store-profiles.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, store_profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/store-profiles/[profileId]/route.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/store-profiles.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/customer-profiles

- methods: GET, POST
- scope: context
- appFile: app/api/app/customer-profiles/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/customer-profiles/route.ts, lib/aliyun-rds/repositories/customer-profiles.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, voice_coach_customer_profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/customer-profiles/route.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/customer-profiles.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/customer-profiles/[profileId]

- methods: GET, PUT, DELETE
- scope: context
- appFile: app/api/app/customer-profiles/[profileId]/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/customer-profiles/[profileId]/route.ts, lib/aliyun-rds/repositories/customer-profiles.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, voice_coach_customer_profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/customer-profiles/[profileId]/route.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/customer-profiles.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/learning/progress

- methods: GET
- scope: learning-progress
- appFile: app/api/app/learning/progress/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/learning/progress/route.ts, lib/aliyun-rds/repositories/learning-progress.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, app_learning_progress_events, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/learning/progress/route.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/learning-progress.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/learning/progress/events

- methods: POST
- scope: learning-progress
- appFile: app/api/app/learning/progress/events/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/learning/progress/events/route.ts, lib/aliyun-rds/repositories/learning-progress.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, app_learning_progress_events, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/learning/progress/events/route.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/learning-progress.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/learning/progress/sync

- methods: POST
- scope: learning-progress
- appFile: app/api/app/learning/progress/sync/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/learning/progress/sync/route.ts, lib/aliyun-rds/repositories/learning-progress.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, app_learning_progress_events, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/learning/progress/sync/route.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/repositories/learning-progress.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/sessions

- methods: GET, POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/sessions/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/sessions/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/sessions/[sessionId]

- methods: GET
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/sessions/[sessionId]/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/sessions/[sessionId]/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/device-files/check

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/device-files/check/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/device-files/check/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/device-files/check/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/sessions/[sessionId]/segments

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/segments/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/sessions/[sessionId]/segments/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-oss.server.ts, lib/aliyun-rds/service-record-asr.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/sessions/[sessionId]/segments/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-asr.server.ts, lib/aliyun-rds/service-record-oss.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/sessions/[sessionId]/oss-upload

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-oss.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-oss.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/sessions/[sessionId]/segments/oss

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-oss.server.ts, lib/aliyun-rds/service-record-asr.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-asr.server.ts, lib/aliyun-rds/service-record-oss.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/sessions/[sessionId]/markers

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/markers/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/sessions/[sessionId]/markers/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/sessions/[sessionId]/markers/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/sessions/[sessionId]/resume

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/resume/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/sessions/[sessionId]/resume/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/sessions/[sessionId]/resume/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/sessions/[sessionId]/end

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/end/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/sessions/[sessionId]/end/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/sessions/[sessionId]/end/route.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/sessions/[sessionId]/process

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/process/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/sessions/[sessionId]/process/route.ts, lib/aliyun-rds/repositories/service-record-processing.server.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/sessions/[sessionId]/process/route.ts, lib/aliyun-rds/repositories/service-record-processing.server.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-asr.server.ts, lib/aliyun-rds/service-record-oss.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/sessions/[sessionId]/asr/poll

- methods: POST
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/asr/poll/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/sessions/[sessionId]/asr/poll/route.ts, lib/aliyun-rds/repositories/service-record-processing.server.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-asr.server.ts, lib/aliyun-rds/service-record-oss.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/sessions/[sessionId]/asr/poll/route.ts, lib/aliyun-rds/repositories/service-record-processing.server.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-asr.server.ts, lib/aliyun-rds/service-record-oss.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

### /api/app/service-records/sessions/[sessionId]/audio/[segmentId]

- methods: GET
- scope: service-records
- appFile: app/api/app/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts
- sourceRoute: none
- sourceFiles: app/api/app/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts, lib/aliyun-rds/repositories/service-record-processing.server.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-oss.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/postgres.server.ts
- tableNames: none
- rpcNames: none
- rdsTableNames: app_auth_token_revocations, entitlements, mp_account_memberships, mp_companies, mp_stores, profiles, service_record_markers, service_record_segments, service_record_sessions
- dataAccessFiles: none
- rdsDataAccessFiles: app/api/app/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts, lib/aliyun-rds/repositories/service-record-processing.server.ts, lib/aliyun-rds/repositories/service-records.server.ts, lib/aliyun-rds/service-record-asr.server.ts, lib/aliyun-rds/service-record-oss.server.ts, lib/aliyun-rds/app-auth.server.ts, lib/aliyun-rds/postgres.server.ts, lib/aliyun-rds/repositories/account-profile.server.ts, lib/aliyun-rds/app-auth-revocations.server.ts, lib/aliyun-rds/kms-secret.server.ts
- rdsMigrationStatus: rds_repository_in_source_pending_runtime_evidence

## Next Required Actions

- Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou before importing DATABASE_URL_CN.
- Keep the APP-native RDS work packages in place and validate account, context, service-records, store-admin, invites, and professional learning progress against migrated RDS data.
- Run schema/data migration, row-count validation, critical-record validation, APP API smoke, and rollback rehearsal.
