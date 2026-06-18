export type ScenarioKey = 'pessimistic' | 'base' | 'optimistic'
export type BurnGrowthMode = 'flat' | 'slow' | 'aggressive'

export interface InputState {
  startingCash: number
  monthlyBurn: number
  monthlyRevenue: number
  burnGrowthMode: BurnGrowthMode
  visibleScenarios: Set<ScenarioKey>
}

export interface ScenarioConfig {
  key: ScenarioKey
  label: string
  revenueGrowthRate: number
  burnGrowthRate: number
  color: string
}

export interface DataPoint {
  month: number
  date: Date
  balance: number
  revenue: number
  burn: number
  netBurn: number
}

export interface ScenarioResult {
  config: ScenarioConfig
  data: DataPoint[]
  runwayMonths: number
  runoutDate: Date | null
  totalCapitalDeployed: number
}

export interface ModelOutput {
  scenarios: ScenarioResult[]
}
