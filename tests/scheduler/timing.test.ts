import { describe, it, expect } from "vitest";
import { computeDailyTimes, nextDailyOccurrence, nextWeeklyOccurrence, msUntil } from "../../src/scheduler/timing.js";

describe("computeDailyTimes", () => {
  it("produces fixed hourly slots within the window, matching Faisal's confirmed cadence (every 3h, 8am-10pm)", () => {
    expect(computeDailyTimes(3, 8, 22)).toEqual([
      { hour: 8, minute: 0 },
      { hour: 11, minute: 0 },
      { hour: 14, minute: 0 },
      { hour: 17, minute: 0 },
      { hour: 20, minute: 0 },
    ]);
  });

  it("stops once the next slot would exceed the window end", () => {
    // 20 + 3 = 23 > 22, so 20:00 is the last slot — never overshoots to 23:00.
    expect(computeDailyTimes(3, 8, 22).at(-1)).toEqual({ hour: 20, minute: 0 });
  });

  it("handles a single-slot window", () => {
    expect(computeDailyTimes(3, 12, 12)).toEqual([{ hour: 12, minute: 0 }]);
  });
});

describe("nextDailyOccurrence", () => {
  const times = [
    { hour: 8, minute: 0 },
    { hour: 14, minute: 0 },
    { hour: 20, minute: 0 },
  ];

  it("returns today's next remaining slot", () => {
    const from = new Date(2026, 8, 25, 10, 0, 0); // Sep 25 2026, 10:00 local
    expect(nextDailyOccurrence(times, from)).toEqual(new Date(2026, 8, 25, 14, 0, 0));
  });

  it("rolls over to tomorrow's first slot once every slot today has passed", () => {
    const from = new Date(2026, 8, 25, 21, 0, 0);
    expect(nextDailyOccurrence(times, from)).toEqual(new Date(2026, 8, 26, 8, 0, 0));
  });

  it("treats 'from' exactly on a slot as already past it, not a match", () => {
    const from = new Date(2026, 8, 25, 14, 0, 0);
    expect(nextDailyOccurrence(times, from)).toEqual(new Date(2026, 8, 25, 20, 0, 0));
  });

  it("works correctly for a single daily time, matching the digest cadence (12:30pm)", () => {
    const digestTime = [{ hour: 12, minute: 30 }];
    expect(nextDailyOccurrence(digestTime, new Date(2026, 8, 25, 9, 0, 0))).toEqual(new Date(2026, 8, 25, 12, 30, 0));
    expect(nextDailyOccurrence(digestTime, new Date(2026, 8, 25, 13, 0, 0))).toEqual(new Date(2026, 8, 26, 12, 30, 0));
  });
});

describe("nextWeeklyOccurrence", () => {
  it("finds the next occurrence of the given weekday later this week", () => {
    // Sep 25 2026 is a Friday (day 5); next Sunday (0) at 19:00.
    const from = new Date(2026, 8, 25, 10, 0, 0);
    expect(nextWeeklyOccurrence(0, { hour: 19, minute: 0 }, from)).toEqual(new Date(2026, 8, 27, 19, 0, 0));
  });

  it("rolls over a full week when today is the target day but the time already passed", () => {
    // Sep 27 2026 is a Sunday.
    const from = new Date(2026, 8, 27, 20, 0, 0);
    expect(nextWeeklyOccurrence(0, { hour: 19, minute: 0 }, from)).toEqual(new Date(2026, 9, 4, 19, 0, 0));
  });

  it("fires later today when today is the target day and the time hasn't passed yet", () => {
    const from = new Date(2026, 8, 27, 10, 0, 0);
    expect(nextWeeklyOccurrence(0, { hour: 19, minute: 0 }, from)).toEqual(new Date(2026, 8, 27, 19, 0, 0));
  });
});

describe("msUntil", () => {
  it("returns the millisecond gap between two dates", () => {
    const from = new Date(2026, 8, 25, 10, 0, 0);
    const target = new Date(2026, 8, 25, 10, 0, 5);
    expect(msUntil(target, from)).toBe(5000);
  });

  it("never returns negative — clamps a past date to 0", () => {
    const from = new Date(2026, 8, 25, 10, 0, 5);
    const target = new Date(2026, 8, 25, 10, 0, 0);
    expect(msUntil(target, from)).toBe(0);
  });
});
