import { useMemo } from 'react'
import type { InputState, ModelOutput } from '../types'
import { buildScenarioConfigs } from '../lib/scenarios'
import { simulateScenario } from '../lib/financialModel'

export function useRunwayModel(inputs: InputState): ModelOutput {
  return useMemo(() => {
    const configs = buildScenarioConfigs(inputs.burnGrowthMode)
    return { scenarios: configs.map(c => simulateScenario(inputs, c)) }
  }, [inputs.startingCash, inputs.monthlyBurn, inputs.monthlyRevenue, inputs.burnGrowthMode]) // eslint-disable-line react-hooks/exhaustive-deps
}
