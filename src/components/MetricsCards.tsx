import type { ModelOutput, ScenarioKey } from '../types'
import { MetricCard } from './MetricCard'

interface Props {
  output: ModelOutput
  visibleScenarios: Set<ScenarioKey>
}

export function MetricsCards({ output, visibleScenarios }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {output.scenarios.map(result => (
        <MetricCard
          key={result.config.key}
          result={result}
          visible={visibleScenarios.has(result.config.key)}
        />
      ))}
    </div>
  )
}
