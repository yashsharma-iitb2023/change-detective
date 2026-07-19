import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/cn";
import { Markdown } from "@/components/Markdown";
import type { ChangeItem, RegionName } from "@/lib/types";

export type BlockTone = "neutral" | "positive" | "negative" | "info";

const TONE_STYLES: Record<BlockTone, { icon: string; badge: string }> = {
  neutral: {
    icon: "bg-black/5 text-foreground dark:bg-white/10",
    badge: "bg-black/5 text-muted dark:bg-white/10",
  },
  positive: {
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  negative: {
    icon: "bg-red-500/10 text-red-600 dark:text-red-400",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400",
  },
  info: {
    icon: "bg-accent/10 text-accent",
    badge: "bg-accent/10 text-accent",
  },
};

const REGION_LABEL: Record<RegionName, string> = {
  header: "Header",
  body: "Body",
  footer: "Footer",
};

export function BlockShell({
  icon: Icon,
  tone = "neutral",
  region,
  section,
  changeType,
  significance,
  children,
}: {
  icon: LucideIcon;
  tone?: BlockTone;
  region: RegionName;
  section: string;
  changeType: string;
  significance: string;
  children: ReactNode;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            styles.icon
          )}
        >
          <Icon size={17} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold tracking-tight">
              {/^section-\d+$/.test(section) ? section.replace("section-", "Section ") : section}
            </h3>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                styles.badge
              )}
            >
              {REGION_LABEL[region]}
            </span>
            <span className="shrink-0 text-[11px] text-muted">
              {changeType}
            </span>
          </div>

          <div className="mt-3">{children}</div>

          <p className="mt-3 border-t border-border-hairline pt-3 text-[13px] leading-5 text-muted">
            <span className="font-medium text-foreground">Why it matters — </span>
            {significance}
          </p>
        </div>
      </div>
    </div>
  );
}

const ITEM_STYLE: Record<ChangeItem["op"], { label: string; mark: string; text: string }> = {
  added: { label: "New", mark: "text-emerald-600 dark:text-emerald-400", text: "text-foreground" },
  removed: { label: "Removed", mark: "text-red-600 dark:text-red-400", text: "text-foreground/70 line-through decoration-1" },
  updated: { label: "Updated", mark: "text-accent", text: "text-foreground" },
};

/** One-line-per-entry breakdown of a section's change (adds/removes/updates), grounded in the diff. */
export function ChangeItems({ items }: { items: ChangeItem[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => {
        const s = ITEM_STYLE[item.op];
        return (
          <li key={i} className="flex items-baseline gap-2 text-[13.5px] leading-5">
            <span className={cn("shrink-0 text-[11px] font-semibold uppercase tracking-wide", s.mark)}>{s.label}</span>
            <span className={cn("min-w-0 break-words", s.text)}>
              <Markdown>{item.text}</Markdown>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Shared before/after text pair. Collapsed by default when an itemized breakdown is shown above. */
export function BeforeAfter({
  before,
  after,
  collapsible = false,
}: {
  before: string | null;
  after: string | null;
  collapsible?: boolean;
}) {
  const panes = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sunken min-w-0 rounded-xl p-3">
        <div className="section-label mb-1.5">Before</div>
        <div className="max-h-60 overflow-auto text-foreground/80">
          <Markdown>{before ?? "—"}</Markdown>
        </div>
      </div>
      <div className="min-w-0 rounded-xl border border-accent/25 bg-accent/[0.05] p-3">
        <div className="section-label mb-1.5 text-accent/80">After</div>
        <div className="max-h-60 overflow-auto text-foreground">
          <Markdown>{after ?? "—"}</Markdown>
        </div>
      </div>
    </div>
  );

  if (!collapsible) return panes;
  return (
    <details className="group mt-3">
      <summary className="cursor-pointer select-none text-[12px] font-medium text-muted hover:text-foreground">
        Show full before / after
      </summary>
      <div className="mt-3">{panes}</div>
    </details>
  );
}
