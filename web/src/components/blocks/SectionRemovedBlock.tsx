import { MinusCircle } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import type { RenderBlock } from "@/lib/types";
import { BlockShell } from "./BlockShell";

export function SectionRemovedBlock({ block }: { block: RenderBlock }) {
  return (
    <BlockShell
      icon={MinusCircle}
      tone="negative"
      region={block.region}
      title={block.title}
      changeType={block.changeType}
      significance={block.significance}
    >
      <div className="rounded-lg bg-red-500/[0.06] p-3">
        <div className="section-label mb-1.5 text-red-700 dark:text-red-400">
          Removed
        </div>
        <div className="max-h-60 overflow-auto text-foreground/70">
          <Markdown>{block.before ?? "—"}</Markdown>
        </div>
      </div>
    </BlockShell>
  );
}
