import { notFound } from "next/navigation"
import { use } from "react"

import WorkflowStepClient from "./WorkflowStepClient"
import { getWorkflowStepConfig } from "@/lib/workflow/steps.server"

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default function StepExecutionPage({ params }: { params: Promise<{ stepId: string }> }) {
  const { stepId: rawStepId } = use(params)
  const stepId = safeDecodeURIComponent(rawStepId)
  const step = getWorkflowStepConfig(stepId)

  if (!step) notFound()

  return <WorkflowStepClient stepId={stepId} step={step} />
}
