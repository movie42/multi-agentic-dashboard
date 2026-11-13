export interface LayoutInput {
  sha: string;
  parents: string[];
}

export type Anchor = "top" | "mid" | "bottom";

/** One line inside a row, between two lane positions; `lane` picks its color. */
export interface Segment {
  fromLane: number;
  from: Anchor;
  toLane: number;
  to: Anchor;
  lane: number;
}

export interface RowLayout {
  lane: number;
  segments: Segment[];
}

export interface GraphLayout {
  rows: RowLayout[];
  laneCount: number;
}

function freeLane(lanes: (string | null)[], taken: number): number {
  const index = lanes.findIndex((value, at) => value === null && at !== taken);
  return index === -1 ? Math.max(lanes.length, taken + 1) : index;
}

/**
 * Assigns each commit (in topological order, children first) a lane and the lines that cross its row.
 * A lane holds the sha it is waiting for; lanes never shift sideways, so a passing lane is a straight line.
 */
export function layoutGraph(commits: LayoutInput[]): GraphLayout {
  const lanes: (string | null)[] = [];
  const widths: number[] = [];
  const rows = commits.map((commit): RowLayout => {
    const waitingAt = lanes.indexOf(commit.sha);
    const lane = waitingAt === -1 ? freeLane(lanes, -1) : waitingAt;
    const before = [...lanes];
    const segments: Segment[] = [];

    before.forEach((waiting, index) => {
      if (waiting === null) return;
      if (waiting === commit.sha) {
        segments.push({ fromLane: index, from: "top", toLane: lane, to: "mid", lane: index });
        if (index !== lane) lanes[index] = null;
      } else {
        segments.push({ fromLane: index, from: "top", toLane: index, to: "bottom", lane: index });
      }
    });

    const [first, ...rest] = commit.parents;
    lanes[lane] = first ?? null;
    if (first !== undefined) segments.push({ fromLane: lane, from: "mid", toLane: lane, to: "bottom", lane });
    for (const parent of rest) {
      const existing = lanes.indexOf(parent);
      const target = existing === -1 ? freeLane(lanes, lane) : existing;
      if (existing === -1) lanes[target] = parent;
      segments.push({ fromLane: lane, from: "mid", toLane: target, to: "bottom", lane: target });
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    widths.push(lane + 1, lanes.length, before.length);
    return { lane, segments };
  });
  return { rows, laneCount: Math.max(0, ...widths) };
}
