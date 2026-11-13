import "server-only";
import { nodeExecFile, nodeFileSystem, type ReportFn } from "@/server/shared/ports";
import { FeatureDocReader } from "./FeatureDocReader";
import { FlowDocReader } from "./FlowDocReader";
import { GitInfo } from "./GitInfo";
import { JiraInfo } from "./JiraInfo";

export interface WorkflowServices {
  git: GitInfo;
  jira: JiraInfo;
  flowDocs: FlowDocReader;
  featureDocs: FeatureDocReader;
}

export interface Reporters {
  warn: ReportFn;
  error: ReportFn;
}

export function createWorkflowServices({ warn }: Reporters): WorkflowServices {
  const git = new GitInfo({ execFile: nodeExecFile, fs: nodeFileSystem, warn });
  return {
    git,
    jira: new JiraInfo({ execFile: nodeExecFile, warn }),
    flowDocs: new FlowDocReader(nodeFileSystem, warn),
    featureDocs: new FeatureDocReader({
      fs: nodeFileSystem,
      warn,
      pullRequestOf: (worktreePath, branch) => git.getPullRequest(worktreePath, branch),
    }),
  };
}
