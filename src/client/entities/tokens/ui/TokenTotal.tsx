"use client";

import { useQuery } from "@tanstack/react-query";
import { sumTokens, type TokenCounts } from "@/common/tokens/types";
import { errorMessage } from "@/client/shared/model/errorMessage";
import { tokenTallyQueryOptions } from "../api/tokenQuery";
import { formatTokens, TOKEN_KINDS } from "../model/kinds";

interface TokenTotalViewProps {
  total: TokenCounts;
}

export function TokenTotalView({ total }: TokenTotalViewProps) {
  const sum = sumTokens(total);
  const widths = TOKEN_KINDS.map((kind) => (sum > 0 ? (total[kind.key] / sum) * 100 : 0));
  const shares = TOKEN_KINDS.map((kind, index) => ({
    ...kind,
    percent: Math.round(widths[index] ?? 0),
    width: widths[index] ?? 0,
    start: widths.slice(0, index).reduce((left, width) => left + width, 0),
  }));
  return (
    <div>
      <p className="text-[18px] leading-tight font-bold tracking-[-0.015em] tabular-nums">
        {formatTokens(sum)}
      </p>
      {sum > 0 ? (
        <svg
          role="img"
          aria-label={shares.map((share) => `${share.label} ${share.percent}%`).join(", ")}
          viewBox="0 0 100 1"
          preserveAspectRatio="none"
          className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full"
        >
          {shares.map((share) => (
            <rect key={share.key} x={share.start} width={share.width} height={1} className={share.fill}>
              <title>{`${share.label} ${formatTokens(total[share.key])}`}</title>
            </rect>
          ))}
        </svg>
      ) : (
        <p className="mt-1 text-[11px] text-muted">세션을 닫으면 쓴 토큰이 여기 쌓여요</p>
      )}
    </div>
  );
}

export function TokenTotal() {
  const tally = useQuery(tokenTallyQueryOptions());
  if (tally.isPending) return <p className="text-[12px] text-muted">토큰 수 확인 중…</p>;
  if (tally.isError) return <p className="text-[12px] text-muted">{`토큰 수를 못 읽었어요 · ${errorMessage(tally.error)}`}</p>;
  return <TokenTotalView total={tally.data.total} />;
}
