// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { injectLinkScript } from "./injectLinkScript";

function runInjected() {
  const html = injectLinkScript("<head></head>");
  const code = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"));
  new Function(code)();
}

describe("flow save mirror", () => {
  afterEach(() => vi.useRealTimers());

  it("posts flow answers once writes settle and ignores other keys", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, count: 1 })));
    vi.stubGlobal("fetch", fetchMock);
    runInjected();
    localStorage.setItem("other", "x");
    localStorage.setItem("flow:/api/doc/w/docs/d/t/", '{"answers":{}}');
    localStorage.setItem("flow:/api/doc/w/docs/d/t/", '{"answers":{"R1-Q1":{}}}');
    expect(localStorage.getItem("other")).toBe("x");
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/flow-answers");
    expect(JSON.parse(String(init.body))).toEqual({ page: location.pathname, state: '{"answers":{"R1-Q1":{}}}' });
    localStorage.removeItem("flow:/api/doc/w/docs/d/t/");
    await vi.advanceTimersByTimeAsync(500);
    expect(JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body)).state).toBeNull();
  });
});
