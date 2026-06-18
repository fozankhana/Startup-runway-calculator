export function formatCurrency(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${Math.round(abs).toLocaleString()}`
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function formatRunway(months: number, runoutDate: Date | null): string {
  if (runoutDate === null) return 'Cash flow positive'
  if (months === 0) return '0 months'
  if (months >= 12) {
    const years = Math.floor(months / 12)
    const rem = Math.round(months % 12)
    return rem > 0 ? `${years}y ${rem}mo` : `${years} years`
  }
  return `${months.toFixed(1)} months`
}
