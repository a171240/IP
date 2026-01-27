'use client'

import { DIMENSIONS } from '@/lib/diagnosis/scoring'
import { Dimension } from '@/lib/diagnosis/questions'
import { AIReport } from '@/lib/diagnosis/ai-prompt'

interface PDFContentProps {
  result: {
    total: number
    level: 'excellent' | 'good' | 'pass' | 'needs_improvement'
    levelLabel: string
    dimensions: Record<Dimension, {
      score: number
      maxScore: number
      status: 'strong' | 'normal' | 'weak'
      insight: string
    }>
    insights: unknown[]
  }
  industry: string
  createdAt: string
  aiReport?: AIReport | null
}

// PDF 专用组件 - 使用简单的 RGB 颜色避免 oklab 兼容问题
export function PDFContent({ result, industry, createdAt, aiReport }: PDFContentProps) {
  const levelColors: Record<string, string> = {
    excellent: '#10b981',
    good: '#3b82f6',
    pass: '#eab308',
    needs_improvement: '#ef4444'
  }

  const dimensionColors: Record<string, string> = {
    positioning: '#0ea5e9',
    content: '#f59e0b',
    emotion: '#ec4899',
    monetization: '#10b981',
    operation: '#8b5cf6'
  }

  const severityColors = {
    high: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
    medium: { bg: '#fefce8', border: '#fef08a', text: '#ca8a04' },
    low: { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb' }
  }

  return (
    <div
      id="pdf-content"
      style={{
        width: '210mm',
        minHeight: '297mm',
        margin: '0 auto',
        padding: '20mm',
        backgroundColor: '#ffffff',
        color: '#18181b',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxSizing: 'border-box'
      }}
    >
      {/* 标题 */}
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', margin: '0 0 8px 0' }}>
          IP内容健康诊断报告
        </h1>
        <p style={{ fontSize: '14px', color: '#71717a', margin: 0 }}>
          生成于 {new Date(createdAt).toLocaleDateString('zh-CN')}
          {industry && ` · ${industry}行业`}
        </p>
      </div>

      {/* 总分 */}
      <div style={{
        textAlign: 'center',
        padding: '30px',
        marginBottom: '30px',
        border: '1px solid #e4e4e7',
        borderRadius: '12px'
      }}>
        <div style={{
          fontSize: '64px',
          fontWeight: 'bold',
          color: '#10b981',
          marginBottom: '8px'
        }}>
          {result.total}
        </div>
        <div style={{ fontSize: '18px', color: '#52525b', marginBottom: '12px' }}>
          综合健康度评分
        </div>
        <div style={{
          display: 'inline-block',
          padding: '6px 16px',
          borderRadius: '20px',
          backgroundColor: levelColors[result.level] + '20',
          color: levelColors[result.level],
          fontSize: '14px',
          fontWeight: '500'
        }}>
          {result.levelLabel}
        </div>
      </div>

      {/* AI 深度分析 */}
      {aiReport && (
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#7c3aed' }}>
            AI 深度分析
          </h2>

          {/* 总结 */}
          <div style={{
            padding: '16px',
            marginBottom: '16px',
            backgroundColor: '#f5f3ff',
            border: '1px solid #ddd6fe',
            borderRadius: '8px'
          }}>
            <p style={{ fontSize: '15px', fontWeight: '500', color: '#5b21b6', margin: 0 }}>
              {aiReport.summary}
            </p>
          </div>

          {/* 洞察 */}
          {aiReport.insights.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: '#18181b' }}>
                深度洞察
              </h3>
              {aiReport.insights.map((insight, index) => {
                const colors = severityColors[insight.severity] || severityColors.medium
                return (
                  <div
                    key={index}
                    style={{
                      padding: '12px',
                      marginBottom: '8px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '6px'
                    }}
                  >
                    <h4 style={{ fontWeight: '600', marginBottom: '4px', color: colors.text, fontSize: '14px', margin: '0 0 4px 0' }}>
                      {insight.title}
                    </h4>
                    <p style={{ fontSize: '13px', color: '#52525b', margin: 0, lineHeight: '1.5' }}>
                      {insight.content}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {/* 建议 */}
          {aiReport.recommendations.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: '#18181b' }}>
                行动建议
              </h3>
              {aiReport.recommendations.sort((a, b) => a.priority - b.priority).map((rec, index) => (
                <div
                  key={index}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#3b82f6',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '8px'
                    }}>
                      {index + 1}
                    </span>
                    <h4 style={{ fontWeight: '600', fontSize: '14px', margin: 0 }}>
                      {rec.title}
                    </h4>
                  </div>
                  <p style={{ fontSize: '13px', color: '#52525b', margin: 0, paddingLeft: '28px', lineHeight: '1.5' }}>
                    {rec.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* 推荐工作流 */}
          {aiReport.workflowSteps.length > 0 && (
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: '#18181b' }}>
                推荐工作流
              </h3>
              {aiReport.workflowSteps.sort((a, b) => a.priority - b.priority).map((step, index) => (
                <div
                  key={step.stepId}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    backgroundColor: '#faf5ff',
                    border: '1px solid #e9d5ff',
                    borderRadius: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: '#7c3aed',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      marginRight: '8px'
                    }}>
                      {step.stepId}
                    </span>
                    <h4 style={{ fontWeight: '600', fontSize: '14px', margin: 0 }}>
                      {step.title}
                    </h4>
                    {index === 0 && (
                      <span style={{
                        marginLeft: '8px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#dcfce7',
                        color: '#16a34a',
                        fontSize: '10px',
                        fontWeight: '500'
                      }}>
                        推荐优先
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '13px', color: '#52525b', margin: 0, lineHeight: '1.5' }}>
                    {step.reason}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 五维详情 */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
          五维能力分析
        </h2>
        {Object.entries(result.dimensions).map(([key, dim]) => (
          <div
            key={key}
            style={{
              padding: '16px',
              marginBottom: '12px',
              border: '1px solid #e4e4e7',
              borderRadius: '8px'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <div>
                <span style={{ fontWeight: '600' }}>
                  {DIMENSIONS[key as Dimension]?.name || key}
                </span>
                <span style={{
                  marginLeft: '8px',
                  fontSize: '12px',
                  color: dim.status === 'strong' ? '#10b981' :
                         dim.status === 'weak' ? '#ef4444' : '#eab308'
                }}>
                  {dim.status === 'strong' ? '优势' :
                   dim.status === 'weak' ? '待改进' : '正常'}
                </span>
              </div>
              <span style={{ fontWeight: 'bold', fontSize: '18px' }}>
                {dim.score}/10
              </span>
            </div>
            <div style={{
              height: '8px',
              backgroundColor: '#e4e4e7',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '8px'
            }}>
              <div style={{
                height: '100%',
                width: `${(dim.score / dim.maxScore) * 100}%`,
                backgroundColor: dimensionColors[key] || '#6b7280',
                borderRadius: '4px'
              }} />
            </div>
            <p style={{ fontSize: '13px', color: '#52525b', margin: 0 }}>
              {dim.insight}
            </p>
          </div>
        ))}
      </div>

      {/* 改进建议（仅在没有AI报告时显示） */}
      {!aiReport && result.insights.length > 0 && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            重点改进建议
          </h2>
          {result.insights.map((insight, index) => {
            const item = insight as { severity?: string; title?: string; description?: string }
            const isHigh = item.severity === 'high'
            const borderColor = isHigh ? '#fecaca' : '#fef08a'
            const bgColor = isHigh ? '#fef2f2' : '#fefce8'
            const textColor = isHigh ? '#dc2626' : '#ca8a04'
            return (
              <div
                key={index}
                style={{
                  padding: '16px',
                  marginBottom: '12px',
                  border: `1px solid ${borderColor}`,
                  backgroundColor: bgColor,
                  borderRadius: '8px'
                }}
              >
                <h3 style={{
                  fontWeight: '600',
                  marginBottom: '4px',
                  color: textColor,
                  margin: '0 0 4px 0'
                }}>
                  {item.title || '重点问题'}
                </h3>
                <p style={{ fontSize: '13px', color: '#52525b', margin: 0 }}>
                  {item.description || ''}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* 页脚 */}
      <div style={{
        marginTop: '40px',
        paddingTop: '20px',
        borderTop: '1px solid #e4e4e7',
        textAlign: 'center',
        fontSize: '12px',
        color: '#a1a1aa'
      }}>
        由 IP内容工厂 生成 · {new Date().toLocaleDateString('zh-CN')}
      </div>
    </div>
  )
}
