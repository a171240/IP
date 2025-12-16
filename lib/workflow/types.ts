export type WorkflowIconId =
  | "Target"
  | "BarChart3"
  | "Sparkles"
  | "BookOpen"
  | "User"
  | "Lightbulb"
  | "Layers"
  | "FileText"
  | "MessageSquare"
  | "PenTool"
  | "RefreshCw"

export interface WorkflowStepConfig {
  id: string
  title: string
  description: string
  icon: WorkflowIconId
  phase: number
  phaseName: string
  phaseColor: string
  output: string
  estimatedTime: string
  features: string[]
  initialPrompt: string
  guideQuestions: string[]
}
