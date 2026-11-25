import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TokenTotalView } from "./TokenTotal";

const total = { input: 1_000, output: 9_000, cacheWrite: 20_000, cacheRead: 70_000 };

describe("TokenTotalView", () => {
  it("shows the total of every kind and each kind's share", () => {
    render(<TokenTotalView total={total} />);
    expect(screen.getByText("100,000")).toBeTruthy();
    expect(screen.getByRole("img", { name: /입력 1%.*출력 9%.*캐시 쓰기 20%.*캐시 읽기 70%/ })).toBeTruthy();
  });

  it("says nothing is counted yet before the first close", () => {
    render(<TokenTotalView total={{ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }} />);
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("세션을 닫으면 쓴 토큰이 여기 쌓여요")).toBeTruthy();
  });
});
