# APP production-cn Aliyun browser read-only evidence

Observed at: 2026-06-25T17:57:08+08:00

## Scope

- currentScope: backend_aliyun_only
- fullAppLaunchScope: deferred_after_backend_online
- canProceedWithoutWechat: true
- canDeployBackendNow: false
- observationMode: Chrome Aliyun console read-only pages
- cloudApiCalled: false
- mutationPerformed: false
- purchaseCreatedOrUpdated: false
- secretsReadOrWritten: false

## Current conclusion

微信开放平台移动应用不在当前目标内；本轮只核阿里云后端。Chrome 中的阿里云控制台可访问，但只读核验后仍不能部署后端：SAE runtime、ACR 仓库、RDS PostgreSQL、api-cn/assets-cn DNS+HTTPS、OSS RAM/STS、SAE 环境变量导入、SLS health/5xx 告警和 postdeploy smoke 都未闭环。

## Evidence summary

### Current browser recheck

- observedAt: 2026-06-25T17:57:08+08:00
- mode: Aliyun console visible DOM, read-only navigation
- SAE app list URL reached: https://saenext.console.aliyun.com/cn-hangzhou/app-list/micro?namespaceId=all
- ACR instance list URL reached: https://cr.console.aliyun.com/cn-hangzhou/instances
- RDS cn-hangzhou list URL reached: https://rdsnext.console.aliyun.com/rdsList/cn-hangzhou
- OSS bucket overview URL reached: https://oss.console.aliyun.com/bucket/oss-cn-hangzhou/meiye-huajing-service-records-production-cn/overview
- SLS profile URL reached: https://sls.console.aliyun.com/lognext/profile
- DNS ipgongchang.xin records URL reached: https://dnsnext.console.aliyun.com/authoritative/domains/ipgongchang.xin
- latestNonSecretFindings: RDS list shows "暂无符合条件的资源"; OSS bucket overview shows "meiye-huajing-service-records-production-cn / 华东1（杭州）"; SLS project list shows "meiye-huajing-app-prod-cn"; DNS records still show api A 106.14.241.129 and ip A 106.14.241.129, with no visible api-cn/assets-cn rows in the captured table.
- latestBackendMeaning: current browser evidence still supports partial OSS/SLS evidence only; it does not close RDS, ACR, SAE runtime, DNS/HTTPS/ICP, RAM/STS, env import, SLS alert, or smoke gates.

### SAE runtime

- consoleUrl: https://saenext.console.aliyun.com/overview
- latestConsoleUrl: https://saenext.console.aliyun.com/cn-hangzhou/app-list/micro?namespaceId=all
- regionVisible: 华东1（杭州）
- targetApp: meiye-huajing-app-api-production-cn
- targetAppVisible: false
- applicationCount: 0
- totalInstances: 0/2200
- observedText: 应用数 0 个；总实例/实例上限 0/2200 个；Top 10 关注的应用没有数据。
- backendMeaning: SAE production-cn runtime has not been created or confirmed.

### ACR image registry

- consoleUrl: https://cr.console.aliyun.com/cn-hangzhou/instances
- latestConsoleUrl: https://cr.console.aliyun.com/cn-hangzhou/instances
- targetRepository: meiye-huajing-app-api
- targetRepositoryVisible: false
- pageState: enterprise instance list shows create enterprise instance entry
- backendMeaning: ACR instance/namespace/repository still needs action-time confirmation before image push.

### RDS PostgreSQL

- consoleUrl: https://rdsnext.console.aliyun.com/rdsList/cn-hangzhou
- latestConsoleUrl: https://rdsnext.console.aliyun.com/rdsList/cn-hangzhou
- targetDatabaseUrlEnv: DATABASE_URL_CN
- targetProductionPostgresConfirmed: false
- visibleTargetInstance: false
- latestVisibleState: 暂无符合条件的资源
- caveat: the RDS instance list route was reachable, but the table body did not expose a production PostgreSQL instance in the readable DOM.
- backendMeaning: keep RDS PostgreSQL creation/confirmation and Supabase-to-RDS migration as required backend blockers.

### OSS audio storage

- consoleUrl: https://oss.console.aliyun.com/bucket
- latestConsoleUrl: https://oss.console.aliyun.com/bucket/oss-cn-hangzhou/meiye-huajing-service-records-production-cn/overview
- bucket: meiye-huajing-service-records-production-cn
- bucketVisible: true
- regionVisible: 华东1（杭州）
- latestVisibleState: meiye-huajing-service-records-production-cn / 华东1（杭州）
- serviceRecordPrefix: service-records/production-cn
- backendMeaning: bucket exists as partial evidence, but RAM least privilege, runtime role or STS path, and final upload smoke are not closed.

### SLS logging

- consoleUrl: https://sls.console.aliyun.com/lognext/profile
- latestConsoleUrl: https://sls.console.aliyun.com/lognext/profile
- slsProject: meiye-huajing-app-prod-cn
- slsProjectVisible: true
- latestVisibleState: meiye-huajing-app-prod-cn 美业话镜 APP production-cn API logs 华东1（杭州）
- logstorePathVisible: lognext/project/meiye-huajing-app-prod-cn/logsearch/app-api?slsRegion=cn-hangzhou
- healthAlertConfigured: false
- serverErrorAlertConfigured: false
- backendMeaning: SLS project/logstore are partial evidence; health and 5xx alerts still depend on SAE runtime.

### DNS and public domains

- consoleUrl: https://dnsnext.console.aliyun.com/authoritative/domains/ipgongchang.xin
- latestConsoleUrl: https://dnsnext.console.aliyun.com/authoritative/domains/ipgongchang.xin
- domain: ipgongchang.xin
- domainVisible: true
- recordCountVisible: 13
- existingRecords: api A 106.14.241.129; ip A 106.14.241.129
- latestVisibleRecords: api A 106.14.241.129; ip A 106.14.241.129; no visible api-cn/assets-cn rows in the captured table.
- apiCnHost: api-cn.ipgongchang.xin
- apiCnRecordVisible: false
- assetsCnHost: assets-cn.ipgongchang.xin
- assetsCnRecordVisible: false
- backendMeaning: formal production-cn APP hosts are not bound to Aliyun backend/assets entry yet.

## Backend action queue impact

- alreadyPartial: OSS bucket; SLS project/logstore
- stillRequiredNow: RDS PostgreSQL create/confirm + migration; OSS RAM/STS/runtime role; ACR enterprise instance/namespace/repository
- blockedUntilDependencies: image push and pull config; SAE runtime create; env import; DNS/HTTPS/ICP; SLS alerts; postdeploy smoke
- excludedFromThisBackendTarget: WeChat Open Platform mobile app; Android release signing; Apple Team ID; app-store launch work

## Safety boundary

This evidence was collected from visible Aliyun console pages only. It did not call Aliyun OpenAPI, reconnect CloudShell, configure CLI credentials, buy resources, create resources, change DNS, import env vars, push images, deploy production-cn, inspect cookies, read localStorage, or copy secrets.
