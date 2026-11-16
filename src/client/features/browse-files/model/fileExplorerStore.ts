import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface FileExplorerState {
  /** The worktree the tree shows; switching worktrees switches the tree. */
  root: string | null;
  treeOpen: boolean;
  /** Expanded folders per worktree, as absolute paths. */
  expanded: Record<string, string[]>;
  show: (root: string) => void;
  hide: () => void;
  toggleDir: (dir: string) => void;
  setExpanded: (dir: string, open: boolean) => void;
  /** Expands every folder between the root and `file`. */
  reveal: (file: string) => void;
}

function ancestorsOf(file: string, root: string): string[] {
  if (!file.startsWith(root + "/")) return [];
  const parts = file.slice(root.length + 1).split("/").slice(0, -1);
  return parts.map((_, index) => `${root}/${parts.slice(0, index + 1).join("/")}`);
}

export const useFileExplorerStore = create<FileExplorerState>()(
  persist(
    (set) => ({
      root: null,
      treeOpen: false,
      expanded: {},
      show: (root) => set({ root, treeOpen: true }),
      hide: () => set({ treeOpen: false }),
      toggleDir: (dir) =>
        set((state) => {
          if (!state.root) return {};
          const current = state.expanded[state.root] ?? [];
          const next = current.includes(dir) ? current.filter((item) => item !== dir) : [...current, dir];
          return { expanded: { ...state.expanded, [state.root]: next } };
        }),
      setExpanded: (dir, open) =>
        set((state) => {
          if (!state.root) return {};
          const current = state.expanded[state.root] ?? [];
          if (current.includes(dir) === open) return {};
          const next = open ? [...current, dir] : current.filter((item) => item !== dir);
          return { expanded: { ...state.expanded, [state.root]: next } };
        }),
      reveal: (file) =>
        set((state) => {
          if (!state.root) return {};
          const current = state.expanded[state.root] ?? [];
          const missing = ancestorsOf(file, state.root).filter((dir) => !current.includes(dir));
          if (missing.length === 0) return {};
          return { expanded: { ...state.expanded, [state.root]: [...current, ...missing] } };
        }),
    }),
    {
      name: "agent-control:file-explorer",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ root: state.root, treeOpen: state.treeOpen, expanded: state.expanded }),
      skipHydration: true,
    },
  ),
);
