const rtf = new Intl.RelativeTimeFormat(undefined, {
  numeric: 'always',
  style: 'short',
})

export function formatPercentage(value: number) {
  return Intl.NumberFormat(undefined, { style: 'percent' }).format(value / 100)
}

function getRelativeTimeUnit(seconds: number): [Intl.RelativeTimeFormatUnit, number] {
  let unit: Intl.RelativeTimeFormatUnit = 'day'
  let n = seconds / 86400
  if (Math.abs(seconds) < 60) {
    unit = 'second'
    n = seconds
  } else if (Math.abs(seconds) < 3600) {
    unit = 'minute'
    n = seconds / 60
  } else if (Math.abs(seconds) < 86400) {
    unit = 'hour'
    n = seconds / 3600
  }
  n = Math.ceil(n)

  return [unit, n]
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()) {
  // const locales = new Intl.Locale(navigator.language)
  const diff = (timestamp - now) / 1000 // in seconds

  const [unit, n] = getRelativeTimeUnit(diff)
  return rtf.format(n, unit)
}
