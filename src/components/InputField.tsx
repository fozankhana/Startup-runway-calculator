import { formatCurrency } from '../lib/formatters'

interface Props {
  label: string
  value: number
  onChange: (v: number) => void
  prefix?: string
  min?: number
  hint?: string
}

export function InputField({ label, value, onChange, prefix = '$', min = 0, hint }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-slate-400 text-sm font-medium">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          min={min}
          value={value === 0 ? '' : value}
          placeholder="0"
          onChange={e => {
            const v = parseFloat(e.target.value)
            onChange(isNaN(v) ? 0 : Math.max(min, v))
          }}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg py-2 pr-3 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors pl-7"
        />
      </div>
      <span className="text-slate-500 text-xs">{hint ?? formatCurrency(value)}</span>
    </div>
  )
}
