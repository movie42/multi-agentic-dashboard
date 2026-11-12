import { describe, expect, it } from "vitest";
import { injectLinkScript } from "./injectLinkScript";

describe("injectLinkScript", () => {
  it("puts the script right after the opening head tag", () => {
    const out = injectLinkScript('<html><head lang="ko"><title>t</title></head></html>');
    expect(out.startsWith('<html><head lang="ko"><script>')).toBe(true);
    expect(out).toContain("</script><title>t</title>");
  });

  it("prepends the script when there is no head", () => {
    expect(injectLinkScript("<p>x</p>").endsWith("</script><p>x</p>")).toBe(true);
  });
});
