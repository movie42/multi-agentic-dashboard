import { create } from "zustand";

export type CardView = "chat" | "terminal" | "history";

export interface PickedView {
  view: CardView;
  request: number;
}

interface CardViews {
  picked: Record<string, PickedView>;
  pick: (cardId: string, picked: PickedView) => void;
}

const useCardViews = create<CardViews>((set) => ({
  picked: {},
  pick: (cardId, picked) => set((state) => ({ picked: { ...state.picked, [cardId]: picked } })),
}));

export function useCardView(cardId: string): [PickedView | null, (picked: PickedView) => void] {
  const picked = useCardViews((state) => state.picked[cardId] ?? null);
  return [picked, (next) => useCardViews.getState().pick(cardId, next)];
}
