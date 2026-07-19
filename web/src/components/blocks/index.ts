// The dynamic-display contract: every BlockType maps to exactly one component.
// Adding a new block type = add one component + one line here — nothing else
// in the report rendering path needs to change.
import type { ComponentType } from "react";
import type { BlockType, RenderBlock } from "@/lib/types";
import { CalloutBlock } from "./CalloutBlock";
import { ContentChangeBlock } from "./ContentChangeBlock";
import { FunctionalChangeBlock } from "./FunctionalChangeBlock";
import { MetricChangeBlock } from "./MetricChangeBlock";
import { SectionAddedBlock } from "./SectionAddedBlock";
import { SectionRemovedBlock } from "./SectionRemovedBlock";

export const BLOCK_COMPONENTS: Record<
  BlockType,
  ComponentType<{ block: RenderBlock }>
> = {
  content_change: ContentChangeBlock,
  functional_change: FunctionalChangeBlock,
  section_added: SectionAddedBlock,
  section_removed: SectionRemovedBlock,
  metric_change: MetricChangeBlock,
  callout: CalloutBlock,
};
