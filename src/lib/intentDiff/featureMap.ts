import path from "node:path";
import type { Attribution } from "./attribute";
import type { LoadedPlan } from "./plan";
import type { FeatureCluster, FeatureFile, FeatureMap, FileDiff, FileOwner, IntentGroup } from "./types";

export function ownersByHunk(attribution: Attribution): Map<string, FileOwner> {
  const owners = new Map<string, FileOwner>();
  const claim = (groups: IntentGroup[], owner: (group: IntentGroup) => FileOwner) => {
    for (const group of groups) for (const ref of group.hunks) owners.set(ref.hunkId, owner(group));
  };
  for (const phase of attribution.plan?.phases ?? []) {
    for (const item of phase.items) {
      claim(item.groups, () => ({ kind: "item", id: item.id, label: `${item.id} ${item.title}` }));
    }
  }
  claim(attribution.groups, (group) => ({ kind: "intent", id: group.id, label: group.title }));
  claim(attribution.unplanned, () => ({ kind: "unplanned", id: "unplanned", label: "계획 밖" }));
  for (const ref of attribution.mechanical) owners.set(ref.hunkId, { kind: "mechanical", id: "mechanical", label: "기계적" });
  for (const ref of attribution.unknown) owners.set(ref.hunkId, { kind: "unknown", id: "unknown", label: "의도 미상" });
  return owners;
}

function phaseOf(itemId: string): string {
  return itemId.split("-")[0];
}

/**
 * Groups the changed files into features: files linked by imports, in either direction, belong to
 * the same feature. Each feature is read from its entries — the files no other changed file
 * imports, such as a page, a route or a screen that mounts the new parts.
 */
export function buildFeatureMap(
  files: FileDiff[],
  graph: Map<string, string[]>,
  ranks: Map<string, number>,
  attribution: Attribution,
  plan: LoadedPlan | null,
): FeatureMap {
  const owners = ownersByHunk(attribution);
  const nodes: Record<string, FeatureFile> = {};
  for (const diff of files) {
    const lines = diff.hunks.flatMap((hunk) => hunk.lines);
    const fileOwners: FileOwner[] = [];
    for (const hunk of diff.hunks) {
      const owner = owners.get(hunk.id);
      if (owner && !fileOwners.some((known) => known.kind === owner.kind && known.id === owner.id)) fileOwners.push(owner);
    }
    nodes[diff.file] = {
      file: diff.file,
      imports: graph.get(diff.file) ?? [],
      importedBy: [],
      hunkIds: diff.hunks.map((hunk) => hunk.id),
      owners: fileOwners,
      added: lines.filter((line) => line.kind === "add").length,
      removed: lines.filter((line) => line.kind === "del").length,
    };
  }
  for (const node of Object.values(nodes)) {
    for (const target of node.imports) nodes[target]?.importedBy.push(node.file);
  }

  const seen = new Set<string>();
  const clusters: FeatureCluster[] = [];
  const loose: string[] = [];
  for (const start of Object.keys(nodes).sort()) {
    if (seen.has(start)) continue;
    const members: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const file = queue.shift() as string;
      members.push(file);
      for (const next of [...nodes[file].imports, ...nodes[file].importedBy]) {
        if (!seen.has(next) && nodes[next]) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    if (members.length === 1) {
      loose.push(start);
      continue;
    }
    const roots = members.filter((file) => nodes[file].importedBy.length === 0);
    const topRank = Math.max(...members.map((file) => ranks.get(file) ?? 0));
    const entries = (roots.length > 0 ? roots : members.filter((file) => (ranks.get(file) ?? 0) === topRank)).sort(
      (a, b) => (ranks.get(b) ?? 0) - (ranks.get(a) ?? 0) || a.localeCompare(b),
    );
    clusters.push({ id: `feature-${clusters.length + 1}`, title: "", entries, files: members.sort(), phases: [] });
  }

  const phaseTitle = new Map(plan?.phases.map((phase) => [phase.id, phase.title]) ?? []);
  for (const cluster of clusters) {
    const counts = new Map<string, number>();
    for (const file of cluster.files) {
      for (const hunkId of nodes[file].hunkIds) {
        const owner = owners.get(hunkId);
        if (owner?.kind === "item") counts.set(phaseOf(owner.id), (counts.get(phaseOf(owner.id)) ?? 0) + 1);
      }
    }
    cluster.phases = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([phase]) => phase);
    const top = cluster.phases[0];
    cluster.title =
      top && phaseTitle.get(top)
        ? (phaseTitle.get(top) as string)
        : cluster.entries.map((file) => path.posix.basename(file)).join(" · ");
  }
  clusters.sort((a, b) => b.files.length - a.files.length);

  return { files: nodes, clusters, loose: loose.sort() };
}
