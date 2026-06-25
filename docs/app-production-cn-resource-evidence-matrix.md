# 美业话镜 APP production-cn 阿里云资源矩阵

Generated: 2026-06-25T17:54:22.493Z

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
| `R02_ACR_IMAGE_REGISTRY` | pending_cloud | purchase_candidate_visible_not_purchased/blocked | P03_ACR_PURCHASE, P04_ACR_IMAGE_AND_PULL | C02_ACR_IMAGE_AND_PULL | imagePublishLocal:todo:acr.registryHost, imagePublishLocal:todo:acr.namespace, imagePublishLocal:todo:acr.remoteImage, imagePublishLocal:todo:acr.remoteDigest, imagePublishLocal:todo:acr.evidence, imagePublishLocal:acr.confirmed, imagePublishLocal:acr.imagePushed, imagePublishLocal:acr.digestVerified, imagePublishLocal:acr.remoteDigest=sha256, imagePublishLocal:runtime.confirmed, imagePublishLocal:runtime.remoteImageConfigured, imagePublishLocal:runtime.imagePullConfigured, observed:purchase_candidate_visible_not_purchased | deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime |
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
- currentEvidence: chrome_sae_app_list_2026-06-25T19:47_CST_cn-hangzhou_huadong1_hangzhou_no_instances_target_app_meiye-huajing-app-api-production-cn_not_present_runtime_not_confirmed; observedResourceStatus=not_created_or_not_confirmed; observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:runtime:plan; corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:docker:check; corepack pnpm aliyun:health:smoke

### R02_ACR_IMAGE_REGISTRY 阿里云 ACR 镜像仓库、镜像 digest 和 SAE 拉取配置

- status: pending_cloud
- provider: Aliyun ACR + SAE
- consolePath: 阿里云控制台 -> 容器镜像服务 ACR / SAE 容器运行时
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime
- actionTimeConfirmationRequired: true
- observedResourceStatus: purchase_candidate_visible_not_purchased / blocked
- blockers: imagePublishLocal:todo:acr.registryHost, imagePublishLocal:todo:acr.namespace, imagePublishLocal:todo:acr.remoteImage, imagePublishLocal:todo:acr.remoteDigest, imagePublishLocal:todo:acr.evidence, imagePublishLocal:acr.confirmed, imagePublishLocal:acr.imagePushed, imagePublishLocal:acr.digestVerified, imagePublishLocal:acr.remoteDigest=sha256, imagePublishLocal:runtime.confirmed, imagePublishLocal:runtime.remoteImageConfigured, imagePublishLocal:runtime.imagePullConfigured
- currentEvidence: imagePublish.localExists=true; imagePublish.localReady=false; image.localDigestReady=true; localDockerImage.status=ready; localDockerImage.repoDigest=meiye-huajing-app-api@sha256:494907a4f9e7342064dda55fe30e0e48dd245b6d6ae753bdbb3945f77c0f518d; acr.purchaseCandidate.edition=ACR Enterprise Economic; acr.purchaseCandidate.region=cn-hangzhou; acr.purchaseCandidate.duration=1 month; acr.purchaseCandidate.quotedAmount=CNY 117.00; acr.purchaseCandidate.confirmed=false; acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=true; acr.purchaseCandidate.evidence=chrome_acr_instances_2026-06-25T19:47_CST_enterprise_instance_list_visible_create_enterprise_instance_entry_visible_no_meiye_target_instance_or_repository_confirmed_not_purchased_action_time_confirmation_required; runtime.target=SAE; runtime.appName=meiye-huajing-app-api-production-cn; runtime.remoteImageConfigured=false; runtime.imagePullConfigured=false; observedResourceStatus=purchase_candidate_visible_not_purchased; observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:image:plan; corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:docker:build; corepack pnpm aliyun:container:smoke

### R03_API_DOMAIN_HTTPS api-cn.ipgongchang.xin DNS、HTTPS 和 ICP 证据

- status: blocked
- provider: Aliyun DNS / Certificate / SAE ingress
- consolePath: 阿里云控制台 -> 云解析 DNS / 数字证书管理服务 / SAE 或 SLB/网关 / CDN 或 OSS 域名
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps
- actionTimeConfirmationRequired: true
- observedResourceStatus: domain_visible_records_missing / blocked
- blockers: APP_API_BASE_URL:dns_special_use_wildcard_ip, APP_API_BASE_URL:https_not_ready:ECONNRESET, NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip, NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET, APP_ASSET_BASE_URL:dns_special_use_wildcard_ip, APP_ASSET_BASE_URL:https_not_ready:ECONNRESET, apiDomainHttps:confirmed, apiDomainHttps:dnsResolvedToAliyun, apiDomainHttps:httpsEnabled, apiDomainHttps:icpReady, assetDomainHttps:confirmed, assetDomainHttps:dnsResolvedToAliyun, assetDomainHttps:httpsEnabled, assetDomainHttps:icpReady
- currentEvidence: chrome_dns_console_2026-06-25T19:47_CST_ipgongchang_xin_exact_search_api-cn_no_data_total_0_existing_api_A_106.14.241.129_no_sae_endpoint_no_https_icp_ready; observedResourceStatus=domain_visible_records_missing; observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:domain:check; corepack pnpm aliyun:domain:strict; corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin

### R04_ASSET_DOMAIN_HTTPS assets-cn.ipgongchang.xin DNS、HTTPS 和 ICP 证据

- status: blocked
- provider: Aliyun DNS / Certificate / OSS or CDN
- consolePath: 阿里云控制台 -> 云解析 DNS / 数字证书管理服务 / SAE 或 SLB/网关 / CDN 或 OSS 域名
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps
- actionTimeConfirmationRequired: true
- observedResourceStatus: domain_visible_records_missing / blocked
- blockers: APP_API_BASE_URL:dns_special_use_wildcard_ip, APP_API_BASE_URL:https_not_ready:ECONNRESET, NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip, NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET, APP_ASSET_BASE_URL:dns_special_use_wildcard_ip, APP_ASSET_BASE_URL:https_not_ready:ECONNRESET, apiDomainHttps:confirmed, apiDomainHttps:dnsResolvedToAliyun, apiDomainHttps:httpsEnabled, apiDomainHttps:icpReady, assetDomainHttps:confirmed, assetDomainHttps:dnsResolvedToAliyun, assetDomainHttps:httpsEnabled, assetDomainHttps:icpReady
- currentEvidence: chrome_dns_console_2026-06-25T19:47_CST_ipgongchang_xin_exact_search_assets-cn_no_data_total_0_no_cdn_or_oss_custom_domain_no_https_icp_ready; observedResourceStatus=domain_visible_records_missing; observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:domain:check; corepack pnpm aliyun:domain:strict; corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin

### R05_OSS_AUDIO_STORAGE 服务记录音频 OSS、CORS 和 RAM 最小权限

- status: pending_cloud
- provider: Aliyun OSS / RAM
- consolePath: 阿里云控制台 -> OSS Bucket / RAM 访问控制
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
- actionTimeConfirmationRequired: false
- observedResourceStatus: bucket_visible_unconfirmed / partial
- blockers: oss:confirmed, oss:ramLeastPrivilege
- currentEvidence: chrome_oss_bucket_2026-06-25T19:47_CST_bucket_exists_meiye-huajing-service-records-production-cn_visible_oss-cn-hangzhou_overview_object_page_prefix_service-records-production-cn_ram_sts_not_confirmed; observedResourceStatus=bucket_visible_unconfirmed; observedResourceReadiness=partial
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke; corepack pnpm aliyun:app-api:smoke; postdeploy service-records upload smoke after API deployment

### R06_ENV_IMPORT SAE/KMS/Secrets Manager 环境变量导入

- status: blocked
- provider: Aliyun SAE / KMS / Secrets Manager
- consolePath: 阿里云 SAE 环境变量 / KMS / Secrets Manager
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport; 阿里云 SAE 环境变量 / KMS / Secrets Manager
- actionTimeConfirmationRequired: true
- observedResourceStatus: cloudshell_disconnected_restart_confirmation_required / blocked
- blockers: missing_required_env:DATABASE_URL_CN, envImport:confirmed, envImport:secretNotInImage, envImport:placeholder:importedAt, envImport:placeholder:evidence
- currentEvidence: pending_aliyun_env_import_confirmation; observedResourceStatus=cloudshell_disconnected_restart_confirmation_required; observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:env:handoff:backend; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:env:check; corepack pnpm aliyun:readiness:strict

### R07_SLS_ALERTS SLS 日志、/api/healthz 和 5xx 告警

- status: pending_cloud
- provider: Aliyun SLS / Application monitoring
- consolePath: 阿里云控制台 -> 日志服务 SLS / 应用监控告警
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts
- actionTimeConfirmationRequired: false
- observedResourceStatus: project_logstore_visible_alerts_pending / partial
- blockers: slsAlerts:confirmed, slsAlerts:healthAlertConfigured, slsAlerts:serverErrorAlertConfigured
- currentEvidence: chrome_sls_2026-06-25T19:47_CST_project_meiye-huajing-app-prod-cn_logstore_app-api_visible_logstore_empty_index_not_enabled_health_5xx_alerts_not_configured; observedResourceStatus=project_logstore_visible_alerts_pending; observedResourceReadiness=partial
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin; corepack pnpm aliyun:cloud:check

## 安全边界

- 本命令不创建阿里云资源、不付款、不修改 DNS、不导入环境变量、不推送镜像、不部署。
- 本命令只输出资源名、字段名、控制台路径、证据编号和变量名，不输出任何密钥 value。
- 不要把 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie 或 Supabase service role key 写入 git。
