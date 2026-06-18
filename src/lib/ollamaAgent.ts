import { AGENT_TOOLS, searchHackerNews, getBenchmarkData } from './startupData'

const BASE = 'http://localhost:11434'
const MAX_TOOL_ROUNDS = 4

export type AgentEvent =
  | { type: 'tool_call'; name: string; args: Record<string, string> }
  | { type: 'tool_result'; name: string; args: Record<string, string>; result: string }
  | { type: 'answer'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    function: { name: string; arguments: Record<string, unknown> | string }
  }>
}

export async function runStartupAgent(
  params: {
    startingCash: number
    monthlyBurn: number
    monthlyRevenue: number
    pessimisticMonths: number
    baseMonths: number
    optimisticMonths: number
  },
  model: string,
  onEvent: (e: AgentEvent) => void
): Promise<void> {
  const fmt = (m: number) => (m > 119 ? 'cash flow positive' : `${m.toFixed(1)} months`)
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const messages: OllamaMessage[] = [
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

    let res: Response
    try {
      res = await fetch(`${BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          ...(forceFinal ? {} : { tools: AGENT_TOOLS }),
          stream: false,
          options: { temperature: 0.3 },
        }),
      })
    } catch (err) {
      onEvent({
        type: 'error',
        message: `Cannot reach Ollama: ${err instanceof Error ? err.message : String(err)}`,
      })
      return
    }

    if (!res.ok) {
      onEvent({ type: 'error', message: `Ollama ${res.status}: ${res.statusText}` })
      return
    }

    const data = (await res.json()) as { message: OllamaMessage }
    const msg = data.message
    messages.push(msg)

    if (!forceFinal && msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        const rawArgs = call.function.arguments
        let args: Record<string, string>
        try {
          args =
            typeof rawArgs === 'string'
              ? (JSON.parse(rawArgs) as Record<string, string>)
              : (rawArgs as Record<string, string>)
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
        messages.push({ role: 'tool', content: result })
      }
    } else {
      if (msg.content) onEvent({ type: 'answer', content: msg.content })
      onEvent({ type: 'done' })
      return
    }
  }

  onEvent({ type: 'error', message: 'Agent hit max rounds without a final answer.' })
}
