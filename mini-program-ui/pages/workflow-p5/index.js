const { createWorkflowStepPage } = require("../../utils/workflow-step-page")

Page(
  createWorkflowStepPage({
    stepId: "P5",
    pageTitle: "P5 IP 类型定位",
    pageSubtitle: "人设构建 · 1主2副模型 + 变现路径",
    outputTitle: "IP类型定位报告",
    inputPlaceholder:
      "如已完成 P4 可留空；或补充：\n- 你更擅长：专业输出 / 娱乐互动 / 信息整合？\n- 你的表达风格（严肃/有趣/犀利/温暖）\n- 你希望的变现方式（到店/项目/课程/私域/产品）",
    requiredDeps: ["P4"],
    optionalDeps: [],
    nextStepId: "P6",
  })
)

