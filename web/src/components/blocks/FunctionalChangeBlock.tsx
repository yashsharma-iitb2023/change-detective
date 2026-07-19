import { LayoutTemplate } from "lucide-react";
import type { RenderBlock } from "@/lib/types";
import { BeforeAfter, BlockShell } from "./BlockShell";

export function FunctionalChangeBlock({ block }: { block: RenderBlock }) {
  return (
    <BlockShell
      icon={LayoutTemplate}
      tone="neutral"
      region={block.region}
      title={block.title}
      changeType={block.changeType}
      significance={block.significance}
    >
      <BeforeAfter before={block.before} after={block.after} />
    </BlockShell>
  );
}
