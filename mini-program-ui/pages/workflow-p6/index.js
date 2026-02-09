const { createWorkflowStepPage } = require("../../utils/workflow-step-page")

Page(
  createWorkflowStepPage({
    stepId: "P6",
    pageTitle: "P6 4X4 内容规划",
    pageSubtitle: "人设构建 · 60期内容规划 + 10种呈现形式",
    outputTitle: "4X4内容运营规划",
    inputPlaceholder:
      "如已完成 P4/P5 可留空；或补充：\n- 你每周计划发几条？\n- 你擅长的呈现形式（口播/剧情/对话/测评/案例等）\n- 团队配置（你自己/有摄影/有剪辑）\n- 重点主推的项目/品类（可选）",
    requiredDeps: ["P1", "P4", "P5"],
    optionalDeps: ["P2", "P3"],
    nextStepId: "P7",
  })
)

