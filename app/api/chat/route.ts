import { NextRequest } from 'next/server'
import { getStepPrompt } from '@/lib/prompts/step-prompts'
import { readPromptFile } from '@/lib/prompts/prompts.server'
import { getAgentPrompt } from '@/lib/agents/prompt.server'
import { createServerSupabaseClientForRequest } from '@/lib/supabase/server'
import { getClientIp, hashIp } from '@/lib/pricing/profile.server'
import { agentsConfig } from '@/lib/agents/config'

import {
  getCreditCostForUseWithPlanRule,
  getAgentCreditCost,
  getRequiredPlanForAgent,
  getRequiredPlanForWorkflowStep,
  isPlanSufficient,
  normalizePlan,
  PLAN_LABELS,
  type PlanId,
} from '@/lib/pricing/rules'

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getRequiredPlan(stepId: string | undefined, agentId: string | undefined, promptFile: string | undefined): PlanId {
  if (!stepId) return 'free'
  if (stepId.startsWith('agent:')) {
    const id = (agentId || stepId.slice('agent:'.length)).trim()
    return getRequiredPlanForAgent(id, promptFile)
  }
  return getRequiredPlanForWorkflowStep(stepId)
}

// 璁＄畻瀹為檯绉垎娑堣€楋紙鏅鸿兘浣撴垨宸ヤ綔娴佹楠わ級
function calculateCreditCost(opts: {
  stepId: string | undefined
  agentId: string | undefined
  mode: string | undefined
  currentPlan: PlanId
  planOk: boolean
  allowCreditsOverride: boolean
}): number {
  const { stepId, agentId, mode, currentPlan, planOk, allowCreditsOverride } = opts

  // 鏅鸿兘浣撹皟鐢細浣跨敤鏅鸿兘浣撲笓灞炵Н鍒嗚绠?
  if (stepId?.startsWith('agent:') || (agentId && !stepId?.match(/^P\d+$/))) {
    const id = agentId || (stepId?.startsWith('agent:') ? stepId.slice('agent:'.length) : '')
    if (id) {
      const agent = agentsConfig.find(a => a.id === id.trim())
      return getAgentCreditCost(agent?.tier, currentPlan)
    }
  }

  // 宸ヤ綔娴佹楠わ細浣跨敤鍘熸湁閫昏緫锛堝惈璺ㄧ骇鍊嶇巼锛?
  return getCreditCostForUseWithPlanRule({
    stepId,
    mode,
    planOk,
    allowCreditsOverride,
    currentPlan,
  })
}

function isCreditsSchemaMissing(message: string | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()

  // 鍙娴嬬湡姝ｇ殑 schema 缂哄け閿欒锛堝垪涓嶅瓨鍦ㄣ€佽〃涓嶅瓨鍦級
  // 娉ㄦ剰锛氫笉鍖呮嫭鍑芥暟涓嶅瓨鍦紝鍥犱负鍑芥暟涓嶅瓨鍦ㄦ椂鎴戜滑鏈夊鐢ㄥ鐞嗛€昏緫
  const columnTableKeywords = ['column', 'relation', 'undefined_column', 'undefined_table']
  const existKeywords = ['does not exist']
  const creditColumnKeywords = ['credits_balance', 'credits_unlimited', 'trial_granted_at']

  // 妫€鏌ユ槸鍚︽槸鍒楁垨琛ㄤ笉瀛樺湪鐨勯敊璇?
  const hasColumnTableError = columnTableKeywords.some(k => m.includes(k))
  const hasExistError = existKeywords.some(k => m.includes(k))
  const hasCreditColumn = creditColumnKeywords.some(k => m.includes(k))

  // 鍙湁褰撴槸鍒?琛ㄤ笉瀛樺湪涓旀秹鍙婄Н鍒嗙浉鍏冲垪鏃舵墠杩斿洖 true
  return hasColumnTableError && hasExistError && hasCreditColumn
}

function truncateText(input: string, maxChars: number): { text: string; truncated: boolean } {
  if (input.length <= maxChars) return { text: input, truncated: false }
  return { text: input.slice(0, maxChars), truncated: true }
}

// APIMart
const APIMART_API_KEY = process.env.APIMART_API_KEY
const APIMART_BASE_URL = process.env.APIMART_BASE_URL || 'https://api.apimart.ai/v1'
const APIMART_MODEL = process.env.APIMART_MODEL || 'gpt-4o'

// Quick-start (optional)
const APIMART_QUICK_API_KEY = process.env.APIMART_QUICK_API_KEY
const APIMART_QUICK_BASE_URL = process.env.APIMART_QUICK_BASE_URL
const APIMART_QUICK_MODEL = process.env.APIMART_QUICK_MODEL || 'kimi-k2-thinking-turbo'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return jsonError(400, '\u65e0\u6548\u7684\u8bf7\u6c42\u4f53')
    }

    const { messages, stepId, systemPrompt, mode, context, agentId, promptFile, allowCreditsOverride } = body as {
      messages?: Array<{ role: string; content: string }>
      stepId?: string
      systemPrompt?: string
      mode?: string
      context?: ChatContextPayload
      agentId?: string
      promptFile?: string
      allowCreditsOverride?: boolean
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonError(400, '\u7f3a\u5c11 messages')
    }

    const isQuickStart = typeof stepId === 'string' && stepId.startsWith('quick-')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonError(500, 'Supabase \u672a\u914d\u7f6e')
    }

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return jsonError(401, '\u8bf7\u5148\u767b\u5f55')
    }

    const requiredPlan = getRequiredPlan(stepId, agentId, promptFile)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan, credits_balance, credits_unlimited, trial_granted_at')
      .eq('id', user.id)
      .single()

    // 澶勭悊 profile 鏌ヨ閿欒
    let userProfile = profile
    if (profileError || !profile) {
      console.error('Profile error:', profileError?.message, profileError?.code, profileError?.details, 'User ID:', user.id)

      // PGRST116 = single row not found (RLS 闃绘鎴栬涓嶅瓨鍦?
      if (profileError?.code === 'PGRST116') {
        // 鐢ㄦ埛娌℃湁 profile 璁板綍锛屽皾璇曞垱寤轰竴涓?
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            nickname: user.email?.split('@')[0] || 'User',
            plan: 'free',
            credits_balance: 30, // 缁欐柊鐢ㄦ埛鍒濆绉垎
            credits_unlimited: false,
          })
          .select('plan, credits_balance, credits_unlimited, trial_granted_at')
          .single()

        if (createError) {
          console.error('Failed to create profile:', createError.message, createError.code)
          // 濡傛灉鎻掑叆涔熷け璐ワ紝鍙兘鏄?RLS 闂鎴栬€?profile 宸插瓨鍦ㄤ絾 RLS 闃绘璇诲彇
          return jsonError(500, `鏃犳硶璁块棶鐢ㄦ埛妗ｆ锛岃灏濊瘯閲嶆柊鐧诲綍銆傞敊璇? ${createError.message}`)
        }

        userProfile = newProfile
      } else if (isCreditsSchemaMissing(profileError?.message)) {
        return jsonError(
          500,
          '绉垎绯荤粺灏氭湭鍒濆鍖栵紝璇峰湪 Supabase 鎵ц `lib/supabase/schema.sql` 鍚庨噸璇曘€?
        )
      } else {
        return jsonError(500, `鑾峰彇鐢ㄦ埛淇℃伅澶辫触: ${profileError?.message || 'profile not found'}`)
      }
    }

    // 纭繚 userProfile 瀛樺湪
    if (!userProfile) {
      return jsonError(500, '鏃犳硶鑾峰彇鐢ㄦ埛妗ｆ淇℃伅')
    }

    const planOk = isPlanSufficient(userProfile.plan, requiredPlan)

    if (!planOk && !allowCreditsOverride) {
      const curPlan = normalizePlan(userProfile.plan)
      const creditCostQuote = calculateCreditCost({
        stepId,
        agentId,
        mode,
        currentPlan: curPlan,
        planOk: false,
        allowCreditsOverride: true,
      })
      const balanceQuote = Number(userProfile.credits_balance || 0)
      return jsonError(
        403,
        `鎮ㄥ綋鍓嶆槸${PLAN_LABELS[curPlan]}锛屾鍔熻兘闇€瑕?{PLAN_LABELS[requiredPlan]}銆傛垨娑堣€?{creditCostQuote}绉垎/娆,
        {
          code: 'plan_required',
          required_plan: requiredPlan,
          current_plan: curPlan,
          credit_cost: creditCostQuote,
          balance: balanceQuote,
        }
      )
    }

    const deviceId = request.headers.get('x-device-id') || ''
    const ip = getClientIp(request)
    const ipHash = ip ? hashIp(ip) : null

    let creditsBalance = Number(userProfile.credits_balance || 0)
    let creditsUnlimited = Boolean(userProfile.credits_unlimited) || normalizePlan(userProfile.plan) === 'vip'

    // First-time trial grant (device + IP throttling)
    if (!creditsUnlimited && !userProfile.trial_granted_at && creditsBalance <= 0) {
      if (!deviceId || deviceId.trim().length < 8) {
        return jsonError(400, '\u7f3a\u5c11\u8bbe\u5907\u6807\u8bc6\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5', {
          code: 'device_id_required',
        })
      }

      const { data: grantRows, error: grantError } = await supabase.rpc('grant_trial_credits', {
        p_device_id: deviceId,
        p_ip_hash: ipHash,
      })

      if (grantError) {
        console.error('grant_trial_credits RPC error:', grantError.message, grantError.code, grantError.details)
        // 濡傛灉鏄嚱鏁颁笉瀛樺湪鐨勯敊璇紝璺宠繃璇曠敤绉垎鍙戞斁锛岀户缁墽琛?
        if (grantError.message?.includes('function') && grantError.message?.includes('does not exist')) {
          console.warn('grant_trial_credits function not found, skipping trial grant')
          // 涓嶈繑鍥為敊璇紝缁х画鎵ц
        } else if (isCreditsSchemaMissing(grantError.message)) {
          return jsonError(
            500,
            '绉垎绯荤粺灏氭湭鍒濆鍖栵紝璇峰湪 Supabase 鎵ц `lib/supabase/schema.sql` 鍚庨噸璇曘€?
          )
        } else {
          return jsonError(500, '璇曠敤绉垎鍙戞斁澶辫触', { details: grantError.message })
        }
      }

      // 澶勭悊鎴愬姛鐨?grant 缁撴灉
      if (!grantError) {
        const grant = Array.isArray(grantRows) ? grantRows[0] : grantRows
        if (grant) {
          creditsBalance = Number(grant.credits_balance ?? creditsBalance)
          creditsUnlimited = Boolean(grant.credits_unlimited ?? creditsUnlimited)
        }
      }
    }

    const currentPlan = normalizePlan(userProfile.plan)
    const creditCost = calculateCreditCost({
      stepId,
      agentId,
      mode,
      currentPlan,
      planOk,
      allowCreditsOverride: Boolean(allowCreditsOverride),
    })
    let creditsRemaining = creditsBalance

    if (!creditsUnlimited) {
      const { data: consumeRows, error: consumeError } = await supabase.rpc('consume_credits', {
        p_step_id: stepId || 'unknown',
        p_amount: creditCost,
      })

      if (consumeError) {
        console.error('consume_credits RPC error:', consumeError.message, consumeError.code, consumeError.details)

        if (consumeError.message?.includes('insufficient_credits')) {
          const { data: latest } = await supabase
            .from('profiles')
            .select('credits_balance, credits_unlimited')
            .eq('id', user.id)
            .single()

          const latestBalance = Number(latest?.credits_balance ?? creditsBalance)
          return jsonError(402, `绉垎涓嶈冻锛氭湰娆￠渶娑堣€?${creditCost}锛屽綋鍓嶅墿浣?${latestBalance}銆俙, {
            code: 'insufficient_credits',
            required: creditCost,
            balance: latestBalance,
          })
        }

        // 濡傛灉 consume_credits 鍑芥暟涓嶅瓨鍦紝灏濊瘯鐩存帴鎵ｅ噺绉垎
        if (consumeError.message?.includes('function') && consumeError.message?.includes('does not exist')) {
          console.warn('consume_credits function not found, trying direct update')
          // 鐩存帴鏇存柊 profiles 琛ㄦ墸鍑忕Н鍒?
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ credits_balance: creditsBalance - creditCost })
            .eq('id', user.id)
            .gte('credits_balance', creditCost)

          if (updateError) {
            console.error('Direct credits update failed:', updateError.message)
            return jsonError(500, '绉垎鎵ｅ噺澶辫触锛岃绋嶅悗閲嶈瘯', { details: updateError.message })
          }
          creditsRemaining = creditsBalance - creditCost
        } else if (isCreditsSchemaMissing(consumeError.message)) {
          return jsonError(
            500,
            '绉垎绯荤粺灏氭湭鍒濆鍖栵紝璇峰湪 Supabase 鎵ц `lib/supabase/schema.sql` 鍚庨噸璇曘€?
          )
        } else {
          return jsonError(500, '绉垎鎵ｅ噺澶辫触', { details: consumeError.message })
        }
      } else {
        const consumed = Array.isArray(consumeRows) ? consumeRows[0] : consumeRows
        if (consumed) {
          creditsRemaining = Number(consumed.credits_balance ?? creditsRemaining)
          creditsUnlimited = Boolean(consumed.credits_unlimited ?? creditsUnlimited)
        }
      }
    }

    const apiKey = isQuickStart ? APIMART_QUICK_API_KEY || APIMART_API_KEY : APIMART_API_KEY
    const baseUrl = isQuickStart ? APIMART_QUICK_BASE_URL || APIMART_BASE_URL : APIMART_BASE_URL
    const model = isQuickStart ? APIMART_QUICK_MODEL || APIMART_MODEL : APIMART_MODEL

    if (!apiKey || apiKey === 'your-api-key-here') {
      return jsonError(
        500,
        isQuickStart
          ? '\u8bf7\u5728 .env.local \u4e2d\u914d\u7f6e APIMART_QUICK_API_KEY\uff08\u6216\u8005 APIMART_API_KEY\uff09'
          : '\u8bf7\u5728 .env.local \u4e2d\u914d\u7f6e APIMART_API_KEY'
      )
    }

    const apiMessages: Array<{ role: string; content: string }> = []

    let finalSystemPrompt: string | null = null
    if (stepId) {
      finalSystemPrompt = getStepPrompt(stepId)
    }
    // P8: allow user-selected sub-agent prompt override
    if (stepId === 'P8' && typeof agentId === 'string' && agentId.trim()) {
      const agentPrompt = getAgentPrompt(agentId.trim())
      if (agentPrompt?.prompt) {
        finalSystemPrompt =
          `\u3010P8 \u5b50\u667a\u80fd\u4f53\u9009\u62e9\u3011\u7528\u6237\u5df2\u9009\u62e9\uff1a${agentPrompt.name}\uff08${agentPrompt.id}\uff09\u3002\n` +
          `\u8bf7\u4e25\u683c\u6309\u4e0b\u65b9\u63d0\u793a\u8bcd\u6267\u884c\uff1b\u5982\u7f3a\u5c11\u9009\u9898/\u5185\u5bb9\u7c7b\u578b/\u80cc\u666f\u4fe1\u606f\uff0c\u5148\u7528\u6700\u5c11\u95ee\u9898\u8865\u9f50\u518d\u8f93\u51fa\u3002\n\n---\n\n` +
          agentPrompt.prompt
      }
    }


    // General agent calls: load prompt server-side so the client never sees the prompt text
    if ((!finalSystemPrompt || (stepId && stepId.startsWith('agent:'))) && typeof agentId === 'string' && agentId.trim()) {
      const agentPrompt = getAgentPrompt(agentId.trim())
      if (agentPrompt?.prompt) {
        finalSystemPrompt = agentPrompt.prompt
      }
    }

    

    // Allow client to run a specific prompt file under `鎻愮ず璇?` (for collection packs / sub-categories)
    if (typeof promptFile === 'string' && promptFile.trim()) {
      try {
        const { content, fileName } = await readPromptFile(promptFile.trim())
        const promptText = content.toString('utf8').trim()
        if (!promptText) {
          return jsonError(400, '\u63d0\u793a\u8bcd\u6587\u4ef6\u4e3a\u7a7a')
        }
        finalSystemPrompt = `\u3010\u63d0\u793a\u8bcd\u6587\u4ef6\u3011${fileName}

---

` + promptText
      } catch (e) {
        return jsonError(400, e instanceof Error ? e.message : '\u63d0\u793a\u8bcd\u6587\u4ef6\u8bfb\u53d6\u5931\u8d25')
      }
    }

    if (!finalSystemPrompt) {
      finalSystemPrompt = systemPrompt || null
    }

    if (finalSystemPrompt) {
      const now = new Date()
      const currentYear = now.getFullYear().toString()
      const currentDate = now.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

      const timeContext = `\u3010\u65f6\u95f4\u4fe1\u606f\u3011\u4eca\u5929\u662f ${currentDate}\uff08${currentYear}\u5e74\uff09\u3002\n\u5982\u679c\u4f60\u9700\u8981\u4f7f\u7528\u201c\u4eca\u5e74\u201d\u6216\u201c\u660e\u5e74\u201d\u7684\u8868\u8fbe\uff0c\u8bf7\u4ee5 ${currentYear} \u5e74\u4e3a\u51c6\u3002\n\n---\n\n`
      finalSystemPrompt = timeContext + finalSystemPrompt

      apiMessages.push({ role: 'system', content: finalSystemPrompt })
    }



    if (context && typeof context === 'object') {
      const reportRefs = Array.isArray(context.reports) ? context.reports : []
      const inlineReports = Array.isArray(context.inline_reports) ? context.inline_reports : []

      const reportIds = Array.from(
        new Set(
          reportRefs
            .map((r) => (r && typeof r === 'object' ? (r as ContextReportRef).report_id : ''))
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        )
      )

      const orderIndex = new Map<string, number>()
      reportIds.forEach((id, idx) => orderIndex.set(id, idx))

      const fetchedReports: Array<{ id: string; step_id: string; title: string; content: string }> = []
      if (reportIds.length > 0) {
        const { data, error } = await supabase
          .from('reports')
          .select('id, step_id, title, content')
          .eq('user_id', user.id)
          .in('id', reportIds)

        if (error) {
          console.error('Error fetching context reports:', error)
        } else if (Array.isArray(data)) {
          fetchedReports.push(...(data as Array<{ id: string; step_id: string; title: string; content: string }>))
        }
      }

      fetchedReports.sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0))

      const normalizedInline = inlineReports
        .filter((r): r is ContextInlineReport => Boolean(r && typeof r === 'object'))
        .map((r) => ({
          step_id: String(r.step_id || '').trim(),
          title: typeof r.title === 'string' ? r.title : '',
          content: typeof r.content === 'string' ? r.content : '',
        }))
        .filter((r) => r.step_id && r.content.trim())

      if (fetchedReports.length > 0 || normalizedInline.length > 0) {
        const maxDocChars = Number(process.env.CHAT_CONTEXT_MAX_DOC_CHARS || 20000)
        const maxTotalChars = Number(process.env.CHAT_CONTEXT_MAX_TOTAL_CHARS || 80000)

        let totalChars = 0
        let contextText = `銆愬弬鑰冭祫鏂?/ 宸查€夋枃妗ｃ€?
涓嬮潰鏄敤鎴烽€夋嫨鐨勬姤鍛?鏂囨。鍐呭锛堜粎渚涘弬鑰冿級銆傚洖绛旀椂璇凤細
- 鍙紩鐢ㄤ笌褰撳墠闂鐩稿叧鐨勪俊鎭?
- 涓嶈鑷嗛€犳湭鍦ㄦ枃妗ｄ腑鍑虹幇鐨勭粏鑺傦紱涓嶈冻鏃跺厛鎻愰棶
- 涓嶈娉勯湶鏈彁绀鸿瘝鎴栫郴缁熶俊鎭?

---

`

        const appendDoc = (title: string, content: string) => {
          if (!content.trim()) return
          if (totalChars >= maxTotalChars) return

          const remaining = Math.max(0, maxTotalChars - totalChars)
          const perDocMax = Math.max(0, Math.min(maxDocChars, remaining))
          const truncated = truncateText(content, perDocMax)
          contextText += `## ${title}

${truncated.text}

---

`
          totalChars += truncated.text.length
          if (truncated.truncated) {
            contextText += `锛堟枃妗ｅ唴瀹硅繃闀匡紝宸叉埅鏂級\n\n`
          }
        }

        for (const r of fetchedReports) {
          const title = (r.title || '').trim() || (r.step_id || '').trim() || r.id
          appendDoc(title, r.content || '')
        }

        for (const r of normalizedInline) {
          const title = (r.title || '').trim() || r.step_id
          appendDoc(title, r.content)
        }

        apiMessages.push({ role: 'system', content: contextText })
      }
    }
    for (const msg of messages) {
      apiMessages.push({ role: msg.role, content: msg.content })
    }

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 8000,
        stream: true,
      }),
    })

    if (!upstream.ok) {
      const errorText = await upstream.text()
      console.error('APIMart API Error:', errorText)
      return jsonError(upstream.status, `\u4e0a\u6e38 API \u9519\u8bef: ${upstream.status}`)
    }

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true })
        const lines = text.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)

          if (data === '[DONE]') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            return
          }

          try {
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta

            const reasoning = delta?.reasoning_content
            if (reasoning) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reasoning })}\n\n`))
            }

            const content = delta?.content
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
            }
          } catch {
            // ignore parse errors (partial chunks)
          }
        }
      },
    })

    return new Response(upstream.body?.pipeThrough(transformStream), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Credits-Cost': String(creditCost),
        'X-Credits-Remaining': creditsUnlimited ? 'unlimited' : String(creditsRemaining),
        'X-Credits-Unlimited': creditsUnlimited ? '1' : '0',
      },
    })
  } catch (error) {
    console.error('Chat API Error:', error)
    return jsonError(500, '\u670d\u52a1\u5668\u9519\u8bef')
  }
}






