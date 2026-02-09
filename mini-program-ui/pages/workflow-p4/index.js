const { createWorkflowStepPage } = require("../../utils/workflow-step-page")

Page(
  createWorkflowStepPage({
    stepId: "P4",
    pageTitle: "P4 IP 概念生成",
    pageSubtitle: "人设构建 · 定位/视觉锤/语言钉",
    outputTitle: "IP概念",
    inputPlaceholder:
      "如已完成前置报告可留空；或补充：\n- 你希望给观众留下的第一印象\n- 你的独特经历/优势\n- 想被记住的一句话（可选）\n- 你希望的表达风格（专业/犀利/温暖/幽默等）",
    requiredDeps: ["P1", "P2", "P3"],
    optionalDeps: [],
    nextStepId: "P5",
  })
)

