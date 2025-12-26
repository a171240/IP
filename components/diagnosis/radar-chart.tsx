'use client'

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer
} from 'recharts'
import { DimensionScore, DIMENSIONS } from '@/lib/diagnosis/scoring'
import { Dimension } from '@/lib/diagnosis/questions'

interface RadarChartProps {
  dimensions: Record<Dimension, DimensionScore>
}

export function DiagnosisRadarChart({ dimensions }: RadarChartProps) {
  const data = Object.entries(dimensions).map(([key, dim]) => ({
    dimension: DIMENSIONS[key as Dimension].name,
    score: dim.percentage,
    fullMark: 100
  }))

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
          <Radar
            name="得分"
            dataKey="score"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.5}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
