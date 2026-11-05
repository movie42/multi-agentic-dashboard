import { connection } from "next/server";
import { Suspense } from "react";
import type { BoardSnapshot } from "@/common/orca/types";
import { Dashboard, DashboardLoading } from "@/client/views/dashboard";
import { reportWarning, services } from "@/server/container";

async function loadInitialBoard(): Promise<BoardSnapshot | null> {
  try {
    return await services().orca.board.load();
  } catch (error) {
    reportWarning("board", error, { step: "initial snapshot" });
    return null;
  }
}

async function BoardEntry() {
  await connection();
  const initialBoard = await loadInitialBoard();
  return <Dashboard initialBoard={initialBoard} />;
}

export default function Home() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <BoardEntry />
    </Suspense>
  );
}
