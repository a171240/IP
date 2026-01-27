'use client'

import { ScoreResult, DIMENSIONS } from '@/lib/diagnosis/scoring'
import { Dimension, INDUSTRY_LABELS } from '@/lib/diagnosis/questions'

interface ReportPreviewProps {
  result: ScoreResult
  industry: string
  createdAt: Date
}

export function ReportPreview({ result, industry, createdAt }: ReportPreviewProps) {
  const industryLabel = INDUSTRY_LABELS[industry] || industry
  const MAX_TOTAL = 50
  const totalPercent = Math.max(0, Math.min(100, Math.round((result.total / MAX_TOTAL) * 100)))

  return (
    <div id="pdf-content" className="bg-white p-8 max-w-2xl mx-auto print:p-4">
      {/* 头部 */}
      <div className="border-b-2 border-primary pb-4 mb-6">
        <h1 className="text-2xl font-bold text-center">商业IP内容诊断报告</h1>
        <p className="text-center text-muted-foreground mt-2">
          生成时间：{createdAt.toLocaleDateString('zh-CN')}
        </p>
      </div>

      {/* 总分 */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-6 mb-6">
        <div className="text-center">
          <div className="text-5xl font-bold text-primary">{result.total}</div>
          <div className="text-lg text-muted-foreground mt-1">综合健康度评分</div>
          <div className="mt-2 text-sm text-muted-foreground">{result.levelLabel}</div>
        </div>

        {/* 进度条 */}
        <div className="mt-4 h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${totalPercent}%` }}
          />
        </div>
      </div>

      {/* 五维诊断详情 */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-4">五维诊断详情</h2>
        <div className="grid grid-cols-1 gap-2">
          {Object.entries(result.dimensions).map(([key, dim]) => (
            <div key={key} className="flex items-center gap-4">
              <div className="w-20 text-sm font-medium">
                {DIMENSIONS[key as Dimension].name}
              </div>
              <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    dim.status === 'strong' ? 'bg-green-500' :
                    dim.status === 'normal' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.round((dim.score / dim.maxScore) * 100)}%` }}
                />
              </div>
              <div className="w-16 text-sm text-right">
                {dim.score}/{dim.maxScore}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 诊断发现 */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-4">诊断发现</h2>
        <div className="space-y-4">
          {result.insights.map((insight, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border-l-4 ${
                insight.severity === 'high' ? 'bg-red-50 border-red-500' :
                insight.severity === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                'bg-blue-50 border-blue-500'
              }`}
            >
              <div className="font-medium">{insight.title}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {insight.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 推荐方案 */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-4">推荐方案</h2>
        <div className="space-y-3">
          {result.recommendations.slice(0, 3).map((rec, index) => (
            <div key={index} className="p-4 bg-primary/5 rounded-lg">
              <div className="font-medium">{rec}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 30天行动计划 */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-4">30天行动计划</h2>
        <div className="space-y-4">
          {result.actionPlan.map((item, index) => (
            <div key={index} className="p-4 border rounded-lg bg-white">
              <div className="font-medium">{index + 1}. {item}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 专属福利 */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-white rounded-lg p-6 mb-6">
        <h2 className="text-lg font-bold mb-4">专属福利</h2>
        <ul className="space-y-2">
          <li className="flex items-center gap-2">
            <span>✅</span>
            <span>免费体验P1-P2行业分析（价值¥99）</span>
          </li>
          <li className="flex items-center gap-2">
            <span>✅</span>
            <span>{industryLabel}行业选题参考包（10个选题）</span>
          </li>
          <li className="flex items-center gap-2">
            <span>✅</span>
            <span>1对1诊断解读（限时名额）</span>
          </li>
        </ul>
        <div className="mt-4 text-center">
          <div className="text-sm opacity-80">扫码或访问网站领取</div>
          <div className="font-bold mt-1">www.ipcontent.ai</div>
        </div>
      </div>

      {/* 页脚 */}
      <div className="text-center text-sm text-muted-foreground border-t pt-4">
        <div>IP内容工厂 · 让内容创作更高效</div>
        <div className="mt-1">www.ipcontent.ai</div>
      </div>
    </div>
  )
}
