import { MAX_TEMPLATE_DRAFT, templatesOf } from "@/common/templates/types";
import { services } from "@/server/container";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const description = isRecord(body) && typeof body.description === "string" ? body.description.trim() : "";
  if (!description || description.length > MAX_TEMPLATE_DRAFT) {
    return Response.json({ ok: false, error: "만들 흐름을 한 줄로 적어 주세요." }, { status: 400 });
  }
  try {
    const template = await services().draftTemplate(description, templatesOf({ templates: isRecord(body) ? body.examples : [] }));
    return Response.json({ ok: true, template });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[template-draft]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
