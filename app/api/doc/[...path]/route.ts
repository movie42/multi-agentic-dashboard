import { reportWarning, services } from "@/server/container";

const STATUS_TEXT = { 403: "not a viewable document", 404: "not found" } as const;

export async function GET(_request: Request, ctx: RouteContext<"/api/doc/[...path]">) {
  const { path: segments } = await ctx.params;
  const requested = "/" + segments.join("/");
  try {
    const file = await services().docs.read(requested);
    if (!file.ok) return new Response(STATUS_TEXT[file.status], { status: file.status });
    return new Response(file.body, { headers: { "Content-Type": file.contentType, "Cache-Control": "no-store" } });
  } catch (error) {
    reportWarning("doc", error, { requested });
    return new Response("unreadable document", { status: 500 });
  }
}
