import "server-only";
import { nodeExecFile, nodeFileSystem, type ReportFn } from "@/server/shared/ports";
import { FeatureCheckRunner } from "./FeatureCheckRunner";
import { FeatureDocReader } from "./FeatureDocReader";
import { FlowDocReader } from "./FlowDocReader";
import { GitInfo } from "./GitInfo";

export interface WorkflowServices {
  git: GitInfo;
  flowDocs: FlowDocReader;
  featureDocs: FeatureDocReader;
  featureChecks: FeatureCheckRunner;
}

export interface Reporters {
  warn: ReportFn;
  error: ReportFn;
}

export function createWorkflowServices({ warn, error }: Reporters): WorkflowServices {
  const git = new GitInfo({ execFile: nodeExecFile, fs: nodeFileSystem, warn });
  const featureChecks = new FeatureCheckRunner({ execFile: nodeExecFile, warn, error });
  return {
    git,
    flowDocs: new FlowDocReader(nodeFileSystem, warn),
    featureDocs: new FeatureDocReader({
      fs: nodeFileSystem,
      warn,
      pullRequestOf: (worktreePath, branch) => git.getPullRequest(worktreePath, branch),
      checkOf: (featureId) => featureChecks.get(featureId),
    }),
    featureChecks,
  };
}
