import { describe, expect, it } from "vitest";
import { localZone, timeIn, wallTime, zonedInstant, zoneLabel, zoneName } from "./timeZones";

// The tests run in America/New_York (src/test/setup.ts).
const z = (iso: string) => new Date(iso);

describe("time zones (NETL-040–045)", () => {
  it("knows this computer's zone", () => {
    expect(localZone()).toBe("America/New_York");
  });

  it("reads a wall clock anywhere", () => {
    expect(wallTime(z("2026-11-18T01:00:00Z"), "America/New_York")).toEqual({
      year: 2026, month: 11, day: 17, hour: 20, minute: 0, weekday: 2,
    });
    expect(wallTime(z("2026-11-18T01:00:00Z"), "UTC").weekday).toBe(3);
  });

  it("finds the moment a clock reads a time, either side of daylight-saving time", () => {
    expect(zonedInstant(2026, 10, 27, 19, 0, "America/New_York")).toEqual(z("2026-10-27T23:00:00Z"));
    expect(zonedInstant(2026, 11, 17, 19, 0, "America/New_York")).toEqual(z("2026-11-18T00:00:00Z"));
    expect(zonedInstant(2026, 11, 18, 1, 0, "UTC")).toEqual(z("2026-11-18T01:00:00Z"));
    expect(zonedInstant(2026, 7, 1, 12, 0, "Europe/Berlin")).toEqual(z("2026-07-01T10:00:00Z"));
  });

  it("moves a skipped time later and takes the first of a repeated one (NETL-044)", () => {
    // March 14, 2027: 02:00 EST jumps to 03:00 EDT.
    expect(zonedInstant(2027, 3, 14, 2, 30, "America/New_York")).toEqual(z("2027-03-14T07:30:00Z"));
    expect(wallTime(z("2027-03-14T07:30:00Z"), "America/New_York").hour).toBe(3);
    // November 7, 2027: 01:30 happens twice; the first is EDT.
    expect(zonedInstant(2027, 11, 7, 1, 30, "America/New_York")).toEqual(z("2027-11-07T05:30:00Z"));
  });

  it("marks times with their zone", () => {
    expect(zoneLabel("UTC", z("2026-11-18T01:00:00Z"))).toBe("Z");
    expect(timeIn(z("2026-11-18T01:00:00Z"), "UTC")).toBe("01:00Z");
    expect(timeIn(z("2026-11-18T01:00:00Z"), "America/New_York")).toBe("20:00 EST");
    expect(timeIn(z("2026-10-28T01:00:00Z"), "America/New_York")).toBe("21:00 EDT");
    expect(zoneName("UTC")).toBe("UTC (Zulu)");
    expect(zoneName("America/Los_Angeles")).toBe("America/Los Angeles");
  });
});
