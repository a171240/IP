"use client"

import { Question } from "@/lib/diagnosis/questions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"

interface QuizFormProps {
  question: Question
  value: string | string[] | undefined
  customIndustry?: string
  onChange: (value: string | string[]) => void
  onCustomIndustryChange?: (value: string) => void
  onNext: () => void
  onPrev: () => void
  onSubmit: () => void
  isFirst: boolean
  isLast: boolean
  isSubmitting: boolean
}

export function QuizForm({
  question,
  value,
  customIndustry,
  onChange,
  onCustomIndustryChange,
  onNext,
  onPrev,
  onSubmit,
  isFirst,
  isLast,
  isSubmitting,
}: QuizFormProps) {
  const handleSingleChange = (newValue: string) => {
    onChange(newValue)
  }

  const isIndustryQuestion = question.id === "industry"
  const isOtherSelected = value === "other"

  const handleMultipleChange = (optionValue: string, checked: boolean) => {
    const currentValues = Array.isArray(value) ? value : []
    if (checked) {
      onChange([...currentValues, optionValue])
    } else {
      onChange(currentValues.filter((v) => v !== optionValue))
    }
  }

  const isAnswered =
    question.type === "text"
      ? Boolean(String(value || "").trim())
      : question.type === "multiple"
        ? Array.isArray(value) && value.length > 0
        : isIndustryQuestion && isOtherSelected
          ? !!customIndustry?.trim()
          : !!value

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-xl">{question.question}</CardTitle>
        {question.description && <CardDescription>{question.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {question.type === "text" ? (
          <Input
            placeholder={question.placeholder || "请填写"}
            value={String(value || "")}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : null}

        {question.type === "single" && (
          <RadioGroup value={value as string} onValueChange={handleSingleChange} className="space-y-3">
            {(question.options || []).map((option) => (
              <div
                key={option.value}
                className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
              >
                <RadioGroupItem value={option.value} id={option.value} />
                <Label htmlFor={option.value} className="flex-1 cursor-pointer">
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        {isIndustryQuestion && isOtherSelected && (
          <div className="mt-4 p-4 rounded-lg border bg-accent/30">
            <Label htmlFor="custom-industry" className="text-sm font-medium">
              请填写你的行业：
            </Label>
            <Input
              id="custom-industry"
              placeholder="例如：宠物服务、法律咨询、文旅..."
              value={customIndustry || ""}
              onChange={(event) => onCustomIndustryChange?.(event.target.value)}
              className="mt-2"
            />
          </div>
        )}

        {question.type === "multiple" && (
          <div className="space-y-3">
            {(question.options || []).map((option) => {
              const isChecked = Array.isArray(value) && value.includes(option.value)
              return (
                <div
                  key={option.value}
                  className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => handleMultipleChange(option.value, !isChecked)}
                >
                  <Checkbox
                    id={option.value}
                    checked={isChecked}
                    onCheckedChange={(checked) => handleMultipleChange(option.value, checked as boolean)}
                  />
                  <Label htmlFor={option.value} className="flex-1 cursor-pointer">
                    {option.label}
                  </Label>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-between pt-6">
          <Button variant="outline" onClick={onPrev} disabled={isFirst}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            上一题
          </Button>

          {isLast ? (
            <Button onClick={onSubmit} disabled={!isAnswered || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  提交中...
                </>
              ) : (
                "提交并查看结果"
              )}
            </Button>
          ) : (
            <Button onClick={onNext} disabled={!isAnswered}>
              下一题
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
