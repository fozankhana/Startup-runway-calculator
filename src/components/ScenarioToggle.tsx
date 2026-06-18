import type { ScenarioKey, ModelOutput } from '../types'

interface Props {
  output: ModelOutput
  visibleScenarios: Set<ScenarioKey>
  onToggle: (key: ScenarioKey) => void
}

export function ScenarioToggle({ output, visibleScenarios, onToggle }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      {output.scenarios.map(({ config }) => {
        const active = visibleScenarios.has(config.key)
        return (
          <button
            key={config.key}
            onClick={() => onToggle(config.key)}
            aria-pressed={active}
            className="rounded-full px-4 py-1.5 text-xs font-semibold border transition-all duration-150 cursor-pointer select-none"
            style={{
              borderColor: config.color,
              backgroundColor: active ? config.color + '22' : 'transparent',
              color: active ? config.color : '#64748b',
              opacity: active ? 1 : 0.6,
            }}
          >
            {config.label}
          </button>
        )
      })}
    </div>
  )
}
