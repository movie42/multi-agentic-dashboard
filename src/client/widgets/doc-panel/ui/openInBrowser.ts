import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";

export function openInBrowser(target: string): void {
  postAction({ type: "open-artifact", target, via: "system", worktreePath: "" }).catch((error: unknown) =>
    toastError("action", error, { type: "open-artifact" }),
  );
}
