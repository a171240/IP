import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, "..")
const defaultMiniappRoot = path.resolve(backendRoot, "..", "..", "..", "美业话镜小程序")
const miniappRoot = path.resolve(process.env.MINIAPP_REPO_ROOT || defaultMiniappRoot)
const requireFromMiniapp = createRequire(path.join(miniappRoot, "package.json"))

const beauty = requireFromMiniapp("./pages/voice-coach/beauty-training-pack")
const baibaitu = requireFromMiniapp("./pages/voice-coach/baibaitu-speaking-pack-v1")

const outDir = path.join(backendRoot, "lib", "voice-coach", "training-packs")
const generatedAt = new Date().toISOString()

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function cleanText(value) {
  return String(value || "").trim()
}

function toList(value) {
  return Array.isArray(value) ? value : []
}

function normalizeBeautyTask(task) {
  const id = cleanText(task.id)
  const day = Number(task.pathDay || task.dayIndex || 0) || 0
  return {
    id,
    task_id: id,
    order: day,
    dayIndex: day,
    day_index: day,
    pathId: task.pathId || "",
    path_id: task.pathId || "",
    pathDay: day,
    path_day: day,
    title: task.title || "",
    focus: task.focus || "",
    estimatedMinutes: Number(task.estimatedMinutes || 6) || 6,
    estimated_minutes: Number(task.estimatedMinutes || 6) || 6,
    customerName: task.customerName || "",
    customer_name: task.customerName || "",
    customerSetting: task.customerSetting || "",
    customer_setting: task.customerSetting || "",
    customerConcern: task.customerConcern || "",
    customer_concern: task.customerConcern || "",
    customer_line: task.customerConcern || "",
    customerHiddenConcern: task.customerHiddenConcern || "",
    hidden_concern: task.customerHiddenConcern || "",
    visibleGoal: task.visibleGoal || "",
    visible_goal: task.visibleGoal || "",
    whyItMatters: task.whyItMatters || "",
    why_it_matters: task.whyItMatters || "",
    stageId: task.stageId || "",
    stage_id: task.stageId || "",
    stageName: task.stageName || "",
    stage_name: task.stageName || "",
    storeAction: task.storeAction || "",
    store_action: task.storeAction || "",
    canServeScope: task.canServeScope || "",
    can_serve_scope: task.canServeScope || "",
    canServeText: task.canServeText || "",
    can_serve_text: task.canServeText || "",
    sourceCluster: toList(task.sourceCluster),
    source_cluster: toList(task.sourceCluster),
    abilityCodes: toList(task.abilityCodes),
    ability_codes: toList(task.abilityCodes),
    visualScene: task.visualScene || null,
    visual_scene: task.visualScene || null,
    lowPressureHint: task.lowPressureHint || "",
    low_pressure_hint: task.lowPressureHint || "",
    decisionQuestion: task.decisionQuestion || "",
    decision_question: task.decisionQuestion || "",
    decisionAnswer: task.decisionAnswer || "",
    decision_answer: task.decisionAnswer || "",
    decisionOptions: toList(task.decisionOptions),
    decision_options: toList(task.decisionOptions),
    decisionExplanation: task.decisionExplanation || "",
    decision_explanation: task.decisionExplanation || "",
    commonMistakes: toList(task.commonMistakes),
    common_mistakes: toList(task.commonMistakes),
    speakingSteps: toList(task.speakingSteps),
    speaking_steps: toList(task.speakingSteps),
    passGoals: toList(task.passGoals),
    pass_goals: toList(task.passGoals),
    forbiddenPhrases: toList(task.forbiddenPhrases),
    forbidden_phrases: toList(task.forbiddenPhrases),
    roleplay: task.roleplay || null,
    rubric: toList(task.rubric),
    reviewPolicy: task.reviewPolicy || null,
    review_policy: task.reviewPolicy || null,
    managerSignals: toList(task.managerSignals),
    manager_signals: toList(task.managerSignals),
    badgeTitle: task.badgeTitle || "",
    badge_title: task.badgeTitle || "",
    hiddenCustomerTitle: task.hiddenCustomerTitle || "",
    hidden_customer_title: task.hiddenCustomerTitle || "",
    goldLine: task.goldLine || "",
    gold_line: task.goldLine || "",
    easterEggTitle: task.easterEggTitle || "",
    easter_egg_title: task.easterEggTitle || "",
    training_context: {
      task_id: id,
      pack_id: beauty.BEAUTY_TRAINING_PACK_ID,
      knowledge_space_id: "common_beauty_knowledge_v1",
      training_pack_mode: "common-generic",
      title: task.title || "",
      focus: task.focus || "",
      customer_line: task.customerConcern || "",
      hidden_concern: task.customerHiddenConcern || "",
      path_day: day,
      stage_name: task.stageName || "",
      store_action: task.storeAction || "",
      decision_question: task.decisionQuestion || "",
      decision_answer: task.decisionAnswer || "",
      speaking_steps: toList(task.speakingSteps).map((item) => item && item.sampleLine).filter(Boolean),
      pass_goals: toList(task.passGoals),
      forbidden_phrases: toList(task.forbiddenPhrases),
      manager_signals: toList(task.managerSignals),
    },
  }
}

function normalizeBaibaituTask(card) {
  const id = cleanText(card.id)
  const order = Number(card.order || 0) || 0
  return {
    id,
    task_id: id,
    order,
    dayIndex: order,
    day_index: order,
    title: card.title || "",
    focus: card.professionalKernel || card.hiddenConcern || "",
    category: card.category || "",
    sourceCaseId: card.sourceCaseId || "",
    source_case_id: card.sourceCaseId || "",
    customerLine: card.customerLine || "",
    customer_line: card.customerLine || "",
    customerConcern: card.customerLine || "",
    customer_concern: card.customerLine || "",
    hiddenConcern: card.hiddenConcern || "",
    hidden_concern: card.hiddenConcern || "",
    customerHiddenConcern: card.hiddenConcern || "",
    scene: card.scene || "",
    cultureRefs: toList(card.cultureRefs),
    culture_refs: toList(card.cultureRefs),
    productRefs: toList(card.productRefs),
    product_refs: toList(card.productRefs),
    professionalKernelId: card.professionalKernelId || "",
    professional_kernel_id: card.professionalKernelId || "",
    professionalKernel: card.professionalKernel || "",
    professional_kernel: card.professionalKernel || "",
    expertLines: card.expertLines || null,
    expert_lines: card.expertLines || null,
    chunks: toList(card.chunks),
    followupQuestions: toList(card.followupQuestions),
    followup_questions: toList(card.followupQuestions),
    forbiddenPhrases: toList(card.forbiddenPhrases),
    forbidden_phrases: toList(card.forbiddenPhrases),
    passCriteria: toList(card.passCriteria),
    pass_criteria: toList(card.passCriteria),
    passGoals: toList(card.passCriteria),
    pass_goals: toList(card.passCriteria),
    managerSignals: toList(card.managerSignals),
    manager_signals: toList(card.managerSignals),
    visualScene: card.visualScene || null,
    visual_scene: card.visualScene || null,
    learningVisuals: card.learningVisuals || null,
    learning_visuals: card.learningVisuals || null,
    visualPrompt: card.visualPrompt || "",
    visual_prompt: card.visualPrompt || "",
    goldLine: card.expertLines && card.expertLines.sixSecond || "",
    gold_line: card.expertLines && card.expertLines.sixSecond || "",
    training_context: {
      task_id: id,
      pack_id: baibaitu.BAIBAITU_SPEAKING_PACK_ID,
      knowledge_space_id: baibaitu.BAIBAITU_SPEAKING_KNOWLEDGE_SPACE_ID,
      training_pack_mode: "baibaitu-speaking",
      title: card.title || "",
      category: card.category || "",
      customer_line: card.customerLine || "",
      hidden_concern: card.hiddenConcern || "",
      professional_kernel: card.professionalKernel || "",
      expert_line_6s: card.expertLines && card.expertLines.sixSecond || "",
      expert_line_20s: card.expertLines && card.expertLines.twentySecond || "",
      expert_line_60s: card.expertLines && card.expertLines.sixtySecond || "",
      speaking_chunks: toList(card.chunks).map((item) => item && item.sampleLine).filter(Boolean),
      followup_questions: toList(card.followupQuestions),
      pass_goals: toList(card.passCriteria),
      forbidden_phrases: toList(card.forbiddenPhrases),
      product_refs: toList(card.productRefs),
      culture_refs: toList(card.cultureRefs),
      visual_scene: card.visualScene || null,
      learning_visuals: card.learningVisuals || null,
    },
  }
}

function buildPackPayload(kind) {
  if (kind === "common") {
    const tasks = beauty.getBeautyTrainingTasks().map(normalizeBeautyTask)
    return {
      schema_version: "voice_coach.training_pack.v2",
      generated_at: generatedAt,
      content_version: "common-beauty-20260531-v2",
      asset_version: "common-beauty/v2",
      knowledge_space: {
        id: "common_beauty_knowledge_v1",
        code: "common_beauty",
        display_name: "通用知识库",
        type: "common_generic",
        brand_code: "meiye_huajing",
        training_pack_mode: "common-generic",
      },
      pack: {
        id: beauty.BEAUTY_TRAINING_PACK_ID,
        title: beauty.getBeautyTrainingPack().title,
        subtitle: beauty.getBeautyTrainingPack().subtitle,
        brand_code: "meiye_huajing",
        knowledge_space_id: "common_beauty_knowledge_v1",
        training_pack_mode: "common-generic",
        version: "v2",
      },
      tasks,
      validation: {
        task_count: tasks.length,
        image_count: tasks.filter((task) => task.visualScene && task.visualScene.image).length,
      },
    }
  }

  const cards = baibaitu.getBaibaituSpeakingCards()
  const tasks = cards.map(normalizeBaibaituTask)
  return {
    schema_version: "voice_coach.training_pack.v2",
    generated_at: generatedAt,
    content_version: "baibaitu-speaking-20260531-v2",
    asset_version: "baibaitu-speaking/v2",
    knowledge_space: {
      id: baibaitu.BAIBAITU_SPEAKING_KNOWLEDGE_SPACE_ID,
      code: "baibaitu",
      display_name: "白白兔企业资料库",
      type: "store_custom",
      brand_code: baibaitu.BAIBAITU_SPEAKING_BRAND_CODE,
      training_pack_mode: "baibaitu-speaking",
    },
    pack: {
      id: baibaitu.BAIBAITU_SPEAKING_PACK_ID,
      title: baibaitu.getBaibaituSpeakingPack().title,
      subtitle: baibaitu.getBaibaituSpeakingPack().subtitle,
      brand_code: baibaitu.BAIBAITU_SPEAKING_BRAND_CODE,
      knowledge_space_id: baibaitu.BAIBAITU_SPEAKING_KNOWLEDGE_SPACE_ID,
      training_pack_mode: "baibaitu-speaking",
      version: "v2",
    },
    culture_behaviors: baibaitu.getBaibaituCultureBehaviors(),
    professional_kernels: baibaitu.getBaibaituProfessionalKernels(),
    source_docs: baibaitu.getBaibaituSpeakingPack().sourceDocs || [],
    tasks,
    validation: {
      task_count: tasks.length,
      scene_image_count: tasks.filter((task) => task.visualScene && task.visualScene.image).length,
      flow_image_count: tasks.filter((task) => task.learningVisuals && task.learningVisuals.flow && task.learningVisuals.flow.image).length,
      concept_image_count: tasks.filter((task) => task.learningVisuals && task.learningVisuals.concept && task.learningVisuals.concept.image).length,
    },
  }
}

function writePayload(fileName, payload) {
  const target = path.join(outDir, fileName)
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`)
  return target
}

ensureDir(outDir)

const commonPayload = buildPackPayload("common")
const baibaituPayload = buildPackPayload("baibaitu")

const written = [
  writePayload("common-beauty-v2.json", commonPayload),
  writePayload("baibaitu-speaking-v2.json", baibaituPayload),
]

console.log(JSON.stringify({
  miniappRoot,
  outDir,
  files: written,
  commonTaskCount: commonPayload.tasks.length,
  commonImageCount: commonPayload.validation.image_count,
  baibaituTaskCount: baibaituPayload.tasks.length,
  baibaituSceneImageCount: baibaituPayload.validation.scene_image_count,
  baibaituFlowImageCount: baibaituPayload.validation.flow_image_count,
  baibaituConceptImageCount: baibaituPayload.validation.concept_image_count,
}, null, 2))
