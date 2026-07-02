import 'server-only'

/* ================================================================
   Structured logging — one JSON line per event on stdout/stderr,
   searchable in Vercel's log drain (filter on `event:`). Swap the
   sink for a real aggregator (Sentry, Axiom, …) here when needed.
   ================================================================ */

type LogData = Record<string, unknown>

function line(level: 'info' | 'warn' | 'error', event: string, data?: LogData): string {
  return JSON.stringify({ level, event, time: new Date().toISOString(), ...data })
}

export const log = {
  info(event: string, data?: LogData) {
    console.log(line('info', event, data))
  },
  warn(event: string, data?: LogData) {
    console.warn(line('warn', event, data))
  },
  error(event: string, data?: LogData) {
    console.error(line('error', event, data))
  },
}
