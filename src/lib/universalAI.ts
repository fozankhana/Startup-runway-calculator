import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedFinancials } from './claude'

export type CloudProvider = 'anthropic' | 'openai' | 'gemini' | 'groq' | 'openrouter'

export interface ProviderDef {
  id: CloudProvider
  name: string
  models: { id: string; label: string }[]
  keyPlaceholder: string
  freeKeyUrl: string
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      { id: 'claude-haiku-4-5', label: 'Haiku 4.5 · fast' },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 · smart' },
    ],
    keyPlaceholder: 'sk-ant-api03-...',
    freeKeyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini · fast' },
      { id: 'gpt-4o', label: 'GPT-4o · smart' },
    ],
    keyPlaceholder: 'sk-proj-...',
    freeKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash · fast' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ],
    keyPlaceholder: 'AIza...',
    freeKeyUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'groq',
    name: 'Groq',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B · fast' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B · fastest' },
    ],
    keyPlaceholder: 'gsk_...',
    freeKeyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    models: [
      { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B · free' },
      { id: 'google/gemini-flash-1.5-8b', label: 'Gemini Flash 1.5 8B' },
      { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku' },
    ],
    keyPlaceholder: 'sk-or-v1-...',
    freeKeyUrl: 'https://openrouter.ai/keys',
  },
]

export function getDefaultModel(provider: CloudProvider): string {
  return PROVIDERS.find(p => p.id === provider)?.models[0]?.id ?? ''
}

// Detect quota / auth / rate-limit errors that should trigger Ollama fallback
export function isApiLimitError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('429') ||
    msg.includes('401') ||
    msg.includes('402') ||
    msg.includes('quota') ||
    msg.includes('credit') ||
    msg.includes('billing') ||
    msg.includes('rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('insufficient_quota') ||
    msg.includes('invalid_api_key') ||
    msg.includes('authentication') ||
    msg.includes('unauthorized')
  )
}

// ── Shared prompts ────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = (description: string) =>
  `Extract startup financial data. Return ONLY a JSON object, no markdown.

Description: "${description}"

Rules: $2M→2000000, ARR÷12=MRR, team of 8 no stated burn→~$96000
confidence: "high" all 3 found · "medium" 2 found · "low" 0–1

Return exactly:
{"startingCash":number|null,"monthlyBurn":number|null,"monthlyRevenue":number|null,"confidence":"high"|"medium"|"low","explanation":"...","missing":["..."]}`

export type AnalysisParams = {
  startingCash: number
  monthlyBurn: number
  monthlyRevenue: number
  pessimisticMonths: number
  baseMonths: number
  optimisticMonths: number
}

const ANALYSIS_PROMPT = (p: AnalysisParams): string => {
  const fmt = (m: number) => (m > 119 ? 'cash flow positive' : `${m.toFixed(1)} months`)
  return `Startup:
Cash $${(p.startingCash / 1000).toFixed(0)}K | Burn $${(p.monthlyBurn / 1000).toFixed(0)}K/mo | MRR $${(p.monthlyRevenue / 1000).toFixed(0)}K/mo
Net burn $${((p.monthlyBurn - p.monthlyRevenue) / 1000).toFixed(0)}K/mo
Runway: ${fmt(p.pessimisticMonths)} (0% growth) · ${fmt(p.baseMonths)} (5%/mo) · ${fmt(p.optimisticMonths)} (15%/mo)

Give exactly 3 numbered, specific, actionable recommendations to extend runway or reach profitability. Be concrete. Max 180 words.`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const OAI_ENDPOINTS: Record<Exclude<CloudProvider, 'anthropic' | 'gemini'>, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
}

function orHeaders(): Record<string, string> {
  return { 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'Runway Calculator' }
}

async function bodyText(res: Response): Promise<string> {
  return res.text().catch(() => res.statusText)
}

async function parseSSE(body: ReadableStream<Uint8Array>, onLine: (l: string) => void) {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.replace(/^data:\s?/, '').trim()
      if (t && t !== '[DONE]') onLine(t)
    }
  }
}

// ── Extraction ────────────────────────────────────────────────────────────────

async function extractAnthropic(
  description: string, apiKey: string, model: string
): Promise<ExtractedFinancials> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const msg = await client.messages.create({
    model,
    max_tokens: 512,
    messages: [{ role: 'user', content: EXTRACTION_PROMPT(description) }],
  })
  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('No text response')
  return JSON.parse(block.text.replace(/```(?:json)?\n?|\n?```/g, '').trim()) as ExtractedFinancials
}

async function extractGemini(
  description: string, apiKey: string, model: string
): Promise<ExtractedFinancials> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: EXTRACTION_PROMPT(description) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await bodyText(res)}`)
  const d = await res.json() as { candidates: [{ content: { parts: [{ text: string }] } }] }
  return JSON.parse(d.candidates[0].content.parts[0].text.replace(/```(?:json)?\n?|\n?```/g, '').trim()) as ExtractedFinancials
}

async function extractOAICompat(
  description: string, apiKey: string, model: string,
  endpoint: string, extra: Record<string, string> = {}
): Promise<ExtractedFinancials> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extra },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: EXTRACTION_PROMPT(description) }],
      temperature: 0.1,
    }),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await bodyText(res)}`)
  const d = await res.json() as { choices: [{ message: { content: string } }] }
  return JSON.parse(d.choices[0].message.content) as ExtractedFinancials
}

export async function extractFinancialsUniversal(
  description: string, provider: CloudProvider, apiKey: string, model: string
): Promise<ExtractedFinancials> {
  if (provider === 'anthropic') return extractAnthropic(description, apiKey, model)
  if (provider === 'gemini')    return extractGemini(description, apiKey, model)
  return extractOAICompat(
    description, apiKey, model,
    OAI_ENDPOINTS[provider],
    provider === 'openrouter' ? orHeaders() : {}
  )
}

// ── Streaming analysis ────────────────────────────────────────────────────────

async function streamAnthropic(
  params: AnalysisParams, apiKey: string, model: string, onChunk: (s: string) => void
) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const stream = client.messages.stream({
    model,
    max_tokens: 500,
    messages: [{ role: 'user', content: ANALYSIS_PROMPT(params) }],
  })
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
      onChunk(ev.delta.text)
    }
  }
}

async function streamGemini(
  params: AnalysisParams, apiKey: string, model: string, onChunk: (s: string) => void
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: ANALYSIS_PROMPT(params) }] }] }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await bodyText(res)}`)
  await parseSSE(res.body!, line => {
    try {
      const d = JSON.parse(line) as { candidates: [{ content: { parts: [{ text: string }] } }] }
      const chunk = d.candidates?.[0]?.content?.parts?.[0]?.text
      if (chunk) onChunk(chunk)
    } catch { /* skip */ }
  })
}

async function streamOAICompat(
  params: AnalysisParams, apiKey: string, model: string,
  endpoint: string, extra: Record<string, string> = {},
  onChunk: (s: string) => void
) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extra },
    body: JSON.stringify({
      model, stream: true,
      messages: [{ role: 'user', content: ANALYSIS_PROMPT(params) }],
    }),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await bodyText(res)}`)
  await parseSSE(res.body!, line => {
    try {
      const d = JSON.parse(line) as { choices: [{ delta: { content?: string } }] }
      const chunk = d.choices?.[0]?.delta?.content
      if (chunk) onChunk(chunk)
    } catch { /* skip */ }
  })
}

export async function streamAnalysisUniversal(
  params: AnalysisParams, provider: CloudProvider, apiKey: string,
  model: string, onChunk: (s: string) => void
): Promise<void> {
  if (provider === 'anthropic') return streamAnthropic(params, apiKey, model, onChunk)
  if (provider === 'gemini')    return streamGemini(params, apiKey, model, onChunk)
  return streamOAICompat(
    params, apiKey, model,
    OAI_ENDPOINTS[provider],
    provider === 'openrouter' ? orHeaders() : {},
    onChunk
  )
}
