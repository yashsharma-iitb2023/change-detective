import { PenLine } from "lucide-react";
import type { RenderBlock } from "@/lib/types";
import { BeforeAfter, BlockShell, ChangeItems, ChangeView } from "./BlockShell";

export function ContentChangeBlock({ block }: { block: RenderBlock }) {
  // A list-shaped change shows one-line bullets (the diff already itemized it), with the raw
  // before/after one click away; anything else shows the shared before→after view — the same
  // representation a figure change gets.
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
        <ChangeView before={block.before} after={block.after} />
      )}
    </BlockShell>
  );
}
