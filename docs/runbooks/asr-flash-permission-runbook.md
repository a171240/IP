# ASR Flash 供应商工单包（权限开通）

## 1) 适用场景

- 现象：ASR Flash 调用返回 `http_status=403` 且 `api_status=45000030`
- 错误码：`asr_flash_permission_denied`
- 影响：在 `VOICE_COACH_REQUIRE_FLASH=true` 下系统会硬门禁，启动或识别流程会直接失败，不再长期 fallback 到 AUC

## 2) 引用依据（接口规范对齐）

- `recognize/flash` 的资源 ID 固定为 `volc.bigasr.auc_turbo`，且需在控制台开通该资源权限
- 请求头必须包含：
  - `X-Api-App-Key`
  - `X-Api-Access-Key`
  - `X-Api-Resource-Id`
  - `X-Api-Request-Id`
  - `X-Api-Sequence`
- 响应头读取 `X-Tt-Logid` 作为服务侧追踪号

## 3) 工单包必填字段

- `appid_last4`
- `resource_id`（固定：`volc.bigasr.auc_turbo`）
- `flash_request_id`
- `flash_logid`
- `发生时间`（`occurred_at`，ISO 时间）
- `环境`（`environment`，如 `staging` / `prod`）

## 4) 工单模板（可直接发送）

标题：开通火山 ASR Flash 资源权限（volc.bigasr.auc_turbo）

内容：

我们当前调用 Flash 识别接口（`/api/v3/auc/bigmodel/recognize/flash`）时，出现权限拒绝：

- `http_status`: 403
- `api_status`: 45000030
- `error_code`: asr_flash_permission_denied
- `appid_last4`: `<填写>`
- `resource_id`: `volc.bigasr.auc_turbo`
- `flash_request_id`: `<填写>`
- `flash_logid`: `<填写>`
- `occurred_at`: `<填写，例如 2026-02-20T19:04:18.000Z>`
- `environment`: `<staging|prod|other>`

请协助在当前应用（`appid` 尾号 `<填写 appid_last4>`）下开通资源：

- `volc.bigasr.auc_turbo`

说明：

- 我们使用的是 `recognize/flash` 一次请求直接返回结果的接口（非 submit/query 轮询）
- 请求头已按规范携带：
  - `X-Api-App-Key`
  - `X-Api-Access-Key`
  - `X-Api-Resource-Id=volc.bigasr.auc_turbo`
  - `X-Api-Request-Id=<uuid>`
  - `X-Api-Sequence=-1`
- 响应追踪号已采集：`X-Tt-Logid`

## 5) 自检命令

```bash
pnpm selfcheck:asr
```

或：

```bash
node scripts/asr_selfcheck.mjs
```

## 6) 自检输出样例

### FAIL（权限未开通）

```text
[ASR-SELFCHECK] FAIL flash_request_id=c068ab2b-acff-46f1-905a-4ad704083b97 flash_logid=202602201904184B5B1EFB3B0C5AB3E505 error_code=asr_flash_permission_denied
{"status":"FAIL","error_code":"asr_flash_permission_denied","flash_request_id":"c068ab2b-acff-46f1-905a-4ad704083b97","flash_logid":"202602201904184B5B1EFB3B0C5AB3E505","appid_last4":"8764","resource_id":"volc.bigasr.auc_turbo","occurred_at":"2026-02-20T19:04:18.000Z","environment":"unknown","http_status":403,"api_status":"45000030","api_code":null,"message":"[resource_id=volc.bigasr.auc_turbo] requested resource not granted","operation_hint":"需要在控制台开通 volc.bigasr.auc_turbo 权限"}
[ASR-HEALTH] {"check":"asr_flash_selfcheck","status":"FAIL","flash_request_id":"c068ab2b-acff-46f1-905a-4ad704083b97","flash_logid":"202602201904184B5B1EFB3B0C5AB3E505","resource_id":"volc.bigasr.auc_turbo","occurred_at":"2026-02-20T19:04:18.000Z","environment":"unknown"}
操作提示：需要在控制台开通 volc.bigasr.auc_turbo 权限
```

### PASS（已开通）

```text
[ASR-SELFCHECK] PASS flash_request_id=95f4a5b6-9b4e-4764-b267-95a9f88cf990 flash_logid=20260220120506A2E9A7647A0C129D0 error_code=none
{"status":"PASS","error_code":null,"flash_request_id":"95f4a5b6-9b4e-4764-b267-95a9f88cf990","flash_logid":"20260220120506A2E9A7647A0C129D0","appid_last4":"3A9F","resource_id":"volc.bigasr.auc_turbo","occurred_at":"2026-02-20T12:05:06.000Z","environment":"staging","http_status":200,"api_status":"20000000","api_code":"20000000","message":"Success","operation_hint":null}
[ASR-HEALTH] {"check":"asr_flash_selfcheck","status":"PASS","flash_request_id":"95f4a5b6-9b4e-4764-b267-95a9f88cf990","flash_logid":"20260220120506A2E9A7647A0C129D0","resource_id":"volc.bigasr.auc_turbo","occurred_at":"2026-02-20T12:05:06.000Z","environment":"staging"}
```

## 7) 启动门禁说明

- 当 `VOICE_COACH_REQUIRE_FLASH=true` 且 `VOICE_COACH_ASR_STARTUP_GATE` 未显式关闭时：
  - `dev/start` 会先执行 `selfcheck:asr`
  - 若 FAIL，进程直接退出并提示修复权限
  - 若 PASS，继续启动
  - 同时输出可抓取健康日志：`[ASR-STARTUP-HEALTH] {...}`
