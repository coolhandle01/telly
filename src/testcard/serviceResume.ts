/** When the channel opens up again: the next occurrence of `hour:00` after `now`. */
export const OPENING_HOUR = 6

export function nextServiceResume(now: Date, hour: number = OPENING_HOUR): Date {
  const resume = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0)
  if (resume.getTime() <= now.getTime()) resume.setDate(resume.getDate() + 1)
  return resume
}
