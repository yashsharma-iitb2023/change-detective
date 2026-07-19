import { AlertTriangle, FileSearch, Loader2 } from "lucide-react";
import { BLOCK_COMPONENTS } from "@/components/blocks";
import { ContentChangeBlock } from "@/components/blocks/ContentChangeBlock";
import { Markdown } from "@/components/Markdown";
import type { ErrorPayload, StatusPayload } from "@/components/sse-types";
import type { RegionName, RenderSpec } from "@/lib/types";

export type RunPhase = "idle" | "running" | "done" | "error";

const REGION_ORDER: RegionName[] = ["header", "body", "footer"];
const REGION_LABEL: Record<RegionName, string> = { header: "Header", body: "Body", footer: "Footer" };

// The main view. While the agent works it shows a single live line (its current activity) with a
// skeleton of the incoming report beneath — the skeleton lives in the SAME surface the summary
// will fill, so it transitions in place (Claude-chat style) rather than swapping one card for another.
export function ReportView({
  phase,
  statuses,
  error,
  report,
}: {
  phase: RunPhase;
  statuses: (StatusPayload & { ts: number })[];
  error: ErrorPayload | null;
  report: RenderSpec | null;
}) {
  if (phase === "idle" && !report && !error) {
    return (
      <div className="card flex h-full min-h-72 flex-col items-center justify-center gap-3 p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <FileSearch size={24} strokeWidth={1.75} />
        </span>
        <p className="max-w-xs text-[14px] text-muted">
          Run a check and you'll see the agent work here, live — then the change report, organised by
          section with a read on why each change matters.
        </p>
      </div>
    );
  }

  const current = statuses[statuses.length - 1]?.message ?? "Working…";

  const byRegion = report
    ? REGION_ORDER.map((region) => ({ region, blocks: report.blocks.filter((b) => b.region === region) })).filter(
        (g) => g.blocks.length > 0,
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="card p-6">
        {report ? (
          <div className="fade-in">
            <div className="section-label mb-1.5">Summary</div>
            <div className="text-[15.5px] leading-6">
              <Markdown>{report.summary}</Markdown>
            </div>
            <p className="mt-3 truncate text-[12px] text-muted">
              {report.finalUrl} · compared {new Date(report.comparedAt).toLocaleString()}
            </p>
          </div>
        ) : error ? (
          <div className="flex items-start gap-2.5 text-[14px] text-red-600 dark:text-red-400">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{error.message}</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 text-[15px] font-medium text-foreground">
              <Loader2 size={16} className="shrink-0 animate-spin text-accent" />
              <span className="min-w-0 break-words animate-pulse">{current}</span>
            </div>
            <div className="mt-5 flex flex-col gap-2.5">
              {["94%", "99%", "88%", "72%"].map((w, i) => (
                <div key={i} className="skeleton-bar h-3.5 rounded" style={{ width: w }} />
              ))}
            </div>
          </>
        )}
      </div>

      {byRegion.map(({ region, blocks }) => (
        <section key={region} className="fade-in flex flex-col gap-3">
          <h2 className="section-label px-1">{REGION_LABEL[region]}</h2>
          <div className="flex flex-col gap-3">
            {blocks.map((block, i) => {
              const Block = BLOCK_COMPONENTS[block.type] ?? ContentChangeBlock;
              return <Block key={`${region}-${i}`} block={block} />;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
