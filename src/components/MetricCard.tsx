import type { ScenarioResult } from '../types'
import { formatCurrency, formatMonthYear, formatRunway } from '../lib/formatters'

interface Props {
  result: ScenarioResult
  visible: boolean
}

export function MetricCard({ result, visible }: Props) {
  const { config, runwayMonths, runoutDate, data, totalCapitalDeployed } = result
  const netBurn = data[0].netBurn

  return (
    <div
      className="bg-slate-800 rounded-xl overflow-hidden flex flex-col transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0.35 }}
    >
      <div className="h-2" style={{ backgroundColor: config.color }} />
      <div className="p-5 flex flex-col gap-3 flex-1">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">{config.label}</p>

        <div>
          <p className="text-white text-2xl font-bold leading-tight">
            {formatRunway(runwayMonths, runoutDate)}
          </p>
          {runoutDate ? (
            <p className="text-slate-400 text-sm mt-0.5">
              Runs out <span className="text-slate-200">{formatMonthYear(runoutDate)}</span>
            </p>
          ) : (
            <p className="text-slate-400 text-sm mt-0.5">Revenue exceeds burn</p>
          )}
        </div>

        <div className="border-t border-slate-700 pt-3 flex flex-col gap-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Net burn/mo</span>
            <span className={netBurn > 0 ? 'text-red-400' : 'text-green-400'}>
              {netBurn > 0 ? '-' : '+'}{formatCurrency(Math.abs(netBurn))}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Capital deployed</span>
            <span className="text-slate-200">{formatCurrency(totalCapitalDeployed)}</span>
          </div>
          {data[0].revenue > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Revenue growth</span>
              <span className="text-slate-200">
                {config.revenueGrowthRate === 0
                  ? 'Flat'
                  : `+${(config.revenueGrowthRate * 100).toFixed(0)}%/mo`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
