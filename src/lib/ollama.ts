import type { ExtractedFinancials } from './claude'

const BASE = 'http://localhost:11434'

export interface OllamaModel {
  name: string
  size: number
  details?: {
    parameter_size?: string
    family?: string
    quantization_level?: string
  }
}

export async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/version`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function listModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${BASE}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Cannot list Ollama models (${res.status})`)
  const data = (await res.json()) as { models: OllamaModel[] }
  return data.models ?? []
}

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

export async function extractFinancialsLocal(
  description: string,
  model: string
): Promise<ExtractedFinancials> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      format: 'json',
      stream: false,
      messages: [{ role: 'user', content: EXTRACTION_PROMPT(description) }],
    }),
  })

  if (!res.ok) throw new Error(`Ollama returned ${res.status} ${res.statusText}`)
  const data = (await res.json()) as { message: { content: string } }
  const cleaned = data.message.content.replace(/```(?:json)?\n?|\n?```/g, '').trim()
  return JSON.parse(cleaned) as ExtractedFinancials
}

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

// ── Model pull (download from registry.ollama.ai) ────────────────────────────

export type PullProgress = {
  status: string
  completed?: number
  total?: number
  percent: number
  done: boolean
  error?: string
}

export async function pullModel(
  model: string,
  onProgress: (p: PullProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
    signal,
  })
  if (!res.ok) throw new Error(`Ollama pull failed: ${res.status} ${res.statusText}`)
  if (!res.body) throw new Error('No response body from Ollama')

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      let p: { status: string; completed?: number; total?: number; error?: string }
      try {
        p = JSON.parse(line) as typeof p
      } catch {
        continue
      }
      if (p.error) throw new Error(p.error)
      const percent =
        p.total && p.completed !== undefined
          ? Math.min(100, Math.round((p.completed / p.total) * 100))
          : 0
      const isDone = p.status === 'success'
      onProgress({ status: p.status, completed: p.completed, total: p.total, percent, done: isDone })
      if (isDone) return
    }
  }
}

export async function streamAnalysisLocal(
  params: {
    startingCash: number
    monthlyBurn: number
    monthlyRevenue: number
    pessimisticMonths: number
    baseMonths: number
    optimisticMonths: number
  },
  model: string,
  onChunk: (text: string) => void
): Promise<void> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'user', content: ANALYSIS_PROMPT(params) }],
    }),
  })

  if (!res.ok) throw new Error(`Ollama returned ${res.status} ${res.statusText}`)
  if (!res.body) throw new Error('No response body from Ollama')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const chunk = JSON.parse(line) as { message?: { content: string }; done: boolean }
        if (chunk.message?.content) onChunk(chunk.message.content)
        if (chunk.done) return
      } catch { /* skip malformed lines */ }
    }
  }
}
