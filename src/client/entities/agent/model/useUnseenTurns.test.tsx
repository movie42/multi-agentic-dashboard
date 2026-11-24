import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { agentCard } from "../../../../../test/fixtures";
import { useUnseenTurns } from "./useUnseenTurns";

const turn = agentCard({ id: "a", state: "done", stateSince: 2_000 });

function Probe() {
  const { isUnseen } = useUnseenTurns();
  return <span data-unseen={String(isUnseen(turn))} />;
}

describe("useUnseenTurns", () => {
  afterEach(() => window.localStorage.clear());

  it("renders nothing unseen on the server, then lights up once hydrated", async () => {
    window.localStorage.setItem("agent-control:seen-turns-since", "1");
    const html = renderToString(<Probe />);
    expect(html).toContain('data-unseen="false"');

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    await act(async () => {
      hydrateRoot(container, <Probe />);
    });
    expect(container.querySelector("span")?.dataset.unseen).toBe("true");
    container.remove();
  });
});
