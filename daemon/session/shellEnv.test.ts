import { describe, expect, it } from "vitest";
import { parseShellEnv } from "./shellEnv.ts";

describe("parseShellEnv", () => {
  it("reads variables between the markers, ignoring what shell startup files printed", () => {
    const stdout = "welcome banner\n__RUNNER_ENV_START__PATH=/a:/b\0EMPTY=\0MULTI=line1\nline2\0WITH_EQ=a=b\0__RUNNER_ENV_END__bye";
    expect(parseShellEnv(stdout)).toEqual({ PATH: "/a:/b", EMPTY: "", MULTI: "line1\nline2", WITH_EQ: "a=b" });
  });

  it("returns null when the shell never printed the markers", () => {
    expect(parseShellEnv("zsh: command not found")).toBeNull();
  });
});
