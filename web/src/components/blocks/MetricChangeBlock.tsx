import { Gauge } from "lucide-react";
import type { RenderBlock } from "@/lib/types";
import { BlockShell, ChangeView } from "./BlockShell";

export function MetricChangeBlock({ block }: { block: RenderBlock }) {
  return (
    <BlockShell
      icon={Gauge}
      tone="info"
      region={block.region}
      title={block.title}
      changeType={block.changeType}
      significance={block.significance}
    >
      <ChangeView before={block.before} after={block.after} />
    </BlockShell>
  );
}
