import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import type { ModelOutput, ScenarioKey } from '../types'
import { formatCurrency, formatMonthYear } from '../lib/formatters'

interface Props {
  output: ModelOutput
  visibleScenarios: Set<ScenarioKey>
}

interface ChartRow {
  month: number
  pessimistic?: number
  base?: number
  optimistic?: number
}

interface TooltipPayloadEntry {
  dataKey: string
  value: number
  color: string
  name: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: number
  output: ModelOutput
  visibleScenarios: Set<ScenarioKey>
}

function CustomTooltip({ active, payload, label, output, visibleScenarios }: CustomTooltipProps) {
  if (!active || !payload?.length || label === undefined) return null

  const today = new Date()
  today.setDate(1)
  const date = new Date(today)
  date.setMonth(date.getMonth() + label)

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl min-w-[160px]">
      <p className="text-slate-400 text-xs mb-2 font-medium">
        Month {label} · {formatMonthYear(date)}
      </p>
      {output.scenarios
        .filter(s => visibleScenarios.has(s.config.key))
        .map(s => {
          const entry = payload.find(p => p.dataKey === s.config.key)
          if (!entry) return null
          return (
            <div key={s.config.key} className="flex justify-between gap-4 text-xs py-0.5">
              <span style={{ color: s.config.color }} className="font-medium">
                {s.config.label}
              </span>
              <span className="text-slate-200">{formatCurrency(entry.value)}</span>
            </div>
          )
        })}
    </div>
  )
}

function buildChartData(output: ModelOutput): ChartRow[] {
  const maxMonths = Math.max(...output.scenarios.map(s => s.data.length))
  const rows: ChartRow[] = []

  for (let m = 0; m < maxMonths; m++) {
    const row: ChartRow = { month: m }
    for (const scenario of output.scenarios) {
      const point = scenario.data[m]
      if (point !== undefined && point.balance >= 0) {
        row[scenario.config.key as ScenarioKey] = point.balance
      }
    }
    rows.push(row)
  }
  return rows
}

export function RunwayChart({ output, visibleScenarios }: Props) {
  const chartData = buildChartData(output)

  return (
    <div className="bg-slate-800/60 rounded-2xl p-6">
      <div className="mb-4">
        <h2 className="text-white font-semibold text-base">Cash Runway</h2>
        <p className="text-slate-500 text-xs mt-0.5">Projected cash balance over time</p>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="month"
            stroke="#475569"
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickLine={false}
            label={{ value: 'Month', position: 'insideBottomRight', offset: -4, fill: '#475569', fontSize: 11 }}
          />
          <YAxis
            tickFormatter={formatCurrency}
            stroke="#475569"
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickLine={false}
            width={72}
          />
          <Tooltip
            content={
              <CustomTooltip
                output={output}
                visibleScenarios={visibleScenarios}
              />
            }
          />
          <ReferenceLine
            y={0}
            stroke="#ef444466"
            strokeDasharray="6 3"
            label={{ value: '$0', fill: '#ef4444', fontSize: 11, position: 'insideTopRight' }}
          />
          {output.scenarios.map(s =>
            visibleScenarios.has(s.config.key) ? (
              <Line
                key={s.config.key}
                type="monotone"
                dataKey={s.config.key}
                stroke={s.config.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls={false}
              />
            ) : null
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
