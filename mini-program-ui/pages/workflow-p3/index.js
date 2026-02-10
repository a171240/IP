const { createWorkflowStepPage } = require("../../utils/workflow-step-page")

Page(
  createWorkflowStepPage({
    stepId: "P3",
    pageTitle: "P3 情绪价值分析",
    pageSubtitle: "研究定位 · 情绪价值点全景图",
    outputTitle: "情绪价值点全景图",
    inputPlaceholder:
      "如已完成 P1/P2 可留空；或补充：\n- 目标受众最常见的困惑/焦虑\n- 你希望引发的情绪（安全感/掌控感/被理解/优越感等）\n- 你不想碰的表达边界（可选）",
    requiredDeps: ["P1", "P2"],
    optionalDeps: [],
    nextStepId: "P4",
  })
)

