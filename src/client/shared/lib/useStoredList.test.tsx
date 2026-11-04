import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { parseList, useStoredListStore } from "./storedListStore";
import { useStoredList } from "./useStoredList";

interface ProbeProps {
  storageKey: string;
}

function Probe({ storageKey }: ProbeProps) {
  const [list, write] = useStoredList(storageKey);
  return (
    <button type="button" onClick={() => write([...list, `n${list.length}`])}>
      {list.join(",") || "empty"}
    </button>
  );
}

afterEach(() => {
  window.localStorage.clear();
  useStoredListStore.setState({ lists: {} });
});

describe("useStoredList", () => {
  it("loads the saved list after mount and writes it back in the same format", async () => {
    window.localStorage.setItem("k", JSON.stringify(["a", 1, "b"]));
    render(<Probe storageKey="k" />);
    expect(screen.getByRole("button").textContent).toBe("a,b");
    await userEvent.click(screen.getByRole("button"));
    expect(window.localStorage.getItem("k")).toBe(JSON.stringify(["a", "b", "n2"]));
  });

  it("keeps two components on the same key in sync", async () => {
    render(
      <>
        <Probe storageKey="shared" />
        <Probe storageKey="shared" />
      </>,
    );
    const [first] = screen.getAllByRole("button");
    if (!first) throw new Error("no button");
    await userEvent.click(first);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["n0", "n0"]);
  });

  it("follows changes made in another tab", () => {
    render(<Probe storageKey="tab" />);
    act(() => {
      window.localStorage.setItem("tab", JSON.stringify(["remote"]));
      window.dispatchEvent(new StorageEvent("storage", { key: "tab" }));
    });
    expect(screen.getByRole("button").textContent).toBe("remote");
  });
});

describe("parseList", () => {
  it("drops non-strings and survives broken JSON", () => {
    expect(parseList('["x", 2]')).toEqual(["x"]);
    expect(parseList("{oops")).toEqual([]);
    expect(parseList(null)).toEqual([]);
  });
});
