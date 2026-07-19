import { PenLine } from "lucide-react";
import type { RenderBlock } from "@/lib/types";
import { BeforeAfter, BlockShell, ChangeItems } from "./BlockShell";

export function ContentChangeBlock({ block }: { block: RenderBlock }) {
  // When the diff produced a per-entry breakdown, show one-line bullets and tuck the raw
  // before/after behind a toggle; otherwise fall back to the full before/after panes.
  const hasItems = !!block.items?.length;
  return (
    <BlockShell
      icon={PenLine}
      tone="info"
      region={block.region}
      title={block.title}
      changeType={block.changeType}
      significance={block.significance}
    >
      {hasItems ? (
        <>
          <ChangeItems items={block.items!} />
          <BeforeAfter before={block.before} after={block.after} collapsible />
        </>
      ) : (
        <BeforeAfter before={block.before} after={block.after} />
      )}
    </BlockShell>
  );
}
