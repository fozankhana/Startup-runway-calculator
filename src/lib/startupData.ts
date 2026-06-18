// Tool definitions for Ollama agent (models that support function calling:
// llama3.1, llama3.2, mistral-nemo, qwen2.5, phi4, command-r)
export const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_market_data',
      description:
        'Search Hacker News for recent startup funding news, VC trends, tech layoffs, market conditions. Use this to ground recommendations in current events.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query, e.g. "VC funding trends 2025" or "startup burn rate benchmarks"',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_startup_benchmarks',
      description: 'Get current startup industry benchmarks for a specific metric category.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['growth_rates', 'burn_multiple', 'churn_rates', 'fundraising', 'hiring_costs'],
            description: 'The benchmark category to retrieve',
          },
        },
        required: ['category'],
      },
    },
  },
]

// Curated current benchmarks (2024-2025)
const BENCHMARKS: Record<string, string> = {
  growth_rates: `SaaS Monthly Revenue Growth Benchmarks (2024-2025):
• Exceptional: >15%/month (180%+ ARR)
• Strong: 10-15%/month (T2D3 path)
• Healthy: 5-10%/month (median funded startup)
• Struggling: 2-5%/month
• Declining: <2%/month
Rule of 40: (monthly growth % × 12) + net margin % ≥ 40 = considered fundable.
Context: 2021 "growth at all costs" era is over. Investors now weight efficiency equally.`,

  burn_multiple: `Burn Multiple = Net Cash Burn ÷ Net New ARR (2024 standards):
• World-class: <0.5x
• Good: 0.5–1.0x (fundable for Series A)
• Acceptable: 1.0–1.5x (need strong growth story)
• Concerning: 1.5–2.5x (VCs will push for cuts)
• Unsustainable: >2.5x
Source: Bessemer/Sacks framework. 2024: most VCs require <1.5x for Series A conviction.
Higher interest rates mean investors demand capital efficiency above 2021 norms.`,

  churn_rates: `Monthly Net Revenue Churn Benchmarks (2024):
• Best-in-class (any segment): <1%/month
• B2B SaaS Enterprise: 0.5–1.5%/month (6–18% annual)
• B2B SaaS SMB: 3–7%/month (30–60% annual)
• B2C subscription: 5–10%/month
• Warning: 5% monthly = 46% annual churn — rarely survivable long-term.
Net Negative Churn (expansion > churn) is the holy grail: best SaaS companies achieve –1 to –3%/mo.`,

  fundraising: `VC Fundraising Environment (Mid-2025):
• Fed Funds Rate: ~4.25–4.5% — investors demand higher returns vs 2020–2021 zero rates
• VC deal count: ~30% below 2021 peak but activity recovering in AI/defense/energy
• Median seed round: $2–3M at $8–12M pre-money valuation
• Median Series A: $8–12M at $25–40M pre-money valuation (3–5x+ ARR multiple)
• Time to close A round: 3–6 months active fundraising (down from 2–4 weeks in 2021)
• Tier-1 VCs want: >$1M ARR, 10%+ MoM growth, strong NRR, clear path to profitability
• "Default alive" startups (reach profitability before raising) close 3x faster with better terms
• AI startups command 2–3x valuation premium over non-AI equivalents`,

  hiring_costs: `Tech Hiring Costs USA (2025):
• Mid-level Software Engineer: $160–200K salary → $210–280K fully-loaded
• Senior Engineer: $220–300K salary → $300–420K fully-loaded
• Product Manager: $160–210K → $215–290K fully-loaded
• Designer (UX/Product): $130–170K → $175–235K fully-loaded
• Fully-loaded multiplier: 1.3–1.5x base (benefits + payroll tax + overhead + equity amortized)
• Monthly cost rule: Senior eng ≈ $25–35K/month fully-loaded
• 2024–2025 layoffs created a talent surplus; negotiating power shifted to employers
• Offshore/contractor option: India/Eastern Europe 40–60% cheaper for certain roles`,
}

export function getBenchmarkData(category: string): string {
  return BENCHMARKS[category] ?? `No benchmark data available for "${category}".`
}

export async function searchHackerNews(query: string): Promise<string> {
  try {
    const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)
    const recentUrl =
      `https://hn.algolia.com/api/v1/search` +
      `?query=${encodeURIComponent(query)}` +
      `&tags=story` +
      `&numericFilters=created_at_i>${thirtyDaysAgo},points>20` +
      `&hitsPerPage=5`

    const res = await fetch(recentUrl, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) throw new Error(`HN API ${res.status}`)

    const data = (await res.json()) as {
      hits: Array<{ title: string; created_at: string; points: number; story_text?: string }>
    }

    if (data.hits.length === 0) {
      // Broaden search — remove date filter, raise points threshold
      const broadUrl =
        `https://hn.algolia.com/api/v1/search` +
        `?query=${encodeURIComponent(query)}` +
        `&tags=story` +
        `&numericFilters=points>75` +
        `&hitsPerPage=5`
      const res2 = await fetch(broadUrl, { signal: AbortSignal.timeout(6000) })
      const data2 = (await res2.json()) as typeof data
      return formatHits(data2.hits, query)
    }

    return formatHits(data.hits, query)
  } catch {
    return `Search unavailable for "${query}" — use your training knowledge for this query.`
  }
}

function formatHits(
  hits: Array<{ title: string; created_at: string; points: number }>,
  query: string
): string {
  if (!hits.length) return `No news found for "${query}".`
  return (
    `Recent Hacker News discussions about "${query}":\n` +
    hits
      .map(h => {
        const date = new Date(h.created_at).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        })
        return `• "${h.title}" (${date}, ${h.points} pts)`
      })
      .join('\n')
  )
}
