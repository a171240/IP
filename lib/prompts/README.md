# IP鍐呭宸ュ巶 - 鎻愮ず璇嶆ā鍧楀寲鏋舵瀯

## 馃搧 鐩綍缁撴瀯

```
lib/prompts/
鈹溾攢鈹€ README.md                    # 鏈枃浠?鈹溾攢鈹€ step-prompts.ts             # 涓婚厤缃枃浠讹紙瀵煎叆鍜屾槧灏勶級
鈹?鈹溾攢鈹€ research/                   # 鐮旂┒瀹氫綅闃舵 (Phase 1)
鈹?  鈹溾攢鈹€ p1-industry.ts         # 鉁?P1: 琛屼笟鐩爣鍒嗘瀽
鈹?  鈹溾攢鈹€ p2-cognition.ts        # 鉁?P2: 琛屼笟璁ょ煡娣卞害
鈹?  鈹溾攢鈹€ p3-emotion.ts          # 鉁?P3: 鎯呯华浠峰€煎垎鏋?鈹?  鈹斺攢鈹€ ip-biography.ts        # 鉁?IP浼犺: 娣卞害璁胯皥
鈹?鈹溾攢鈹€ persona/                    # 浜鸿鏋勫缓闃舵 (Phase 2)
鈹?  鈹溾攢鈹€ p4-concept.ts          # 鉁?P4: IP姒傚康鐢熸垚
鈹?  鈹溾攢鈹€ p5-type-positioning.ts # 鉁?P5: IP绫诲瀷瀹氫綅锛堝姩鎬佸姞杞斤級
鈹?  鈹斺攢鈹€ p6-content-director.ts # 鉁?P6: 4X4鍐呭杩愯惀瑙勫垝
鈹?鈹斺攢鈹€ content/                    # 鍐呭鐢熶骇闃舵 (Phase 3) - 闂幆鍙嶉绯荤粺
    鈹溾攢鈹€ p7-attraction.ts       # 鉁?P7: 閫夐搴撶敓鎴愶紙璇诲彇P10鍙嶉锛?    鈹溾攢鈹€ p8-rational.ts         # 鉁?P8: 鑴氭湰鍒涗綔涓績锛堣鍙朠10鍙嶉锛?    鈹溾攢鈹€ p9-product.ts          # 鉁?P9: 鍙ｈ鍖栦紭鍖栵紙璇诲彇P10鍙嶉锛?    鈹斺攢鈹€ p10-emotion.ts         # 鉁?P10: 杩唬绠＄悊锛堣緭鍑哄弽棣堟暟鎹級
```

## 馃搳 瀹屾垚鐘舵€?
### 鉁?宸插畬鎴?(11/11)
- **P1**: 琛屼笟鐩爣鍒嗘瀽甯?- 瀹屾暣鎻愮ず璇?- **P2**: 琛屼笟璁ょ煡娣卞害鍒嗘瀽鍔╂墜 - 瀹屾暣鎻愮ず璇?- **P3**: 鎯呯华浠峰€煎垎鏋愪笓瀹?- 瀹屾暣鎻愮ず璇?- **IP浼犺**: 璁拌€呭瀷鎿嶇洏鎵?- 瀹屾暣鎻愮ず璇?- **P4**: IP姒傚康鐢熸垚鍣?- 瀹屾暣鎻愮ず璇?- **P5**: IP绫诲瀷瀹氫綅 - 7澶P鐢诲竷鍒嗘瀽
- **P6**: 4X4鍐呭杩愯惀鎬荤洃 - 60鏈熻鍒?- **P7**: 閫夐搴撶敓鎴愬ぇ甯?- 鐑偣+IP鏁呬簨+琛屼笟鎯呯华锛堣鍙朠10鍙嶉锛?- **P8**: 鑴氭湰鍒涗綔涓績 - 6绉嶆櫤鑳戒綋鏁村悎锛堣鍙朠10鍙嶉锛?- **P9**: 鍙ｈ鍖栦紭鍖栧ぇ甯?- AI鍛虫娴?涓夋鏀瑰啓锛堣鍙朠10鍙嶉锛?- **P10**: 杩唬绠＄悊鍣?- 鏃ュ織+鐗堟湰+鍙嶉杈撳嚭

## 馃攧 绗笁闃舵闂幆鍙嶉绯荤粺

```
P7 閫夐搴?鈼勨攢鈹€鈹€ 宸蹭娇鐢ㄩ€夐 + 閫夐寤鸿 鈹€鈹€鈹€鈹?    鈹?                                   鈹?    鈻?                                   鈹?P8 鑴氭湰鍒涗綔 鈼勨攢鈹€ 鍒涗綔鍋忓ソ + 杩唬寤鸿 鈹€鈹€鈹€鈹€鈹€鈹?    鈹?                                   鈹?    鈻?                                   鈹?P9 鍙ｈ鍖?鈼勨攢鈹€鈹€ 甯歌闂 + 鏀瑰啓妗堜緥 鈹€鈹€鈹€鈹€鈹€鈹€鈹?    鈹?                                   鈹?    鈻?                                   鈹?P10 杩唬绠＄悊 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?    (鍙嶉鏁版嵁涓績)
```

### P10杈撳嚭鐨勫弽棣堟暟鎹?- **閫夐浣跨敤璁板綍**: 渚汸7鍙傝€冿紝鏍囪宸蹭娇鐢ㄩ€夐
- **鍒涗綔鍋忓ソ璁板綍**: 渚汸8鍙傝€冿紝浼樺寲鏅鸿兘浣撴帹鑽?- **鍙ｈ鍖栭棶棰樿褰?*: 渚汸9鍙傝€冿紝涓€у寲妫€娴?
## 馃敡 浣跨敤鏂瑰紡

### 鍚庣鑷姩鍔犺浇
鍚庣 API 璺敱浼氳嚜鍔ㄦ牴鎹?`stepId` 鍔犺浇瀵瑰簲鐨勬彁绀鸿瘝锛?
```typescript
// app/api/chat/route.ts
import { getStepPrompt } from '@/lib/prompts/step-prompts'

const prompt = getStepPrompt('P7')  // 鑷姩鍔犺浇 P7 鐨勫畬鏁存彁绀鸿瘝
```

### P8 子智能体选择（agentId）
P8 默认使用 `getStepPrompt('P8')` 加载脚本创作中心提示词。

如果前端请求体额外传入 `agentId`（例如 `deep-resonance`），后端会从 `提示词/` 目录读取该智能体的 Markdown 提示词，并在 `stepId === 'P8'` 时覆盖系统提示词，从而让模型以所选智能体的能力直接开始工作。

- 前端 UI：`app/dashboard/workflow/[stepId]/WorkflowStepClient.tsx`（P8 输入区下拉选择，并透传 `agentId`）
- 后端路由：`app/api/chat/route.ts`（读取 `agentId` 并加载提示词）
- 提示词读取：`lib/agents/prompt.server.ts`

请求示例：
```json
{ "stepId": "P8", "agentId": "deep-resonance", "messages": [ { "role": "user", "content": "..." } ] }
```

## 馃搵 姝ラ閰嶇疆娓呭崟

### Phase 1: 鐮旂┒瀹氫綅
| 姝ラ | 鏂囦欢 | 鍔熻兘 |
|------|------|------|
| P1 | `research/p1-industry.ts` | 琛屼笟鐩爣鍒嗘瀽 |
| P2 | `research/p2-cognition.ts` | 琛屼笟璁ょ煡娣卞害 |
| P3 | `research/p3-emotion.ts` | 鎯呯华浠峰€煎垎鏋?|
| IP浼犺 | `research/ip-biography.ts` | 娣卞害璁胯皥 |

### Phase 2: 浜鸿鏋勫缓
| 姝ラ | 鏂囦欢 | 鍔熻兘 |
|------|------|------|
| P4 | `persona/p4-concept.ts` | IP姒傚康鐢熸垚 |
| P5 | `persona/p5-type-positioning.ts` | IP绫诲瀷瀹氫綅锛堝姩鎬佸姞杞斤級 |
| P6 | `persona/p6-content-director.ts` | 4X4鍐呭杩愯惀瑙勫垝 |

### Phase 3: 鍐呭鐢熶骇锛堥棴鐜郴缁燂級
| 姝ラ | 鏂囦欢 | 鍔熻兘 | 渚濊禆 |
|------|------|------|------|
| P7 | `content/p7-attraction.ts` | 閫夐搴撶敓鎴?| P1,P3,P6,IP浼犺 |
| P8 | `content/p8-rational.ts` | 鑴氭湰鍒涗綔涓績 | P7 |
| P9 | `content/p9-product.ts` | 鍙ｈ鍖栦紭鍖?| P8 |
| P10 | `content/p10-emotion.ts` | 杩唬绠＄悊 | P9 |

## 馃攳 璋冭瘯鎶€宸?
### 鏌ョ湅鎻愮ず璇嶆槸鍚﹀姞杞芥垚鍔?
鍦?`app/api/chat/route.ts` 涓凡娣诲姞璋冭瘯鏃ュ織锛?
```typescript
console.log(`[Chat API] stepId: ${stepId}`)
console.log(`[Chat API] Found prompt: ${finalSystemPrompt ? 'YES' : 'NO'}`)
console.log(`[Chat API] Prompt length: ${finalSystemPrompt.length} chars`)
```

璁块棶姝ラ骞跺彂閫佹秷鎭悗锛屽湪 VSCode 缁堢鏌ョ湅鏃ュ織銆?
### 楠岃瘉瀵煎叆鏄惁姝ｇ‘

濡傛灉缂栬瘧澶辫触锛屾鏌ワ細
1. 鏂囦欢鍚嶅拰璺緞鏄惁姝ｇ‘
2. export 瀵煎嚭鏄惁鍖归厤
3. `step-prompts.ts` 鐨?import 璺緞鏄惁姝ｇ‘

## 鉁?鏋舵瀯浼樺娍

1. **妯″潡鍖栫鐞?*: 姣忎釜姝ラ鐙珛鏂囦欢锛屾槗浜庣淮鎶ゅ拰鏇存柊
2. **闂幆鍙嶉**: P10杈撳嚭鍙嶉鏁版嵁渚汸7/P8/P9璇诲彇
3. **鐗堟湰鎺у埗**: Git 鍙互杩借釜姣忎釜鎻愮ず璇嶇殑淇敼鍘嗗彶
4. **鍥㈤槦鍗忎綔**: 澶氫汉鍙互鍚屾椂缂栬緫涓嶅悓姝ラ鐨勬彁绀鸿瘝
5. **浠ｇ爜澶嶇敤**: 缁熶竴鐨勫姞杞芥満鍒讹紝渚夸簬鎵╁睍
6. **绫诲瀷瀹夊叏**: TypeScript 鎻愪緵绫诲瀷妫€鏌ュ拰鏅鸿兘鎻愮ず

---

**鏈€鍚庢洿鏂?*: 2025-12-15
**缁存姢鑰?*: Claude Code

