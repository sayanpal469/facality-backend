import { env } from '../config/env.js'

/** The calendar day ('YYYY-MM-DD') of `date` in the app's time zone. */
export function localDay(date = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** 'YYYY-MM-DD' shifted by `days`. */
export function addDays(day, days) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
