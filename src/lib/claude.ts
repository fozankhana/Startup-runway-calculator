import Anthropic from '@anthropic-ai/sdk'

export interface ExtractedFinancials {
  startingCash: number | null
  monthlyBurn: number | null
  monthlyRevenue: number | null
  confidence: 'high' | 'medium' | 'low'
  explanation: string
  missing: string[]
}

export async function extractFinancials(
  description: string,
  apiKey: string
): Promise<ExtractedFinancials> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Extract startup financial data. Return ONLY a JSON object, no other text.

Description: "${description}"

Extract (all in USD):
- startingCash: cash/funding available today ($2M → 2000000)
- monthlyBurn: monthly operating expenses (team of 8 with no burn stated → ~$96000)
- monthlyRevenue: current MRR (ARR ÷ 12, $0 if pre-revenue)
- confidence: "high" if all 3 found, "medium" if 2, "low" if 0-1
- explanation: one sentence summary of what was extracted
- missing: array of field names that were not found or could not be estimated

Return exactly:
{"startingCash":number|null,"monthlyBurn":number|null,"monthlyRevenue":number|null,"confidence":"high"|"medium"|"low","explanation":"...","missing":["..."]}`,
      },
    ],
  })

  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('No text response from API')
  const cleaned = block.text.replace(/```(?:json)?\n?|\n?```/g, '').trim()
  return JSON.parse(cleaned) as ExtractedFinancials
}

export async function streamAnalysis(
  params: {
    startingCash: number
    monthlyBurn: number
    monthlyRevenue: number
    pessimisticMonths: number
    baseMonths: number
    optimisticMonths: number
  },
  apiKey: string,
  onChunk: (text: string) => void
): Promise<void> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const fmt = (months: number) =>
    months > 119 ? 'cash flow positive' : `${months.toFixed(1)} months`

  const stream = client.messages.stream({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `Startup financials:
- Cash: $${(params.startingCash / 1000).toFixed(0)}K
- Monthly burn: $${(params.monthlyBurn / 1000).toFixed(0)}K/mo
- Monthly revenue: $${(params.monthlyRevenue / 1000).toFixed(0)}K/mo
- Net burn: $${((params.monthlyBurn - params.monthlyRevenue) / 1000).toFixed(0)}K/mo

Runway projections:
- 0% revenue growth: ${fmt(params.pessimisticMonths)}
- 5%/mo revenue growth: ${fmt(params.baseMonths)}
- 15%/mo revenue growth: ${fmt(params.optimisticMonths)}

Give exactly 3 numbered, specific, actionable recommendations to extend runway or reach cash-flow positive faster. Be concrete — not generic advice. Max 180 words.`,
      },
    ],
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      onChunk(event.delta.text)
    }
  }
}
