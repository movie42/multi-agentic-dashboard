"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { postSwitchBranch } from "@/client/entities/git-graph";
import { ContextMenu, MenuItem, MenuSeparator, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import type { SwitchBranchRequest } from "@/common/gitGraph/schema";
import type { GraphCommit } from "@/common/gitGraph/types";

export interface GraphMenuContext {
  worktreePath: string;
  checkedOut: Record<string, string>;
  localBranches: ReadonlySet<string>;
  dirtyCount: number;
  workingCount: number;
}

interface GraphMenuProps {
  at: MenuPoint;
  commit: GraphCommit;
  context: GraphMenuContext;
  onClose: () => void;
  onSwitched: (branch: string) => void;
  onAskAgent: () => void;
}

type MenuView = { kind: "list" } | { kind: "confirm"; request: SwitchBranchRequest; target: string } | { kind: "new" };

const ACTION_BUTTON = "rounded-full px-3 py-1 text-[12px] leading-5 font-semibold disabled:opacity-60";

const localNameOf = (remoteBranch: string) => remoteBranch.slice(remoteBranch.indexOf("/") + 1);

export function GraphMenu({ at, commit, context, onClose, onSwitched, onAskAgent }: GraphMenuProps) {
  const [view, setView] = useState<MenuView>({ kind: "list" });
  const [name, setName] = useState("");
  const switching = useMutation({
    mutationFn: postSwitchBranch,
    onSuccess: (branch) => {
      onClose();
      onSwitched(branch);
    },
  });
  const blocked = context.dirtyCount > 0;
  const { worktreePath, checkedOut } = context;
  const short = commit.sha.slice(0, 7);
  const branches = commit.refs.filter((ref) => ref.kind === "branch");
  const remotes = commit.refs.filter((ref) => ref.kind === "remote");
  const confirm = (request: SwitchBranchRequest, target: string) => {
    switching.reset();
    setView({ kind: "confirm", request, target });
  };

  const working = context.workingCount > 0 && (
    <p className="text-[12px] text-ask">
      이 워크트리에서 작업 중인 세션 {context.workingCount}개가 있어요. 전환하면 에이전트가 보던 파일이 바뀌어요.
    </p>
  );
  const failure = switching.error && <p className="text-[12px] break-words text-accent">{switching.error.message}</p>;

  return (
    <ContextMenu at={at} label={`${short} 커밋 메뉴`} onClose={onClose}>
      {view.kind === "confirm" && (
        <div className="flex w-full flex-col gap-2 p-2">
          <p>
            이 워크트리를 <b className="break-all">{view.target}</b>(으)로 전환할까요?
          </p>
          {working}
          {failure}
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setView({ kind: "list" })} className={`${ACTION_BUTTON} text-muted hover:text-fg`}>
              취소
            </button>
            <button
              type="button"
              autoFocus
              disabled={switching.isPending}
              onClick={() => switching.mutate(view.request)}
              className={`${ACTION_BUTTON} bg-fg text-bg hover:opacity-85`}
            >
              {switching.isPending ? "전환 중…" : "전환"}
            </button>
          </div>
        </div>
      )}

      {view.kind === "new" && (
        <form
          className="flex w-full flex-col gap-2 p-2"
          onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const branch = name.trim();
            if (branch) switching.mutate({ kind: "new", worktreePath, name: branch, from: commit.sha });
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted">{short}에서 만들 브랜치 이름</span>
            <input
              autoFocus
              value={name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
              placeholder="feat/new-branch"
              className="rounded-md bg-tint px-2 py-1 font-mono text-[12px] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
            />
          </label>
          {working}
          {failure}
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setView({ kind: "list" })} className={`${ACTION_BUTTON} text-muted hover:text-fg`}>
              취소
            </button>
            <button type="submit" disabled={switching.isPending || !name.trim()} className={`${ACTION_BUTTON} bg-fg text-bg hover:opacity-85`}>
              {switching.isPending ? "만드는 중…" : "만들고 전환"}
            </button>
          </div>
        </form>
      )}

      {view.kind === "list" && (
        <>
          {blocked && (
            <p className="px-2.5 py-1.5 text-[12px] text-ask">
              커밋 안 한 변경이 {context.dirtyCount}개 있어요. 전환하려면 먼저 커밋하거나 stash해 주세요.
            </p>
          )}
          {branches.map((ref) => {
            const holder = checkedOut[ref.name];
            const elsewhere = holder !== undefined && holder !== worktreePath;
            return (
              <MenuItem
                key={`branch:${ref.name}`}
                disabled={blocked || ref.current || elsewhere}
                hint={ref.current ? "지금 브랜치" : elsewhere ? "다른 워크트리" : undefined}
                onSelect={() => confirm({ kind: "local", worktreePath, branch: ref.name }, ref.name)}
              >
                <span className="break-all">{ref.name}</span>로 전환
              </MenuItem>
            );
          })}
          {remotes
            .filter((ref) => !branches.some((branch) => branch.name === localNameOf(ref.name)))
            .map((ref) => {
              const local = localNameOf(ref.name);
              const hasLocal = context.localBranches.has(local);
              return (
                <MenuItem
                  key={`remote:${ref.name}`}
                  disabled={blocked}
                  hint={hasLocal ? "로컬 브랜치" : "받아서"}
                  onSelect={() =>
                    hasLocal
                      ? confirm({ kind: "local", worktreePath, branch: local }, local)
                      : confirm({ kind: "remote", worktreePath, remoteBranch: ref.name }, `${local} (${ref.name} 추적)`)
                  }
                >
                  <span className="break-all">{hasLocal ? local : ref.name}</span>로 전환
                </MenuItem>
              );
            })}
          <MenuItem
            disabled={blocked}
            onSelect={() => {
              switching.reset();
              setView({ kind: "new" });
            }}
          >
            이 커밋에서 새 브랜치…
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onSelect={() => {
              onClose();
              onAskAgent();
            }}
          >
            에이전트에게 이 커밋으로 말하기
          </MenuItem>
          <MenuItem
            hint={short}
            onSelect={() => {
              onClose();
              void navigator.clipboard.writeText(commit.sha);
            }}
          >
            SHA 복사
          </MenuItem>
        </>
      )}
    </ContextMenu>
  );
}
