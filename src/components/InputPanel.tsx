import type { InputState, BurnGrowthMode } from '../types'
import { InputField } from './InputField'

interface Props {
  inputs: InputState
  onChange: (partial: Partial<InputState>) => void
}

const BURN_MODES: { key: BurnGrowthMode; label: string; sub: string }[] = [
  { key: 'flat',        label: 'Stays flat',        sub: '0%/mo' },
  { key: 'slow',        label: 'Slow hiring',        sub: '+1%/mo' },
  { key: 'aggressive',  label: 'Aggressive scaling', sub: '+3%/mo' },
]

export function InputPanel({ inputs, onChange }: Props) {
  return (
    <aside className="bg-slate-800/60 rounded-2xl p-6 flex flex-col gap-6 h-fit sticky top-6">
      <div>
        <h2 className="text-white font-semibold text-base mb-1">Financials</h2>
        <p className="text-slate-500 text-xs">All values in USD per month</p>
      </div>

      <div className="flex flex-col gap-4">
        <InputField
          label="Starting Cash Balance"
          value={inputs.startingCash}
          onChange={v => onChange({ startingCash: v })}
          hint="Total cash in the bank today"
        />
        <InputField
          label="Monthly Burn Rate"
          value={inputs.monthlyBurn}
          onChange={v => onChange({ monthlyBurn: v })}
          hint="Gross operating expenses/month"
        />
        <InputField
          label="Monthly Revenue (MRR)"
          value={inputs.monthlyRevenue}
          onChange={v => onChange({ monthlyRevenue: v })}
          hint="Current monthly recurring revenue"
        />
      </div>

      <div>
        <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">
          Burn Trend
        </h3>
        <div className="flex flex-col gap-2">
          {BURN_MODES.map(mode => (
            <label
              key={mode.key}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div
                className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors"
                style={{
                  borderColor: inputs.burnGrowthMode === mode.key ? '#3b82f6' : '#475569',
                  backgroundColor: inputs.burnGrowthMode === mode.key ? '#3b82f6' : 'transparent',
                }}
              >
                {inputs.burnGrowthMode === mode.key && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>
              <input
                type="radio"
                className="sr-only"
                name="burnGrowthMode"
                value={mode.key}
                checked={inputs.burnGrowthMode === mode.key}
                onChange={() => onChange({ burnGrowthMode: mode.key })}
              />
              <div>
                <span className="text-slate-200 text-sm">{mode.label}</span>
                <span className="text-slate-500 text-xs ml-2">{mode.sub}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-700 pt-4">
        <p className="text-slate-500 text-xs leading-relaxed">
          Scenarios model <span className="text-slate-400">revenue growth</span> at 0%, 5%, and 15%/month.
          Adjust burn trend to layer in hiring plans.
        </p>
      </div>
    </aside>
  )
}
