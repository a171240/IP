# P04 ACR Image Transfer Handoff

- Scope: backend_aliyun_only
- Authorization packet: P04_ACR_IMAGE_AND_PULL
- Can start after action-time confirmation: true
- P04 strict ready: false
- Next operator decision: choose_vpc_registry_from_aliyun_network_or_acr_import_task

## Recommended Transfer Paths
- vpc_registry_from_aliyun_network: Push through ACR VPC registry from an Aliyun-network runner; commandMode=docker_push_from_vpc_reachable_aliyun_runner; remoteImage=meiye-huajing-app-api-registry-vpc.cn-hangzhou.cr.aliyuncs.com/meiye/meiye-huajing-app-api:production-cn
- acr_import_task: Use ACR import task or controlled upload/import path; commandMode=acr_import_or_controlled_upload_without_persisted_registry_secret; remoteImage=meiye-huajing-app-api-registry.cn-hangzhou.cr.aliyuncs.com/meiye/meiye-huajing-app-api:production-cn

## Forbidden Now
- public_registry: blockers=acr.publicNetworkEntranceEnabled=false

## Writeback Fields
- acr.pushNetworkPath
- acr.remoteImage
- acr.remoteDigest=sha256:<64 hex>
- acr.imagePushed=true
- acr.digestVerified=true
- acr.evidence=<non-secret evidence handle>
- runtime.remoteImageConfigured=true
- runtime.imagePullConfigured=true
- runtime.evidence=<non-secret SAE evidence handle>
- runtime.confirmed=true
- runtime.imagePullCredentialMode=<non-secret runtime pull mode>

## Verification
- corepack pnpm aliyun:image:plan:strict
- corepack pnpm aliyun:cloud:confirmations:backend:strict
- corepack pnpm aliyun:backend-cn:status

## Safety Boundary
- This command is local and value-free; it does not call Aliyun APIs, run docker login, push/import images, configure SAE, import env, or deploy.
- Do not use public_registry while acr.publicNetworkEntranceEnabled=false.
- Do not write registry username, registry password, docker login output, RAM Secret, AccessKeySecret, STS token, AppSecret, cookies, or image pull secrets into JSON, Markdown, shell history, images, or git.
- Record only the transfer path, remote image, sha256 digest, booleans, and non-secret evidence handles.
