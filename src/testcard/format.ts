// Caption and clock text. Every function takes the instant as an argument:
// nothing here reads the ambient clock, and nothing here reads the ambient
// locale either: `Intl` would make the rendered card depend on the machine that
// drew it, which is exactly the dependency a test cannot pin down.

const DAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const

const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
] as const

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** `WEDNESDAY 9 SEPTEMBER 2026`: the broadcast date line in the caption box. */
export function formatCardDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
}

/** `01.30.05`: the live clock, dot separated in the period idiom. */
export function formatClockTime(date: Date): string {
  return `${pad2(date.getHours())}.${pad2(date.getMinutes())}.${pad2(date.getSeconds())}`
}

/** The closedown service message, naming the injected resume time. */
export function formatResumeMessage(resumesAt: Date): string {
  return `NORMAL SERVICE WILL RESUME AT ${pad2(resumesAt.getHours())}.${pad2(resumesAt.getMinutes())}`
}
