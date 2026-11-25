import { describe, expect, it } from "vitest";
import { dayLabel, dueCaption } from "./due";

const TODAY = "2026-11-25";

describe("dayLabel", () => {
  it("names the day with month, date and weekday", () => {
    expect(dayLabel("2026-11-26")).toBe("11/26(목)");
    expect(dayLabel("2026-12-06")).toBe("12/6(일)");
  });
});

describe("dueCaption", () => {
  it.each([
    ["2026-11-25", false, { text: "11/25(수) · 오늘", tone: "today" }],
    ["2026-11-26", false, { text: "11/26(목) · 내일", tone: "soon" }],
    ["2026-11-28", false, { text: "11/28(토) · 3일 남음", tone: "later" }],
    ["2026-11-23", false, { text: "11/23(월) · 2일 지남", tone: "overdue" }],
    ["2026-11-23", true, { text: "11/23(월)", tone: "done" }],
  ] as const)("%s done=%s", (dueDate, done, expected) => {
    expect(dueCaption(dueDate, TODAY, done)).toEqual(expected);
  });
});
