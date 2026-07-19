import type { TrailPayload } from "@/components/sse-types";

export function AgentTrail({ entries, loading = false }: { entries: TrailPayload[]; loading?: boolean }) {
  return (
    <div className="card p-5">
      <h2 className="section-label mb-3 block">Agent trail</h2>

      {entries.length === 0 ? (
        loading ? (
          <ol className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex gap-3">
                <span className="skeleton-bar mt-0.5 h-5 w-5 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="skeleton-bar h-3.5 w-2/3 rounded" />
                  <div className="skeleton-bar h-3 w-full rounded" />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[13px] text-muted">
            Reasoning steps will appear here as the agent works.
          </p>
        )
      ) : (
        <ol className="flex flex-col gap-4">
          {entries.map((e) => (
            <li key={e.step} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent">
                {e.step}
              </span>
              <div className="min-w-0">
                <p className="break-words text-[13px] font-medium text-foreground">
                  {e.action}
                </p>
                <p className="mt-0.5 break-words text-[13px] leading-5 text-muted">
                  {e.reasoning}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
