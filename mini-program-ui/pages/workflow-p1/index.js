const { createWorkflowStepPage } = require("../../utils/workflow-step-page")

Page(
  createWorkflowStepPage({
    stepId: "P1",
    pageTitle: "P1 行业目标分析",
    pageSubtitle: "研究定位 · 输出《行业目标分析报告》",
    outputTitle: "行业目标分析报告",
    inputPlaceholder:
      "请补充：\n- 行业/细分领域\n- 主营项目/产品/服务\n- 目标受众（人群/城市/消费水平）\n- 客单价区间（可选）\n- 你的优势/差异化（可选）\n- 你希望通过内容解决用户什么问题（可选）",
    requiredDeps: [],
    optionalDeps: [],
    nextStepId: "P2",
  })
)

