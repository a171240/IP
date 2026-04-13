# Voice Coach 部署+真机验证 — Codex 6 线程任务

> 日期：2026-03-21
> 前置：Round 1-2 已完成，本地 E2E 延迟 P50=1696ms，全部阈值 PASS
> 目标：部署到生产环境 + 真机验证 + 修复真机上发现的问题

---

## 背景

本地测试数据已达标：

| 指标 | P50 | P90 | 阈值 | 状态 |
|------|-----|-----|------|------|
| ASR | 211ms | 383ms | 1500ms | PASS |
| LLM 首token | 1044ms | 1252ms | 1500ms | PASS |
| TTS 首音频块 | 1696ms | 1886ms | 2000ms | PASS |

但这些数据是本地 WS 服务 + 脚本模拟的结果。真机上还有以下未知因素：
- 小程序 WebSocket 连接建立时间
- 真机录音启动延迟
- InnerAudioContext 播放启动延迟
- 移动网络 RTT
- Nginx 反向代理开销

必须部署到真实环境跑通才算完成。

---

## 6 线程任务分配

```
W1: 服务端部署脚本       W4: 小程序域名白名单+联调
W2: Nginx WS 反向代理    W5: 真机录音+播放兼容性
W3: 环境变量+密钥配置     W6: 端到端验收测试脚本
```

所有 Worker 可并行，但 W4/W5/W6 需要 W1-W3 先完成部署。
建议：W1-W3 先行，W4-W6 在 W1-W3 完成后立即启动。

---

## W1：服务端部署配置（PM2 + 启动脚本）

**输出文件：**
- `voice-coach-ws/ecosystem.config.cjs`
- `voice-coach-ws/Dockerfile`（可选，如果用 Docker）
- `voice-coach-ws/scripts/deploy.sh`

**任务描述：**

A. **PM2 配置文件**
```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: "voice-coach-ws",
    script: "dist/index.js",
    cwd: "/opt/voice-coach-ws",
    instances: 1,            // WebSocket 有状态，不能多实例
    exec_mode: "fork",
    env: {
      NODE_ENV: "production",
      WS_PORT: 8080,
    },
    max_memory_restart: "512M",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    error_file: "/var/log/voice-coach-ws/error.log",
    out_file: "/var/log/voice-coach-ws/out.log",
    merge_logs: true,
    autorestart: true,
    watch: false,
  }]
}
```

B. **部署脚本 deploy.sh**
```bash
#!/bin/bash
set -e
cd /opt/voice-coach-ws
git pull origin feat/voice-coach-realtime
npm ci --production
npm run build
pm2 reload ecosystem.config.cjs
pm2 save
echo "Deployed at $(date)"
```

C. **可选 Dockerfile**
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY .env .env
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

**验收标准：**
1. `npm run build` 成功
2. `pm2 start ecosystem.config.cjs` 启动成功
3. `curl http://localhost:8080/healthz` 返回 `{"ok":true}`
4. PM2 日志正常输出，无启动错误

---

## W2：Nginx WebSocket 反向代理

**输出文件：**
- `voice-coach-ws/nginx/voice-coach-ws.conf`

**任务描述：**

需要在 Nginx 中配置 WebSocket 反向代理，让小程序通过 `wss://` 连接。

**关键配置：**
```nginx
# /etc/nginx/conf.d/voice-coach-ws.conf
# 或追加到现有的 ip.ipgongchang.xin server block

# WebSocket 升级映射
map $http_upgrade $connection_upgrade {
    default upgrade;
    ""      close;
}

# upstream
upstream voice_coach_ws {
    server 127.0.0.1:8080;
    keepalive 32;
}

# 在已有的 server { listen 443 ssl; server_name ip.ipgongchang.xin; } 中添加：
location /ws/voice-coach {
    proxy_pass http://voice_coach_ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket 超时设置（重要！）
    proxy_read_timeout 3600s;    # 1小时，WebSocket 长连接
    proxy_send_timeout 3600s;
    proxy_connect_timeout 10s;

    # 禁用缓冲（WebSocket 实时性）
    proxy_buffering off;
    proxy_cache off;

    # 限流（可选，防止单 IP 过多连接）
    # limit_conn ws_zone 5;
}

# 健康检查（可选）
location /ws-health {
    proxy_pass http://voice_coach_ws/healthz;
}
```

**注意事项：**
- 必须在现有 SSL server block 中添加，不能新建 server block（共用域名和证书）
- `proxy_read_timeout` 必须足够长，否则 WebSocket 会被 Nginx 断开
- 不要开 `proxy_buffering`，会破坏实时性

**验收标准：**
1. `nginx -t` 配置检查通过
2. `wss://ip.ipgongchang.xin/ws/voice-coach?session_id=test` 能建立连接
3. WebSocket 连接在空闲 5 分钟后不被 Nginx 断开
4. Binary 帧正确透传（不被 Nginx 修改）

---

## W3：环境变量 + 密钥配置

**输出文件：**
- `voice-coach-ws/.env.production`（模板，不含真实密钥）
- 更新 `docs/DEPLOY_BACKEND.md` 添加 voice-coach-ws ���署章节

**任务描述：**

整理生产环境需要的所有环境变量，确保不遗漏。

**必填变量清单：**
```bash
# === 服务 ===
WS_PORT=8080
NODE_ENV=production

# === Supabase（与主站共用） ===
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# === 火山引擎语音（ASR + TTS） ===
VOLC_SPEECH_APP_ID=          # 火山引擎控制台获取
VOLC_SPEECH_ACCESS_TOKEN=    # 火山引擎控制台获取

# === LLM（DeepSeek 做实时回复） ===
DEEPSEEK_API_KEY=            # https://platform.deepseek.com 获取
VOICE_COACH_REPLY_PROVIDER=deepseek
VOICE_COACH_ANALYSIS_PROVIDER=deepseek

# === 语音教练开关 ===
VOICE_COACH_ENABLED=true
VOICE_COACH_MAX_TURNS=10
```

**可选变量（有默认值）：**
```bash
VOLC_TTS_VOICE_TYPE=zh_female_vv_uranus_bigtts
VOLC_TTS_LANGUAGE=cn
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
VOICE_COACH_EARLY_REPLY_ENABLED=true
```

**验收标准：**
1. .env.production 包含所有必填变量的 key（值为占位符）
2. 主站 Supabase 密钥能在 WS 服务中复用
3. DEPLOY_BACKEND.md 更新，包含 voice-coach-ws 的完整部署步骤

---

## W4：小程序域名白名单 + WebSocket 联调

**输出文件：**
- 更新 `mini-program-ui/utils/config.js`（如需）
- 更新 `docs/DEPLOY_MINIPROGRAM_WECHAT_DEVTOOLS.md`

**任务描述：**

微信小程序要求所有 WebSocket 连接域名必须在后台白名单中配置。

**步骤：**

1. 在微信公众平台 → 开发管理 → 开发设置 → 服务器域名 中添加：
   - socket 合法域名：`wss://ip.ipgongchang.xin`

2. 确认 `mini-program-ui/utils/config.js` 中的 `API_BASE_URL` 指向正确的域名

3. 在微信开发者工具中测试：
   - 打开语音教练页面
   - 检查 WebSocket 是否能成功连接
   - 检查 session.ready 消息是否收到
   - 如果连接失败，检查控制台错误信息

**联调测试清单：**
- [ ] WebSocket 连接成功，收到 session.ready
- [ ] 发送 audio.start 后进入录音状态
- [ ] 录音帧通过 WebSocket 实时发送
- [ ] 松开录音后收到 asr.partial 和 asr.final
- [ ] 收到 llm.text_delta 流式文字
- [ ] 收到 TTS binary 帧
- [ ] 音频正常播放
- [ ] 打断功能正常
- [ ] session.end 后收到 report

**验收标准：**
1. 微信开发者工具中完整跑通一轮对话
2. 控制台无 WebSocket 连接错误
3. 录音→识别→回复→播放 全流程正常

---

## W5：真机录音 + 播放兼容性

**输出文件：**
- `mini-program-ui/pages/voice-coach/chat.js`（可能需要修改）
- `mini-program-ui/utils/audio-stream-player.js`（可能需要修改）

**任务描述：**

在真机上验证录音和播放的兼容性，修复发现的问题。

**已知风险点：**

A. **录音格式**
- 当前 RecorderManager 配置可能用 PCM 或 MP3
- 不同机型对 PCM 16kHz 的支持不一致
- 如果真机录音失败，需要 fallback 到 MP3 格式

B. **音频播放**
- `InnerAudioContext({ useWebAudioImplement: true })` 在部分机型不支持
- 当前已有 fallback（去掉 useWebAudioImplement），但需要验证
- 临时文件写入在低端机型可能较慢

C. **WebSocket Binary 帧**
- 部分微信基础库版本对 Binary 帧的支持不完整
- 需要验证 `wx.connectSocket` 发送/接收 Binary 帧正常

D. **录音权限**
- 首次使用需要授权麦克风
- 授权被拒后需要���导用户到设置页

**真机测试矩阵：**

| 测试项 | iOS 微信 | Android 微信 |
|--------|---------|-------------|
| WebSocket 连接 | | |
| 录音启动 | | |
| 录音帧发送 | | |
| ASR 识别 | | |
| LLM 流式文字显示 | | |
| TTS 音频播放 | | |
| 打断功能 | | |
| 弱网重连 | | |
| 后台切换恢复 | | |

**验收标准：**
1. iOS + Android 各至少一台真机完整跑通
2. 录音→播放无异常中断
3. 打断后能正常开始下一轮
4. 发现的问题有对应修复

---

## W6：端到端验收测试 + 延迟报告

**输出文件：**
- `docs/VOICE_COACH_PRODUCTION_VERIFICATION.md`

**任务描述：**

在生产环境（WS 服务已部署 + 小程序连真实服务）中执行完整验收。

**验收项：**

### A. 功能验收
- [ ] 场景选择 → 进入对话页
- [ ] 首轮客户开场白正常播放
- [ ] 美容师录音 → ASR 实时文字显示
- [ ] 客户回复文字流式显示
- [ ] 客户回复语音自动播放
- [ ] 播放中按录音键 → 打断 → 开始下一轮
- [ ] 连续对话 5 轮无崩溃
- [ ] 结束练习 → 报告页正常显示
- [ ] 退出重进 → 历史会话恢复

### B. 延迟验收（从日志中提取）
在服务端日志中搜索 `turn_latency`，提取真实对话的延迟数据：
```bash
grep "turn_latency" /var/log/voice-coach-ws/out.log | tail -10
```

目标：
- llmFirstTokenMs P90 ≤ 1500ms
- ttsFirstChunkMs P90 ≤ 2500ms（含网络传输）

### C. 稳定性验收
- [ ] WS 服务连续运行 30 分钟无崩溃
- [ ] 内存使用稳定（PM2 show 查看）
- [ ] 断网恢复后自动重连
- [ ] 多个用户（≥2）同时使用无冲突

### D. 降级验收
- [ ] WS 服务宕机时，小程序自动降级到 HTTP 轮询模式
- [ ] 降级后基本功能可用（延迟会高但不崩溃）

**验收标准：**
1. 功能验收全部通过
2. 延迟数据达���
3. 稳定性验收通过
4. 降级验收通过
5. 生成 VOICE_COACH_PRODUCTION_VERIFICATION.md 记录结果
