import { z } from "zod";
import { reportWarning, services } from "@/server/container";

const DOC_ROUTE = "/api/doc";

const bodySchema = z.object({
  /** The page's location.pathname inside the document panel: /api/doc/<absolute file path>. */
  page: z.string().startsWith(DOC_ROUTE + "/"),
  state: z.string().max(2_000_000).nullable(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid body" }, { status: 400 });
  const page = parsed.data.page.slice(DOC_ROUTE.length).split("/").map(decodeURIComponent).join("/");
  try {
    const result = await services().flowAnswers.save(page, parsed.data.state);
    if (!result.ok) return Response.json({ ok: false, error: result.reason }, { status: result.reason === "not-a-doc" ? 403 : 400 });
    return Response.json(result);
  } catch (error) {
    reportWarning("flow-answers", error, { page });
    return Response.json({ ok: false, error: "could not save" }, { status: 500 });
  }
}
