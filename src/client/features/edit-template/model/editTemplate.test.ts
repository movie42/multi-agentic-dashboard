import { describe, expect, it } from "vitest";
import { addCard, addRoute, blankTemplate, moveCard, removeCard, setKind, setNext, templateProblems, updateRoute } from "./editTemplate";

describe("editTemplate", () => {
  it("keeps one route for a work card and labeled routes for a judge card", () => {
    const two = addCard(addCard(blankTemplate("t")));
    const linked = setNext(setNext(two, "c1", "c2"), "c1", "c3");
    expect(linked.routes).toEqual([{ id: "r1", from: "c1", to: "c3", kind: "next", label: null, prompt: null }]);
    const judge = addRoute(setKind(linked, "c1", "judge"), "c1");
    expect(judge.routes.map((route) => route.label)).toEqual(["", ""]);
    expect(templateProblems(judge)).toHaveLength(2);
    const labeled = updateRoute(updateRoute(judge, "r1", { label: "통과" }), "r2", { label: "고칠 것" });
    expect(templateProblems(labeled)).toEqual([]);
    const afterJudge = { ...labeled, cards: labeled.cards.map((card) => (card.key === "c3" ? { ...card, continueFrom: true } : card)) };
    expect(templateProblems(afterJudge)).toEqual(["'카드 3' 카드는 판단 카드 뒤에 있어서 '앞 카드 세션에 이어서'를 쓸 수 없어요."]);
    expect(setKind(labeled, "c1", "work").routes).toEqual([{ id: "r1", from: "c1", to: "c3", kind: "next", label: null, prompt: null }]);
  });

  it("removes a card with its routes, never the last one, and moves cards", () => {
    const three = setNext(addCard(addCard(blankTemplate("t"))), "c1", "c2");
    expect(removeCard(three, "c2").routes).toEqual([]);
    expect(removeCard(blankTemplate("t"), "c1").cards).toHaveLength(1);
    expect(moveCard(three, "c3", -1).cards.map((card) => card.key)).toEqual(["c1", "c3", "c2"]);
    expect(addCard(removeCard(three, "c2")).cards.map((card) => card.key)).toEqual(["c1", "c3", "c2"]);
  });
});
