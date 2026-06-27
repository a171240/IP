# 美业话镜 APP production-cn 阿里云资源矩阵

Generated: 2026-06-26T16:42:15.937Z

## 结论

- currentScope: backend_aliyun_only
- fullAppLaunchScope: deferred_after_backend_online
- ready: 0 / 7
- blocked: 7
- containsValues: false
- secretLeakCheck: true
- mutationPerformed: false
- cloudAccessCanReadNow: false
- resourceEvidenceReady: 0/7
- blockedResourceEvidenceIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS

## 资源证据简表

| 资源 | 状态 | 观察状态 | 授权包 | 控制台任务 | 缺失证据 | 写回目标 |
| --- | --- | --- | --- | --- | --- | --- |
| `R01_SAE_RUNTIME` | pending_cloud | not_created_or_not_confirmed/blocked | P08_SAE_RUNTIME_SLS | C01_SAE_RUNTIME | runtime:confirmed, observed:not_created_or_not_confirmed | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime |
| `R02_ACR_IMAGE_REGISTRY` | pending_cloud | acr_repository_confirmed_image_push_pending/partial | P04_ACR_IMAGE_AND_PULL | C02_ACR_IMAGE_AND_PULL | imagePublishLocal:todo:acr.remoteDigest, imagePublishLocal:acr.imagePushed, imagePublishLocal:acr.digestVerified, imagePublishLocal:acr.remoteDigest=sha256, imagePublishLocal:acr.pushNetworkPath, imagePublishLocal:runtime.confirmed, imagePublishLocal:runtime.remoteImageConfigured, imagePublishLocal:runtime.imagePullConfigured, observed:acr_repository_confirmed_image_push_pending | deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime |
| `R03_API_DOMAIN_HTTPS` | blocked | domain_visible_records_missing/blocked | P07_DOMAIN_DNS_HTTPS | C03_API_DOMAIN_HTTPS_ICP | APP_API_BASE_URL:dns_special_use_wildcard_ip, APP_API_BASE_URL:https_not_ready:ECONNRESET, NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip, NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET, APP_ASSET_BASE_URL:dns_special_use_wildcard_ip, APP_ASSET_BASE_URL:https_not_ready:ECONNRESET, apiDomainHttps:confirmed, apiDomainHttps:dnsResolvedToAliyun, apiDomainHttps:httpsEnabled, apiDomainHttps:icpReady, assetDomainHttps:confirmed, assetDomainHttps:dnsResolvedToAliyun, assetDomainHttps:httpsEnabled, assetDomainHttps:icpReady, observed:domain_visible_records_missing | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps |
| `R04_ASSET_DOMAIN_HTTPS` | blocked | domain_visible_records_missing/blocked | P07_DOMAIN_DNS_HTTPS | C04_ASSET_DOMAIN_HTTPS_ICP | APP_API_BASE_URL:dns_special_use_wildcard_ip, APP_API_BASE_URL:https_not_ready:ECONNRESET, NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip, NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET, APP_ASSET_BASE_URL:dns_special_use_wildcard_ip, APP_ASSET_BASE_URL:https_not_ready:ECONNRESET, apiDomainHttps:confirmed, apiDomainHttps:dnsResolvedToAliyun, apiDomainHttps:httpsEnabled, apiDomainHttps:icpReady, assetDomainHttps:confirmed, assetDomainHttps:dnsResolvedToAliyun, assetDomainHttps:httpsEnabled, assetDomainHttps:icpReady, observed:domain_visible_records_missing | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps |
| `R05_OSS_AUDIO_STORAGE` | pending_cloud | bucket_visible_unconfirmed/partial | P05_OSS_RAM_STS | C05_OSS_AUDIO_RAM_STS | oss:confirmed, oss:ramLeastPrivilege, observed:bucket_visible_unconfirmed | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss |
| `R06_ENV_IMPORT` | blocked | cloudshell_disconnected_restart_confirmation_required/blocked | P06_ENV_IMPORT | C06_ENV_IMPORT | missing_required_env:DATABASE_URL_CN, envImport:confirmed, envImport:secretNotInImage, envImport:placeholder:importedAt, envImport:placeholder:evidence, observed:cloudshell_disconnected_restart_confirmation_required | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport; 阿里云 SAE 环境变量 / KMS / Secrets Manager |
| `R07_SLS_ALERTS` | pending_cloud | project_logstore_visible_alerts_pending/partial | P08_SAE_RUNTIME_SLS | C07_SLS_ALERTS | slsAlerts:confirmed, slsAlerts:healthAlertConfigured, slsAlerts:serverErrorAlertConfigured, observed:project_logstore_visible_alerts_pending | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts |


## 资源清单

### R01_SAE_RUNTIME 阿里云 SAE production-cn 自定义容器应用

- status: pending_cloud
- provider: Aliyun SAE
- consolePath: 阿里云控制台 -> SAE
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime
- actionTimeConfirmationRequired: false
- observedResourceStatus: not_created_or_not_confirmed / blocked
- blockers: runtime:confirmed
- currentEvidence: chrome_sae_overview_2026-06-27T00:41_CST_cn-hangzhou_huadong1_hangzhou_app_list_empty_no_target_app_meiye-huajing-app-api-production-cn_runtime_not_created; runtimePlan.dataLayerTarget=Aliyun RDS PostgreSQL; runtimePlan.dataLayerConnectionEnvName=DATABASE_URL_CN; runtimePlan.predeployDependencyIds=RDS_POSTGRES_MIGRATION,ACR_IMAGE_DIGEST_AND_PULL,OSS_RUNTIME_ACCESS,BACKEND_ENV_IMPORT; runtimeSlsPlan.ready=false; runtimeSlsPlan.runtime.selectedMode=pending_create_sae_custom_container_runtime; runtimeSlsPlan.runtime.targetAppName=meiye-huajing-app-api-production-cn; runtimeSlsPlan.runtime.ready=false; runtimeSlsPlan.runtime.blockers=runtime.confirmed; runtimeSlsPlan.runtime.recommendedModeIds=sae_custom_container_runtime; runtimeSlsPlan.runtime.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime; runtimeSlsPlan.runtime.candidateIds=sae_custom_container_runtime; observedResourceStatus=not_created_or_not_confirmed; observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:runtime:plan; corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:docker:check; corepack pnpm aliyun:health:smoke

### R02_ACR_IMAGE_REGISTRY 阿里云 ACR 镜像仓库、镜像 digest 和 SAE 拉取配置

- status: pending_cloud
- provider: Aliyun ACR + SAE
- consolePath: 阿里云控制台 -> 容器镜像服务 ACR / SAE 容器运行时
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime
- actionTimeConfirmationRequired: true
- observedResourceStatus: acr_repository_confirmed_image_push_pending / partial
- blockers: imagePublishLocal:todo:acr.remoteDigest, imagePublishLocal:acr.imagePushed, imagePublishLocal:acr.digestVerified, imagePublishLocal:acr.remoteDigest=sha256, imagePublishLocal:acr.pushNetworkPath, imagePublishLocal:runtime.confirmed, imagePublishLocal:runtime.remoteImageConfigured, imagePublishLocal:runtime.imagePullConfigured
- currentEvidence: chrome_acr_repository_2026-06-27T00:11_CST_repo_meiye-huajing-app-api_private_local_normal_cn-hangzhou_repo_id_crr-k3xw5jyl3glkm1vs; chrome_acr_images_2026-06-27T00:13_CST_no_production_cn_tag_or_sha256_digest_visible_on_images_page; imagePublish.localExists=true; imagePublish.localReady=false; image.localDigestReady=true; dockerContext.status=ready; dockerContext.ok=true; dockerContext.checkedFiles=7; dockerContext.sensitiveEnvExcluded=true; localDockerImage.status=docker_daemon_unavailable_or_timeout; localDockerImage.dockerClientInstalled=true; localDockerImage.dockerServerAvailable=false; localDockerImage.nextEvidenceAction=Start Docker Desktop/daemon for local smoke, or use ACR import/VPC runner without relying on this machine's Docker daemon.; acr.purchaseCandidate.edition=ACR Enterprise Economic; acr.purchaseCandidate.region=cn-hangzhou; acr.purchaseCandidate.duration=1 month; acr.purchaseCandidate.quotedAmount=CNY 117.00; acr.purchaseCandidate.confirmed=true; acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=false; acr.purchaseCandidate.evidence=chrome_acr_2026-06-26T11:33_CST_instance_meiye-huajing-app-api_cri-imlf4amccfw6m6sa_running_economic_cn-hangzhou_expires_2026-07-27_namespace_meiye-huajing-app-api_normal_repo_meiye-huajing-app-api_private_local_repo_created; chrome_acr_repo_detail_2026-06-26T12:40_CST_public_address_requires_access_control_network_entrance_vpc_registry_host_visible; user_confirmed_acr_paid_success_2026-06-26T21:18_CST; user_confirmed_acr_paid_success_2026-06-27T00:36_CST; acr.publicNetworkEntranceEnabled=false; acr.pushNetworkPlan.selectedPath=pending_choose_vpc_registry_or_enable_public_network_entrance; acr.pushNetworkPlan.selectedReady=false; acr.pushNetworkPlan.recommendedPathIds=vpc_registry_from_aliyun_network,acr_import_task; acr.execution.canStartP04AfterActionTimeConfirmation=true; acr.execution.p04StrictReady=false; acr.execution.selectedTransferPathReady=false; acr.execution.localPublicPushReady=false; acr.execution.dockerDaemonReady=false; acr.execution.recommendedTransferPathIds=vpc_registry_from_aliyun_network,acr_import_task; acr.execution.forbiddenTransferPathIds=public_registry; acr.execution.nextOperatorDecision=choose_vpc_registry_from_aliyun_network_or_acr_import_task; runtime.target=SAE; runtime.appName=meiye-huajing-app-api-production-cn; runtime.remoteImageConfigured=false; runtime.imagePullConfigured=false; observedResourceStatus=acr_repository_confirmed_image_push_pending; observedResourceReadiness=partial
- verifyCommands: corepack pnpm aliyun:image:plan; corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:docker:build; corepack pnpm aliyun:container:smoke

### R03_API_DOMAIN_HTTPS api-cn.ipgongchang.xin DNS、HTTPS 和 ICP 证据

- status: blocked
- provider: Aliyun DNS / Certificate / SAE ingress
- consolePath: 阿里云控制台 -> 云解析 DNS / 数字证书管理服务 / SAE 或 SLB/网关 / CDN 或 OSS 域名
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps
- actionTimeConfirmationRequired: true
- observedResourceStatus: domain_visible_records_missing / blocked
- blockers: APP_API_BASE_URL:dns_special_use_wildcard_ip, APP_API_BASE_URL:https_not_ready:ECONNRESET, NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip, NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET, APP_ASSET_BASE_URL:dns_special_use_wildcard_ip, APP_ASSET_BASE_URL:https_not_ready:ECONNRESET, apiDomainHttps:confirmed, apiDomainHttps:dnsResolvedToAliyun, apiDomainHttps:httpsEnabled, apiDomainHttps:icpReady, assetDomainHttps:confirmed, assetDomainHttps:dnsResolvedToAliyun, assetDomainHttps:httpsEnabled, assetDomainHttps:icpReady
- currentEvidence: chrome_dns_console_2026-06-25T19:47_CST_ipgongchang_xin_exact_search_api-cn_no_data_total_0_existing_api_A_106.14.241.129_no_sae_endpoint_no_https_icp_ready; domainHttpsPlan.ready=false; domainHttpsPlan.apiDomainHttps.selectedMode=pending_sae_runtime_public_endpoint; domainHttpsPlan.apiDomainHttps.targetHost=api-cn.ipgongchang.xin; domainHttpsPlan.apiDomainHttps.ready=false; domainHttpsPlan.apiDomainHttps.blockers=apiDomainHttps.confirmed,apiDomainHttps.dnsResolvedToAliyun,apiDomainHttps.httpsEnabled,apiDomainHttps.icpReady; domainHttpsPlan.apiDomainHttps.recommendedModeIds=api_sae_custom_domain; domainHttpsPlan.apiDomainHttps.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps; domainHttpsPlan.apiDomainHttps.candidateIds=api_sae_custom_domain; observedResourceStatus=domain_visible_records_missing; observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:domain:check; corepack pnpm aliyun:domain:strict; corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin

### R04_ASSET_DOMAIN_HTTPS assets-cn.ipgongchang.xin DNS、HTTPS 和 ICP 证据

- status: blocked
- provider: Aliyun DNS / Certificate / OSS or CDN
- consolePath: 阿里云控制台 -> 云解析 DNS / 数字证书管理服务 / SAE 或 SLB/网关 / CDN 或 OSS 域名
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps
- actionTimeConfirmationRequired: true
- observedResourceStatus: domain_visible_records_missing / blocked
- blockers: APP_API_BASE_URL:dns_special_use_wildcard_ip, APP_API_BASE_URL:https_not_ready:ECONNRESET, NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip, NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET, APP_ASSET_BASE_URL:dns_special_use_wildcard_ip, APP_ASSET_BASE_URL:https_not_ready:ECONNRESET, apiDomainHttps:confirmed, apiDomainHttps:dnsResolvedToAliyun, apiDomainHttps:httpsEnabled, apiDomainHttps:icpReady, assetDomainHttps:confirmed, assetDomainHttps:dnsResolvedToAliyun, assetDomainHttps:httpsEnabled, assetDomainHttps:icpReady
- currentEvidence: chrome_dns_console_2026-06-25T19:47_CST_ipgongchang_xin_exact_search_assets-cn_no_data_total_0_no_cdn_or_oss_custom_domain_no_https_icp_ready; domainHttpsPlan.ready=false; domainHttpsPlan.assetDomainHttps.selectedMode=pending_choose_cdn_or_oss_custom_domain; domainHttpsPlan.assetDomainHttps.targetHost=assets-cn.ipgongchang.xin; domainHttpsPlan.assetDomainHttps.ready=false; domainHttpsPlan.assetDomainHttps.blockers=assetDomainHttps.confirmed,assetDomainHttps.dnsResolvedToAliyun,assetDomainHttps.httpsEnabled,assetDomainHttps.icpReady; domainHttpsPlan.assetDomainHttps.recommendedModeIds=asset_cdn_custom_domain; domainHttpsPlan.assetDomainHttps.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps; domainHttpsPlan.assetDomainHttps.candidateIds=asset_cdn_custom_domain,asset_oss_custom_domain; observedResourceStatus=domain_visible_records_missing; observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:domain:check; corepack pnpm aliyun:domain:strict; corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin

### R05_OSS_AUDIO_STORAGE 服务记录音频 OSS、CORS 和 RAM 最小权限

- status: pending_cloud
- provider: Aliyun OSS / RAM
- consolePath: 阿里云控制台 -> OSS Bucket / RAM 访问控制
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
- actionTimeConfirmationRequired: false
- observedResourceStatus: bucket_visible_unconfirmed / partial
- blockers: oss:confirmed, oss:ramLeastPrivilege
- currentEvidence: chrome_oss_bucket_2026-06-27T00:17_CST_bucket_exists_cn-hangzhou_private_acl_standard_storage_zero_files_external_endpoint_oss-cn-hangzhou_internal_endpoint_oss-cn-hangzhou-internal_zero_files_ram_sts_not_confirmed_cors_not_reverified_on_overview; oss.accessPlan.selectedMode=pending_choose_sae_runtime_role_or_sts; oss.accessPlan.selectedReady=false; oss.accessPlan.selectedBlockers=oss.confirmed,oss.ramLeastPrivilege; oss.accessPlan.recommendedModeIds=sae_runtime_role,sts_assume_role; oss.accessPlan.policyFile=deploy/aliyun-production-cn.oss-ram-policy.json; oss.accessPlan.policyName=MeiyeHuajingServiceRecordsOssPolicy; oss.accessPlan.allowedActions=oss:GetObject,oss:PutObject,oss:PostObject; oss.accessPlan.resourceScope=acs:oss:*:*:meiye-huajing-service-records-production-cn/service-records/production-cn/*; oss.runtimePrefixContract.requiredEnvName=SERVICE_RECORD_OSS_PREFIX; oss.runtimePrefixContract.expectedValue=service-records/production-cn; oss.runtimePrefixContract.policyScopeCoversExpectedPrefix=true; oss.runtimePrefixContract.currentConfirmationPrefixReady=true; oss.accessPlan.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; oss.execution.canStartP05AfterActionTimeConfirmation=true; oss.execution.resourceReadyForP05=true; oss.execution.accessGrantReady=false; oss.execution.preferredModeId=sae_runtime_role; oss.execution.preferredModeAvoidsLongLivedSecret=true; oss.execution.fallbackSecretModeIds=sts_assume_role,least_privilege_ram_user_secret_env; oss.execution.fallbackSecretEnvNames=ALIYUN_OSS_ACCESS_KEY_ID,ALIYUN_OSS_ACCESS_KEY_SECRET,ALIYUN_OSS_SECURITY_TOKEN; oss.execution.nextOperatorDecision=choose_sae_runtime_role_or_sts_then_bind_least_privilege_policy; observedResourceStatus=bucket_visible_unconfirmed; observedResourceReadiness=partial
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke; corepack pnpm aliyun:app-api:smoke; postdeploy service-records upload smoke after API deployment

### R06_ENV_IMPORT SAE/KMS/Secrets Manager 环境变量导入

- status: blocked
- provider: Aliyun SAE / KMS / Secrets Manager
- consolePath: 阿里云 SAE 环境变量 / KMS / Secrets Manager
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport; 阿里云 SAE 环境变量 / KMS / Secrets Manager
- actionTimeConfirmationRequired: true
- observedResourceStatus: cloudshell_disconnected_restart_confirmation_required / blocked
- blockers: missing_required_env:DATABASE_URL_CN, envImport:confirmed, envImport:secretNotInImage, envImport:placeholder:importedAt, envImport:placeholder:evidence
- currentEvidence: pending_aliyun_env_import_confirmation; envImportPlan.ready=false; envImportPlan.selectedMode=pending_secret_env_import_after_resource_dependencies; envImportPlan.importTarget=SAE; envImportPlan.secretEnvStore=KMS/SecretsManager/SAE secret env; envImportPlan.blockedCredentialNames=DATABASE_URL_CN; envImportPlan.readySecretEnvVariableCount=17; envImportPlan.readySecretEnvVariableGroupCount=9; envImportPlan.blockedSecretBatchIds=BLOCKED_SECRET_BATCH_01_OSS_RAM_STS,BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION; envImportPlan.readySecretBatchIds=READY_SECRET_BATCH_01_LEGACY_DATABASE_MIGRATION_SOURCE,READY_SECRET_BATCH_02_APP_AUTH,READY_SECRET_BATCH_03_ALIYUN_OSS,READY_SECRET_BATCH_04_BAILIAN_ASR,READY_SECRET_BATCH_05_DEEPSEEK_SUMMARY,READY_SECRET_BATCH_06_VOLC_SPEECH,READY_SECRET_BATCH_07_BACKEND_OPS,READY_SECRET_BATCH_08_LEGACY_CONTENT_PROVIDER,READY_SECRET_BATCH_09_MINI_PROGRAM_COMPAT; envImportPlan.importBatchCount=11; envImportPlan.recommendedModeIds=blocked_rds_database_url_secret,blocked_oss_ram_sts_secret_env,ready_backend_secret_env_batches; envImportPlan.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport; envImportPlan.candidateIds=blocked_rds_database_url_secret,blocked_oss_ram_sts_secret_env,ready_backend_secret_env_batches; observedResourceStatus=cloudshell_disconnected_restart_confirmation_required; observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:env:handoff:backend; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:env:check; corepack pnpm aliyun:readiness:strict

### R07_SLS_ALERTS SLS 日志、/api/healthz 和 5xx 告警

- status: pending_cloud
- provider: Aliyun SLS / Application monitoring
- consolePath: 阿里云控制台 -> 日志服务 SLS / 应用监控告警
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts
- actionTimeConfirmationRequired: false
- observedResourceStatus: project_logstore_visible_alerts_pending / partial
- blockers: slsAlerts:confirmed, slsAlerts:healthAlertConfigured, slsAlerts:serverErrorAlertConfigured
- currentEvidence: chrome_sls_2026-06-25T19:47_CST_project_meiye-huajing-app-prod-cn_logstore_app-api_visible_logstore_empty_index_not_enabled_health_5xx_alerts_not_configured; runtimeSlsPlan.ready=false; runtimeSlsPlan.slsAlerts.selectedMode=pending_bind_sae_logs_and_alerts; runtimeSlsPlan.slsAlerts.targetProject=meiye-huajing-app-prod-cn; runtimeSlsPlan.slsAlerts.targetLogstore=app-api; runtimeSlsPlan.slsAlerts.ready=false; runtimeSlsPlan.slsAlerts.blockers=slsAlerts.confirmed,slsAlerts.healthAlertConfigured,slsAlerts.serverErrorAlertConfigured; runtimeSlsPlan.slsAlerts.recommendedModeIds=sls_health_5xx_alerts; runtimeSlsPlan.slsAlerts.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts; runtimeSlsPlan.slsAlerts.candidateIds=sls_health_5xx_alerts; observedResourceStatus=project_logstore_visible_alerts_pending; observedResourceReadiness=partial
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin; corepack pnpm aliyun:cloud:check

## 安全边界

- 本命令不创建阿里云资源、不付款、不修改 DNS、不导入环境变量、不推送镜像、不部署。
- 本命令只输出资源名、字段名、控制台路径、证据编号和变量名，不输出任何密钥 value。
- 不要把 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie 或 Supabase service role key 写入 git。
