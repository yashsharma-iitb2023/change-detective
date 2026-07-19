import { Megaphone } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import type { RenderBlock } from "@/lib/types";
import { BlockShell } from "./BlockShell";

/** A freeform observation that doesn't fit the before/after shape (e.g. "no meaningful change"). */
export function CalloutBlock({ block }: { block: RenderBlock }) {
  return (
    <BlockShell
      icon={Megaphone}
      tone="info"
      region={block.region}
      section={block.section}
      changeType={block.changeType}
      significance={block.significance}
    >
      {(block.before || block.after) && (
        <div className="max-h-60 overflow-auto text-foreground/80">
          <Markdown>{block.after ?? block.before ?? ""}</Markdown>
        </div>
      )}
    </BlockShell>
  );
}
