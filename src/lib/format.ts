export function formatPercentage(value: number) {
  return Intl.NumberFormat(undefined, { style: 'percent' }).format(value / 100)
}
