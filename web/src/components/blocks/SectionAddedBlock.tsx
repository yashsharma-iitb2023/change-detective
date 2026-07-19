import { PlusCircle } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import type { RenderBlock } from "@/lib/types";
import { BlockShell } from "./BlockShell";

export function SectionAddedBlock({ block }: { block: RenderBlock }) {
  return (
    <BlockShell
      icon={PlusCircle}
      tone="positive"
      region={block.region}
      title={block.title}
      changeType={block.changeType}
      significance={block.significance}
    >
      <div className="rounded-lg bg-emerald-500/[0.06] p-3">
        <div className="section-label mb-1.5 text-emerald-700 dark:text-emerald-400">
          New
        </div>
        <div className="max-h-60 overflow-auto text-foreground/80">
          <Markdown>{block.after ?? "—"}</Markdown>
        </div>
      </div>
    </BlockShell>
  );
}
