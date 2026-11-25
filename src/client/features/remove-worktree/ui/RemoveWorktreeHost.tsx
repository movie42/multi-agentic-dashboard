"use client";

import { Modal } from "@/client/shared/ui/Modal";
import { useRemoveWorktreeRequest } from "../model/removeWorktreeRequest";
import { RemoveWorktree } from "./RemoveWorktree";

export function RemoveWorktreeHost() {
  const request = useRemoveWorktreeRequest((state) => state.request);
  const clear = useRemoveWorktreeRequest((state) => state.clear);
  if (!request) return null;
  return (
    <Modal label="워크트리 삭제" onClose={clear}>
      <h2 className="text-[15px] font-semibold">워크트리 삭제</h2>
      <RemoveWorktree key={request.worktree.path} worktree={request.worktree} sessionCount={request.sessionCount} onCancel={clear} />
    </Modal>
  );
}
