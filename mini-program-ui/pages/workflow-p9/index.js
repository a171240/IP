const { createWorkflowStepPage } = require("../../utils/workflow-step-page")

Page(
  createWorkflowStepPage({
    stepId: "P9",
    pageTitle: "P9 口语化优化",
    pageSubtitle: "内容生产 · 去AI味 + 保连贯",
    outputTitle: "口语化优化终稿",
    inputPlaceholder:
      "粘贴 P8 的脚本初稿；或点「导入上一步」自动导入。\n\n可选补充：\n- 你希望更像什么风格（更口语/更犀利/更温柔）\n- 需要保留的金句/关键词",
    requiredDeps: ["P8"],
    optionalDeps: ["P1", "P4", "P6", "P10"],
    nextStepId: "P10",
    importFromStepId: "P8",
  })
)

