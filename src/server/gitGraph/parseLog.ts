import type { GraphCommit, GraphRef } from "@/common/gitGraph/types";

export const FIELD = "\x1f";
export const RECORD = "\x1e";
/** `%D` with `--decorate=full`, so local branches with slashes stay apart from remote ones. */
export const LOG_FORMAT = ["%H", "%P", "%an", "%at", "%D", "%s"].join("%x1f") + "%x1e";

const LOCAL = "refs/heads/";
const REMOTE = "refs/remotes/";
const TAG = "tag: refs/tags/";

export function parseRefs(decoration: string): GraphRef[] {
  const refs: GraphRef[] = [];
  for (const raw of decoration.split(", ").map((part) => part.trim()).filter(Boolean)) {
    if (raw === "HEAD") refs.push({ kind: "head", name: "HEAD", current: true });
    else if (raw.startsWith(`HEAD -> ${LOCAL}`)) refs.push({ kind: "branch", name: raw.slice(`HEAD -> ${LOCAL}`.length), current: true });
    else if (raw.startsWith(LOCAL)) refs.push({ kind: "branch", name: raw.slice(LOCAL.length), current: false });
    else if (raw.startsWith(REMOTE)) {
      const name = raw.slice(REMOTE.length);
      if (!name.endsWith("/HEAD")) refs.push({ kind: "remote", name, current: false });
    } else if (raw.startsWith(TAG)) refs.push({ kind: "tag", name: raw.slice(TAG.length), current: false });
  }
  return refs;
}

export function parseLog(stdout: string): GraphCommit[] {
  return stdout
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record.length > 0)
    .map((record) => {
      const [sha = "", parents = "", author = "", time = "0", decoration = "", ...subject] = record.split(FIELD);
      return {
        sha,
        parents: parents.split(" ").filter(Boolean),
        author,
        time: Number(time) * 1000,
        subject: subject.join(FIELD),
        refs: parseRefs(decoration),
      };
    });
}
