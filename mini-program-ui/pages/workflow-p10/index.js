const { createWorkflowStepPage } = require("../../utils/workflow-step-page")

Page(
  createWorkflowStepPage({
    stepId: "P10",
    pageTitle: "P10 迭代管理",
    pageSubtitle: "内容生产 · 版本记录 + 迭代建议",
    outputTitle: "迭代管理报告",
    inputPlaceholder:
      "粘贴 P9 的优化终稿；或点「导入上一步」自动导入。\n\n可选补充：\n- 当前版本号（v1.1/v1.2 等）\n- 本次迭代目标（提升转化/更口语/更强钩子等）\n- 你希望下次重点优化什么",
    requiredDeps: ["P9"],
    optionalDeps: ["P7", "P8"],
    nextStepId: "P7",
    importFromStepId: "P9",
  })
)

