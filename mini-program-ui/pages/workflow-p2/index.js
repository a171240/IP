const { createWorkflowStepPage } = require("../../utils/workflow-step-page")

Page(
  createWorkflowStepPage({
    stepId: "P2",
    pageTitle: "P2 行业认知深度",
    pageSubtitle: "研究定位 · 道法术器势框架",
    outputTitle: "行业认知深度分析报告",
    inputPlaceholder:
      "如已完成 P1 可留空；或补充：\n- 行业/细分领域\n- 主营项目/产品\n- 目标受众\n- 你更擅长输出哪类内容（道/法/术/器/势）",
    requiredDeps: ["P1"],
    optionalDeps: [],
    nextStepId: "P3",
  })
)

