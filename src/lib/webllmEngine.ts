import type { MLCEngine, InitProgressReport } from '@mlc-ai/web-llm'
import type { ExtractedFinancials } from './claude'
import { AGENT_TOOLS, searchHackerNews, getBenchmarkData } from './startupData'
import type { AgentEvent } from './ollamaAgent'

export type WebLLMLoadProgress = {
  text: string
  progress: number
  done: boolean
}

let _engine: MLCEngine | null = null
let _engineModelId: string | null = null

export function isWebGPUSupported(): boolean {
  return 'gpu' in navigator
}

export function getCurrentEngine(): { engine: MLCEngine; modelId: string } | null {
  if (_engine && _engineModelId) return { engine: _engine, modelId: _engineModelId }
  return null
}

export async function loadWebLLMEngine(
  modelId: string,
  onProgress: (p: WebLLMLoadProgress) => void
): Promise<MLCEngine> {
  if (_engineModelId === modelId && _engine) {
    onProgress({ text: 'Model already cached', progress: 1, done: true })
    return _engine
  }

  if (_engine) {
    try { await (_engine as unknown as { unload: () => Promise<void> }).unload() } catch {}
    _engine = null
    _engineModelId = null
  }

  const { CreateMLCEngine } = await import('@mlc-ai/web-llm')

  const engine = await CreateMLCEngine(modelId, {
    initProgressCallback: (report: InitProgressReport) => {
      onProgress({
        text: report.text,
        progress: report.progress,
        done: report.progress >= 1,
      })
    },
  })

  _engine = engine
  _engineModelId = modelId
  return engine
}

// ── Extraction ────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = (description: string) =>
  `Extract startup financial data. Return ONLY a JSON object, no other text.

Description: "${description}"

Extract (all in USD):
- startingCash: cash/funding available today ($2M → 2000000)
- monthlyBurn: monthly operating expenses (team of 8 with no explicit burn → ~$96000)
- monthlyRevenue: current MRR (ARR ÷ 12, use 0 if pre-revenue)
- confidence: "high" if all 3 found, "medium" if 2, "low" if 0-1
- explanation: one sentence summary of what was extracted
- missing: array of field names not found or not estimable

Return exactly this JSON:
{"startingCash":number|null,"monthlyBurn":number|null,"monthlyRevenue":number|null,"confidence":"high"|"medium"|"low","explanation":"...","missing":["..."]}`

export async function extractFinancialsWebLLM(
  description: string,
  engine: MLCEngine
): Promise<ExtractedFinancials> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (engine.chat.completions.create as any)({
    messages: [{ role: 'user', content: EXTRACTION_PROMPT(description) }],
    temperature: 0.1,
    max_tokens: 512,
    stream: false,
  })
  const text: string = res.choices[0]?.message?.content ?? '{}'
  const cleaned = text.replace(/```(?:json)?\n?|\n?```/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Model returned non-JSON response')
  return JSON.parse(match[0]) as ExtractedFinancials
}

// ── Analysis ──────────────────────────────────────────────────────────────────

const ANALYSIS_PROMPT = (params: {
  startingCash: number
  monthlyBurn: number
  monthlyRevenue: number
  pessimisticMonths: number
  baseMonths: number
  optimisticMonths: number
}) => {
  const fmt = (m: number) => (m > 119 ? 'cash flow positive' : `${m.toFixed(1)} months`)
  return `Startup financials:
- Cash: $${(params.startingCash / 1000).toFixed(0)}K
- Monthly burn: $${(params.monthlyBurn / 1000).toFixed(0)}K/mo
- Monthly revenue: $${(params.monthlyRevenue / 1000).toFixed(0)}K/mo
- Net burn: $${((params.monthlyBurn - params.monthlyRevenue) / 1000).toFixed(0)}K/mo

Runway projections:
- 0% revenue growth: ${fmt(params.pessimisticMonths)}
- 5%/mo revenue growth: ${fmt(params.baseMonths)}
- 15%/mo revenue growth: ${fmt(params.optimisticMonths)}

Give exactly 3 numbered, specific, actionable recommendations to extend runway or reach cash-flow positive faster. Be concrete — not generic advice. Max 180 words.`
}

export async function streamAnalysisWebLLM(
  params: {
    startingCash: number
    monthlyBurn: number
    monthlyRevenue: number
    pessimisticMonths: number
    baseMonths: number
    optimisticMonths: number
  },
  engine: MLCEngine,
  onChunk: (text: string) => void
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream: AsyncIterable<any> = await (engine.chat.completions.create as any)({
    messages: [{ role: 'user', content: ANALYSIS_PROMPT(params) }],
    stream: true,
    temperature: 0.7,
    max_tokens: 500,
  })
  for await (const chunk of stream) {
    const delta: string | undefined = chunk.choices[0]?.delta?.content
    if (delta) onChunk(delta)
  }
}

// ── Agent ─────────────────────────────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 4

export async function runAgentWebLLM(
  params: {
    startingCash: number
    monthlyBurn: number
    monthlyRevenue: number
    pessimisticMonths: number
    baseMonths: number
    optimisticMonths: number
  },
  engine: MLCEngine,
  onEvent: (e: AgentEvent) => void
): Promise<void> {
  const fmt = (m: number) => (m > 119 ? 'cash flow positive' : `${m.toFixed(1)} months`)
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    {
      role: 'system',
      content: `You are a startup financial advisor with live market research tools. Today is ${today}.
Always call your tools to fetch CURRENT data before giving advice — search at least twice.
Ground every recommendation in what you actually find. Be specific, not generic.`,
    },
    {
      role: 'user',
      content: `Startup:
• Cash $${(params.startingCash / 1000).toFixed(0)}K | Burn $${(params.monthlyBurn / 1000).toFixed(0)}K/mo | MRR $${(params.monthlyRevenue / 1000).toFixed(0)}K/mo
• Net burn: $${((params.monthlyBurn - params.monthlyRevenue) / 1000).toFixed(0)}K/mo
• Runway: ${fmt(params.pessimisticMonths)} (0% growth) · ${fmt(params.baseMonths)} (5%/mo) · ${fmt(params.optimisticMonths)} (15%/mo)

First search for current VC market conditions and relevant benchmarks, then give 3 specific numbered recommendations grounded in what you found.`,
    },
  ]

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const forceFinal = round === MAX_TOOL_ROUNDS

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await (engine.chat.completions.create as any)({
      messages,
      ...(forceFinal ? {} : { tools: AGENT_TOOLS, tool_choice: 'auto' }),
      temperature: 0.3,
      max_tokens: 800,
      stream: false,
    })

    const msg = res.choices[0].message
    messages.push(msg)

    if (!forceFinal && msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        let args: Record<string, string>
        try {
          args = JSON.parse(call.function.arguments) as Record<string, string>
        } catch {
          continue
        }
        onEvent({ type: 'tool_call', name: call.function.name, args })

        let result: string
        if (call.function.name === 'search_market_data') {
          result = await searchHackerNews(args.query ?? '')
        } else if (call.function.name === 'get_startup_benchmarks') {
          result = getBenchmarkData(args.category ?? '')
        } else {
          result = `Unknown tool: ${call.function.name}`
        }

        onEvent({ type: 'tool_result', name: call.function.name, args, result })
        messages.push({ role: 'tool', tool_call_id: call.id, content: result })
      }
    } else {
      if (msg.content) onEvent({ type: 'answer', content: msg.content as string })
      onEvent({ type: 'done' })
      return
    }
  }

  onEvent({ type: 'error', message: 'Agent hit max rounds without a final answer.' })
}
