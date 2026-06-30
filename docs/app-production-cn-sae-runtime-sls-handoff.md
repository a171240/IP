# P08 SAE Runtime and SLS Handoff

- Scope: backend_aliyun_only
- Authorization packet: P08_SAE_RUNTIME_SLS
- Runtime target: SAE cn-hangzhou meiye-huajing-app-api-production-cn
- Container: custom-container port 3000 health /api/healthz
- Runtime confirmed: false
- SLS alerts confirmed: false
- Dependency gates ready: false
- Can configure runtime now: false
- Blocked credentials: DATABASE_URL_CN
- Ready secret env variable count: 17

## Dependency Gates
- RDS_POSTGRES_MIGRATION: ready=false; auth=P11_ALIYUN_RDS_DATA_MIGRATION; evidence=corepack pnpm aliyun:rds:migration:evidence:strict
- ACR_IMAGE_DIGEST_AND_PULL: ready=false; auth=P04_ACR_IMAGE_AND_PULL; evidence=corepack pnpm aliyun:image:plan:strict
- OSS_RUNTIME_ACCESS: ready=false; auth=P05_OSS_RAM_STS; evidence=corepack pnpm aliyun:cloud:confirmations:backend:strict
- BACKEND_ENV_IMPORT: ready=false; auth=P06_ENV_IMPORT; evidence=corepack pnpm aliyun:sensitive:blockers:backend

## Runtime Writeback
- items.runtime.provider=SAE
- items.runtime.region=cn-hangzhou
- items.runtime.appName=meiye-huajing-app-api-production-cn
- items.runtime.containerPort=3000
- items.runtime.healthPath=/api/healthz
- items.runtime.acrImage=<ACR remote image reference>
- items.runtime.imageDigest=<sha256 digest evidence handle>
- items.runtime.imagePullConfigured=true
- items.runtime.publicEndpoint=<SAE public endpoint or ingress evidence handle>
- items.runtime.runtimeRoleName=<SAE runtime role or service-linked identity name>
- items.runtime.envSecretSource=SAE/KMS/SecretsManager secret env
- items.runtime.logProject=meiye-huajing-app-prod-cn
- items.runtime.logstore=app-api
- items.runtime.confirmed=true
- items.runtime.evidence=<non-secret SAE runtime evidence handle>

## SLS Writeback
- items.slsAlerts.confirmed=true
- items.slsAlerts.slsProject=meiye-huajing-app-prod-cn
- items.slsAlerts.region=cn-hangzhou
- items.slsAlerts.logstore=app-api
- items.slsAlerts.healthAlertName=<health alert rule name>
- items.slsAlerts.serverErrorAlertName=<5xx alert rule name>
- items.slsAlerts.requestLogQuery=<non-secret query name or saved-search evidence handle>
- items.slsAlerts.dashboardName=<dashboard name or evidence handle>
- items.slsAlerts.notificationChannel=<non-secret contact group or channel evidence handle>
- items.slsAlerts.healthAlertConfigured=true
- items.slsAlerts.serverErrorAlertConfigured=true
- items.slsAlerts.evidence=<non-secret SLS alert evidence handle>

## Verification
- corepack pnpm aliyun:runtime:plan
- corepack pnpm aliyun:image:plan:strict
- corepack pnpm aliyun:cloud:confirmations:backend:strict
- corepack pnpm aliyun:rds:migration:evidence:strict
- corepack pnpm aliyun:rds:runtime-smoke:strict
- corepack pnpm aliyun:oss:runtime-access:strict
- corepack pnpm aliyun:sensitive:blockers:backend
- corepack pnpm aliyun:backend-cn:status

## Safety Boundary
- This command is local and value-free; it does not call Aliyun APIs, create SAE, configure SLS, import env, mutate DNS, push images, or deploy.
- This command must stay background-only; it does not switch browser pages, click console UI, or foreground any browser tab.
- Do not mark runtime ready until ACR digest/pull, RDS migration, OSS runtime access, secret env import, health check, and SLS alerts have non-secret evidence.
- Never store registry password, AccessKeySecret, RAM Secret, STS token, DATABASE_URL_CN value, database password, webhook token, AppSecret, cookies, or Supabase service role key.
