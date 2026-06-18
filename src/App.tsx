import { useState } from 'react'
import type { InputState, ScenarioKey } from './types'
import { useRunwayModel } from './hooks/useRunwayModel'
import { InputPanel } from './components/InputPanel'
import { RunwayChart } from './components/RunwayChart'
import { MetricsCards } from './components/MetricsCards'
import { ScenarioToggle } from './components/ScenarioToggle'
import { AIPanel } from './components/AIPanel'

const DEFAULT_INPUTS: InputState = {
  startingCash: 500_000,
  monthlyBurn: 80_000,
  monthlyRevenue: 30_000,
  burnGrowthMode: 'flat',
  visibleScenarios: new Set<ScenarioKey>(['pessimistic', 'base', 'optimistic']),
}

export default function App() {
  const [inputs, setInputs] = useState<InputState>(DEFAULT_INPUTS)

  const handleChange = (partial: Partial<InputState>) =>
    setInputs(prev => ({ ...prev, ...partial }))

  const handleToggle = (key: ScenarioKey) =>
    setInputs(prev => {
      const next = new Set(prev.visibleScenarios)
      next.has(key) ? next.delete(key) : next.add(key)
      return { ...prev, visibleScenarios: next }
    })

  const output = useRunwayModel(inputs)

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Runway Calculator</h1>
            <p className="text-slate-500 text-xs mt-0.5">Know exactly when you run out of money</p>
          </div>
          <ScenarioToggle
            output={output}
            visibleScenarios={inputs.visibleScenarios}
            onToggle={handleToggle}
          />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-6">
        <AIPanel onApply={handleChange} modelOutput={output} inputs={inputs} />

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
          <InputPanel inputs={inputs} onChange={handleChange} />

          <div className="flex flex-col gap-6">
            <RunwayChart output={output} visibleScenarios={inputs.visibleScenarios} />
            <MetricsCards output={output} visibleScenarios={inputs.visibleScenarios} />
          </div>
        </div>
      </main>
    </div>
  )
}
