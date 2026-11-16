import type { CardKind, TemplateCard, TemplateRoute, WorkflowTemplate } from "@/common/templates/types";

export function blankCard(key: string, title: string): TemplateCard {
  return { key, title, prompt: "", kind: "work", model: null, effort: null, continueFrom: false, pauseAfter: false, check: null };
}

export function blankTemplate(id: string): WorkflowTemplate {
  return { id, name: "새 템플릿", cards: [blankCard("c1", "카드 1")], routes: [], updatedAt: 0 };
}

const freshKey = (taken: string[], prefix: string) => {
  const used = new Set(taken);
  return `${prefix}${Array.from({ length: taken.length + 2 }, (_, index) => index + 1).find((index) => !used.has(`${prefix}${index}`))}`;
};

export function addCard(template: WorkflowTemplate): WorkflowTemplate {
  const key = freshKey(template.cards.map((card) => card.key), "c");
  return { ...template, cards: [...template.cards, blankCard(key, `카드 ${template.cards.length + 1}`)] };
}

export function removeCard(template: WorkflowTemplate, key: string): WorkflowTemplate {
  if (template.cards.length <= 1) return template;
  return {
    ...template,
    cards: template.cards.filter((card) => card.key !== key),
    routes: template.routes.filter((route) => route.from !== key && route.to !== key),
  };
}

export function moveCard(template: WorkflowTemplate, key: string, offset: -1 | 1): WorkflowTemplate {
  const index = template.cards.findIndex((card) => card.key === key);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= template.cards.length) return template;
  const cards = [...template.cards];
  const [moved] = cards.splice(index, 1);
  if (moved) cards.splice(target, 0, moved);
  return { ...template, cards };
}

export function updateCard(template: WorkflowTemplate, key: string, patch: Partial<Omit<TemplateCard, "key">>): WorkflowTemplate {
  return { ...template, cards: template.cards.map((card) => (card.key === key ? { ...card, ...patch } : card)) };
}

export function setKind(template: WorkflowTemplate, key: string, kind: CardKind): WorkflowTemplate {
  const own = template.routes.filter((route) => route.from === key);
  const others = template.routes.filter((route) => route.from !== key);
  const kept = kind === "work" ? own.slice(0, 1).map((route) => ({ ...route, label: null })) : own.map((route) => ({ ...route, label: route.label ?? "" }));
  const updated = updateCard(template, key, kind === "judge" ? { kind, continueFrom: false } : { kind });
  return { ...updated, routes: [...others, ...kept] };
}

export function setNext(template: WorkflowTemplate, key: string, to: string | null): WorkflowTemplate {
  const others = template.routes.filter((route) => route.from !== key);
  if (!to || to === key) return { ...template, routes: others };
  const id = freshKey(others.map((route) => route.id), "r");
  return { ...template, routes: [...others, { id, from: key, to, label: null }] };
}

export function addRoute(template: WorkflowTemplate, key: string): WorkflowTemplate {
  const to = template.cards.find((card) => card.key !== key)?.key;
  if (!to) return template;
  const id = freshKey(template.routes.map((route) => route.id), "r");
  return { ...template, routes: [...template.routes, { id, from: key, to, label: "" }] };
}

export function updateRoute(template: WorkflowTemplate, id: string, patch: Partial<Pick<TemplateRoute, "to" | "label">>): WorkflowTemplate {
  return { ...template, routes: template.routes.map((route) => (route.id === id ? { ...route, ...patch } : route)) };
}

export function removeRoute(template: WorkflowTemplate, id: string): WorkflowTemplate {
  return { ...template, routes: template.routes.filter((route) => route.id !== id) };
}

export function templateProblems(template: WorkflowTemplate): string[] {
  const titles = new Map(template.cards.map((card) => [card.key, card.title]));
  return [
    template.name.trim() ? null : "템플릿 이름을 적어 주세요.",
    ...template.cards.map((card) => (card.kind === "judge" && !template.routes.some((route) => route.from === card.key) ? `판단 카드 '${card.title}'에 나가는 길이 없어요.` : null)),
    ...template.routes.map((route) => {
      const from = template.cards.find((card) => card.key === route.from);
      return from?.kind === "judge" && !route.label?.trim() ? `'${titles.get(route.from)}' → '${titles.get(route.to)}' 길에 조건 글을 적어 주세요.` : null;
    }),
  ].flatMap((problem) => (problem ? [problem] : []));
}
