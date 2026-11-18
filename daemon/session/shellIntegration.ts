import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * zsh reads its startup files from $ZDOTDIR. A shell session points ZDOTDIR at these files, which load
 * the person's own files from $AC_USER_ZDOTDIR first and then add two hooks that print OSC 633 marks
 * (the sequence VS Code's terminal uses): `C;<command line>` when a command starts and `D;<exit code>`
 * when the prompt comes back. Terminals ignore OSC sequences they do not know, so nothing shows on screen.
 */
const SOURCE_USER = (file: string) => `if [[ -f "$AC_USER_ZDOTDIR/${file}" ]]; then
  __ac_zdotdir=$ZDOTDIR
  ZDOTDIR=$AC_USER_ZDOTDIR
  . "$AC_USER_ZDOTDIR/${file}"
  AC_USER_ZDOTDIR=$ZDOTDIR
  ZDOTDIR=$__ac_zdotdir
fi
`;

const HOOKS = `__ac_running=0
__ac_preexec() {
  __ac_running=1
  printf '\\e]633;C;%s\\a' "\${\${1//[[:cntrl:]]/ }[1,200]}"
}
__ac_precmd() {
  local code=$?
  if (( __ac_running )); then
    __ac_running=0
    printf '\\e]633;D;%s\\a' "$code"
  fi
}
autoload -Uz add-zsh-hook
add-zsh-hook preexec __ac_preexec
# First in line so $? is still the command's exit code.
precmd_functions=(__ac_precmd \${precmd_functions:#__ac_precmd})
printf '\\e]633;A\\a'
`;

export const ZSH_FILES: Readonly<Record<string, string>> = {
  ".zshenv": SOURCE_USER(".zshenv"),
  ".zprofile": SOURCE_USER(".zprofile"),
  ".zshrc": SOURCE_USER(".zshrc") + HOOKS,
  // The last startup file: hand ZDOTDIR back so anything run later sees the person's own.
  ".zlogin": `${SOURCE_USER(".zlogin")}ZDOTDIR=$AC_USER_ZDOTDIR\n`,
};

export async function writeZshIntegration(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await Promise.all(Object.entries(ZSH_FILES).map(([name, body]) => writeFile(path.join(dir, name), body)));
}

export function isZsh(shell: string): boolean {
  return path.basename(shell) === "zsh";
}

export type ShellMark = { kind: "ready" } | { kind: "start"; command: string } | { kind: "end"; code: number };

const MARK = /\x1b\]633;([ACD])(?:;([^\x07]*))?\x07/g;
const MARK_START = "\x1b]633;";
const MAX_CARRY = 512;

/** Reads the marks out of a chunk of output; an unfinished mark at the end is carried into the next chunk. */
export function readShellMarks(carry: string, data: string): { marks: ShellMark[]; carry: string } {
  const text = carry + data;
  const marks = [...text.matchAll(MARK)].flatMap((match): ShellMark[] => {
    if (match[1] === "A") return [{ kind: "ready" }];
    if (match[1] === "C") return [{ kind: "start", command: (match[2] ?? "").trim() }];
    const code = Number(match[2]);
    return Number.isInteger(code) ? [{ kind: "end", code }] : [];
  });
  const lastEnd = text.lastIndexOf("\x07");
  const open = text.lastIndexOf(MARK_START);
  const tail = open > lastEnd ? text.slice(open) : partialPrefix(text);
  return { marks, carry: tail.length <= MAX_CARRY ? tail : "" };
}

/** The end of `text` when it is the first few bytes of a mark, cut between two chunks. */
function partialPrefix(text: string): string {
  const sizes = Array.from({ length: Math.min(MARK_START.length - 1, text.length) }, (_, index) => index + 1).reverse();
  const size = sizes.find((candidate) => MARK_START.startsWith(text.slice(-candidate)));
  return size ? text.slice(-size) : "";
}
