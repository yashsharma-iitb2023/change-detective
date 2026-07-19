import { ArrowRight, Gauge } from "lucide-react";
import type { RenderBlock } from "@/lib/types";
import { BeforeAfter, BlockShell } from "./BlockShell";

export function MetricChangeBlock({ block }: { block: RenderBlock }) {
  // The big centered "before → after" only reads well for short values. Long blobs
  // (e.g. a whole table the model tagged as a metric) fall back to the compact pair.
  const short =
    (block.before?.length ?? 0) <= 48 && (block.after?.length ?? 0) <= 48;
  return (
    <BlockShell
      icon={Gauge}
      tone="info"
      region={block.region}
      title={block.title}
      changeType={block.changeType}
      significance={block.significance}
    >
      {short ? (
        <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl bg-accent/[0.06] py-4">
          <span className="text-xl font-semibold tabular-nums text-muted line-through decoration-muted/50">
            {block.before ?? "—"}
          </span>
          <ArrowRight size={18} className="text-accent" />
          <span className="text-xl font-semibold tabular-nums text-accent">
            {block.after ?? "—"}
          </span>
        </div>
      ) : (
        <BeforeAfter before={block.before} after={block.after} />
      )}
    </BlockShell>
  );
}
