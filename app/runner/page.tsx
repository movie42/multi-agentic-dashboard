import type { Metadata } from "next";
import { RunnerView } from "@/client/views/runner";

export const metadata: Metadata = { title: "세션 러너 · Agent Control" };

export default function RunnerPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-5 pt-8 md:px-10">
      <RunnerView />
    </div>
  );
}
