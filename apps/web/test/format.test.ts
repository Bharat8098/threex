import { describe, expect, it } from "vitest";
import { formatDistance, formatWindow } from "../src/copy/format.ts";

describe("formatting", () => {
  it("formats distances", () => {
    expect(formatDistance(0.42)).toBe("420\u00a0m");
    expect(formatDistance(3.94)).toBe("3.9\u00a0km");
    expect(formatDistance(18.4)).toBe("18\u00a0km");
  });

  it("labels windows by day in the device's time zone", () => {
    const now = new Date(2026, 10, 2, 9, 0).getTime();
    const at = (day: number, hour: number, minute = 0) =>
      new Date(2026, 10, day, hour, minute).getTime();
    expect(formatWindow(at(2, 18), at(2, 20, 15), now)).toBe("Today 18:00–20:15");
    expect(formatWindow(at(3, 6, 30), at(3, 8, 30), now)).toBe("Tomorrow 06:30–08:30");
    expect(formatWindow(at(5, 6, 30), at(5, 8, 30), now)).toMatch(/^\S+ 06:30–08:30$/);
  });
});
