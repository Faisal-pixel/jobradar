// Pure wall-clock math, deliberately kept free of setTimeout/Date.now()
// side effects — every function here takes "now" as an explicit `from`
// parameter, so it's directly unit-testable without fake timers. All
// times are the process's local time (TZ env var — docker-compose.yml
// sets Africa/Lagos; confirmed live that node:24-alpine's tzdata
// resolves it correctly, so Date#getHours() etc. reflect Faisal's actual
// clock, not UTC).

export interface TimeOfDay {
  hour: number;
  minute: number;
}

// "Every N hours within [startHour, endHour]" as a concrete list of
// times, e.g. (3, 8, 22) -> 8:00, 11:00, 14:00, 17:00, 20:00. Anchoring
// to fixed wall-clock hours (rather than a plain N-hour interval from
// whenever the process started) means the schedule never drifts across
// restarts and always lands on predictable times.
export function computeDailyTimes(intervalHours: number, windowStartHour: number, windowEndHour: number): TimeOfDay[] {
  const times: TimeOfDay[] = [];
  for (let hour = windowStartHour; hour <= windowEndHour; hour += intervalHours) {
    times.push({ hour, minute: 0 });
  }
  return times;
}

function atTime(from: Date, time: TimeOfDay): Date {
  const d = new Date(from);
  d.setHours(time.hour, time.minute, 0, 0);
  return d;
}

// The next occurrence of any of `times` strictly after `from` — today's
// remaining slot if one exists, otherwise tomorrow's first.
export function nextDailyOccurrence(times: TimeOfDay[], from: Date): Date {
  if (times.length === 0) throw new Error("nextDailyOccurrence requires at least one time");
  const sorted = [...times].sort((a, b) => a.hour - b.hour || a.minute - b.minute);

  for (const time of sorted) {
    const candidate = atTime(from, time);
    if (candidate.getTime() > from.getTime()) return candidate;
  }

  const tomorrow = new Date(from);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return atTime(tomorrow, sorted[0]!);
}

// The next occurrence of `dayOfWeek` (0 = Sunday, matching Date#getDay())
// at `time`, strictly after `from`.
export function nextWeeklyOccurrence(dayOfWeek: number, time: TimeOfDay, from: Date): Date {
  const candidateToday = atTime(from, time);
  let daysUntil = (dayOfWeek - from.getDay() + 7) % 7;
  if (daysUntil === 0 && candidateToday.getTime() <= from.getTime()) daysUntil = 7;

  const target = new Date(from);
  target.setDate(target.getDate() + daysUntil);
  return atTime(target, time);
}

export function msUntil(date: Date, from: Date): number {
  return Math.max(0, date.getTime() - from.getTime());
}
