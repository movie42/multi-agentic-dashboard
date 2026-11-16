import { isViewableDoc } from "@/client/features/view-doc";
import { DocWindow } from "./DocWindow";
import { FileWindow } from "./FileWindow";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface DocContentProps {
  searchParams: SearchParams;
}

export async function DocContent({ searchParams }: DocContentProps) {
  const { path, file } = await searchParams;
  const fileTarget = Array.isArray(file) ? file[0] : file;
  if (fileTarget?.startsWith("/")) return <FileWindow file={fileTarget} />;
  const target = Array.isArray(path) ? path[0] : path;
  if (!target || !isViewableDoc(target)) {
    return (
      <p className="px-5 py-10 text-[14px] text-muted">
        주소의 <code>path</code>가 <code>docs/</code> 아래 HTML 문서가 아니에요. 보드에서 &apos;문서 열기&apos;로 열어 주세요.
      </p>
    );
  }
  return <DocWindow target={target} />;
}
