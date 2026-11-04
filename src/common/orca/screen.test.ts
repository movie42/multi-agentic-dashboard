import { describe, expect, it } from "vitest";
import { parseChoicePrompt } from "./screen";

describe("parseChoicePrompt", () => {
  it("reads the last option block, its question and context", () => {
    const lines = [
      "╭──────────╮",
      "│ Bash command │",
      "│ rm -rf dist │",
      "",
      "│ Do you want to proceed? │",
      "│ ❯ 1. Yes │",
      "│   2. Yes, and don't ask again │",
      "│   3. No │",
      "╰──────────╯",
    ];
    expect(parseChoicePrompt(lines)).toEqual({
      question: "Do you want to proceed?",
      context: ["Bash command", "rm -rf dist"],
      options: [
        { number: 1, label: "Yes", selected: true },
        { number: 2, label: "Yes, and don't ask again", selected: false },
        { number: 3, label: "No", selected: false },
      ],
    });
  });

  it("returns null without a selected marker or with a single option", () => {
    expect(parseChoicePrompt(["Pick", "  1. a", "  2. b"])).toBeNull();
    expect(parseChoicePrompt(["Pick", "❯ 1. a"])).toBeNull();
    expect(parseChoicePrompt(["no options here"])).toBeNull();
  });

  it("accepts › and > as the selection marker", () => {
    expect(parseChoicePrompt(["Q", "› 1. a", "  2. b"])?.options[0]?.selected).toBe(true);
    expect(parseChoicePrompt(["Q", "  1. a", "> 2. b"])?.options[1]?.selected).toBe(true);
  });

  it("has no question when only frames sit above", () => {
    expect(parseChoicePrompt(["────", "❯ 1. a", "  2. b"])?.question).toBeNull();
  });
});
