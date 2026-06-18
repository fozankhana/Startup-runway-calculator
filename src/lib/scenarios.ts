import type { BurnGrowthMode, ScenarioConfig } from '../types'

const BURN_GROWTH: Record<BurnGrowthMode, number> = {
  flat: 0,
  slow: 0.01,
  aggressive: 0.03,
}

const SCENARIO_BASES: Omit<ScenarioConfig, 'burnGrowthRate'>[] = [
  { key: 'pessimistic', label: 'Pessimistic', revenueGrowthRate: 0,    color: '#ef4444' },
  { key: 'base',        label: 'Base Case',   revenueGrowthRate: 0.05,  color: '#f59e0b' },
  { key: 'optimistic',  label: 'Optimistic',  revenueGrowthRate: 0.15, color: '#22c55e' },
]

export function buildScenarioConfigs(burnGrowthMode: BurnGrowthMode): ScenarioConfig[] {
  const burnGrowthRate = BURN_GROWTH[burnGrowthMode]
  return SCENARIO_BASES.map(s => ({ ...s, burnGrowthRate }))
}
