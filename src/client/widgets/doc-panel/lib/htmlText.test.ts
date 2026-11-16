import { describe, expect, it } from "vitest";
import { htmlText } from "./htmlText";

describe("htmlText", () => {
  it("drops tags and decodes entities", () => {
    expect(htmlText('<span style="--a:1">if (a &lt; b &amp;&amp; c)</span><span>&#39;x&#x27;</span>')).toBe("if (a < b && c)'x'");
  });
});
