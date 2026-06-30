# P05 OSS Runtime Access Handoff

Generated at: 2026-06-30T14:41:20.743Z

## Scope

- currentScope: backend_aliyun_only
- authorizationPacket: P05_OSS_RAM_STS
- ok: false
- readOnlyOnly: true
- mutationPerformed: false
- cloudApiCalled: false
- containsValues: false

## Current Status

- currentAnswer: OSS runtime access is not ready; local policy/code contract is checked, but cloud RAM/STS/runtime role evidence still has blockers.
- expectedBucket: meiye-huajing-service-records-production-cn
- expectedRegion: cn-hangzhou
- expectedOssRegionEnvValue: oss-cn-hangzhou
- expectedServiceRecordPrefix: service-records/production-cn
- blockers: cloud:oss.confirmed, cloud:oss.corsConfigured, cloud:oss.ramLeastPrivilege, cloud:oss.accessMode
- warnings: none

## Local Policy

- file: deploy/aliyun-production-cn.oss-ram-policy.json
- ready: true
- allowedActions: oss:GetObject, oss:PostObject, oss:PutObject
- expectedResourceScope: acs:oss:*:*:meiye-huajing-service-records-production-cn/service-records/production-cn/*
- prefixScoped: true
- forbiddenActionsPresent: none

## Code Contract

- ready: true
- runtimeRoleCredentialSupported: true
- credentialModesSupported: sae_rrsa_oidc, ecs_ram_role_metadata, sts_assume_role_secret_env, least_privilege_ram_user_secret_env
- requiredCommonRuntimeEnvNames: ALIYUN_OSS_BUCKET, ALIYUN_OSS_REGION, SERVICE_RECORD_OSS_PREFIX
- requiredRuntimeRoleEnvNames: ALIBABA_CLOUD_ROLE_ARN, ALIBABA_CLOUD_OIDC_PROVIDER_ARN, ALIBABA_CLOUD_OIDC_TOKEN_FILE
- optionalMetadataRuntimeRoleEnvNames: ALIYUN_OSS_RAM_ROLE_NAME, SERVICE_RECORD_OSS_RAM_ROLE_NAME, ALIBABA_CLOUD_ECS_METADATA
- fallbackSecretEnvNames: ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_SECURITY_TOKEN
- codeDefaultPrefix: service-records
- expectedRuntimePrefix: service-records/production-cn
- prefixRequiresRuntimeEnv: true

## Cloud Confirmation

- file: tests/fixtures/aliyun-user-action-brief/cloud-confirmations.fixture.json
- ready: false
- confirmed: false
- bucket: meiye-huajing-service-records-production-cn
- region: cn-hangzhou
- corsConfigured: false
- ramLeastPrivilege: false
- serviceRecordPrefix: service-records/production-cn
- accessMode: pending_choose_sae_runtime_role_or_sts
- policyName: MeiyeHuajingServiceRecordsOssPolicy
- credentialBoundary: pending_runtime_role_or_sts

## Execution Readiness

- canStartP05AfterActionTimeConfirmation: true
- resourceReadyForP05: false
- policyTemplateReady: true
- codeContractReady: true
- accessGrantReady: false
- preferredModeId: sae_runtime_role
- preferredModeAvoidsLongLivedSecret: true
- fallbackModeIds: sts_assume_role, least_privilege_ram_user_secret_env
- nextOperatorDecision: bind_sae_runtime_role_or_sts_to_policy_then_record_non_secret_evidence

## Writeback Fields After Authorized P05 Action

- items.oss.confirmed=true
- items.oss.ramLeastPrivilege=true
- items.oss.accessMode=sae_runtime_role or sts_assume_role
- items.oss.roleOrUserName=<non-secret role/user name>
- items.oss.credentialBoundary=runtime_role_no_long_lived_secret or sts_token_secret_env_only
- SAE RRSA/OIDC env ALIBABA_CLOUD_ROLE_ARN, ALIBABA_CLOUD_OIDC_PROVIDER_ARN, and ALIBABA_CLOUD_OIDC_TOKEN_FILE when accessMode=sae_runtime_role
- SAE plain env SERVICE_RECORD_OSS_PREFIX=service-records/production-cn

## Verification Commands

- corepack pnpm aliyun:oss:runtime-access:strict
- corepack pnpm aliyun:cloud:confirmations:backend:strict
- corepack pnpm aliyun:sensitive:blockers:backend

## Safety Boundary

- Do not write ALIYUN_OSS_ACCESS_KEY_SECRET value.
- Do not write ALIYUN_OSS_SECURITY_TOKEN value.
- Do not write AccessKeySecret.
- Do not write STS token.
- Do not write cookie.
- Do not write customer audio payloads.
