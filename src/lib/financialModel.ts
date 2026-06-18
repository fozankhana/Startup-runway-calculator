import type { InputState, ScenarioConfig, ScenarioResult, DataPoint } from '../types'

const MAX_MONTHS = 120

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function simulateScenario(inputs: InputState, config: ScenarioConfig): ScenarioResult {
  const startingCash = Math.max(0, inputs.startingCash)
  const today = new Date()
  today.setDate(1)

  if (startingCash === 0) {
    const point: DataPoint = {
      month: 0,
      date: today,
      balance: 0,
      revenue: inputs.monthlyRevenue,
      burn: inputs.monthlyBurn,
      netBurn: inputs.monthlyBurn - inputs.monthlyRevenue,
    }
    return {
      config,
      data: [point],
      runwayMonths: 0,
      runoutDate: today,
      totalCapitalDeployed: 0,
    }
  }

  const data: DataPoint[] = []
  let balance = startingCash
  let runwayMonths = MAX_MONTHS
  let runoutDate: Date | null = null

  data.push({
    month: 0,
    date: new Date(today),
    balance,
    revenue: inputs.monthlyRevenue,
    burn: inputs.monthlyBurn,
    netBurn: inputs.monthlyBurn - inputs.monthlyRevenue,
  })

  for (let n = 1; n <= MAX_MONTHS; n++) {
    const revenue = inputs.monthlyRevenue * (1 + config.revenueGrowthRate) ** n
    const burn = inputs.monthlyBurn * (1 + config.burnGrowthRate) ** n
    const prevBalance = balance
    balance = prevBalance + revenue - burn

    const point: DataPoint = {
      month: n,
      date: addMonths(today, n),
      balance,
      revenue,
      burn,
      netBurn: burn - revenue,
    }
    data.push(point)

    if (balance <= 0 && prevBalance > 0) {
      const fraction = prevBalance / (prevBalance - balance)
      runwayMonths = n - 1 + fraction
      const runoutMs = data[n - 1].date.getTime() + fraction * 30.44 * 24 * 60 * 60 * 1000
      runoutDate = new Date(runoutMs)
      break
    }

    if (n === MAX_MONTHS && balance > 0) {
      runoutDate = null
      runwayMonths = MAX_MONTHS
    }
  }

  const totalCapitalDeployed = data.reduce((sum, p) => sum + Math.max(0, p.netBurn), 0)

  return { config, data, runwayMonths, runoutDate, totalCapitalDeployed }
}
