"use client";

import { Loader2, Play } from "lucide-react";
import { cn } from "@/components/cn";

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label
      className={cn(
        "flex select-none items-center gap-2 text-[13px] text-foreground/80",
        disabled && "opacity-50"
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-black/15 dark:bg-white/20"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4"
          )}
        />
      </button>
      {label}
    </label>
  );
}

export function TriggerForm({
  url,
  onUrlChange,
  excludeHeader,
  excludeFooter,
  onExcludeHeaderChange,
  onExcludeFooterChange,
  onRun,
  running,
  knownUrls,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  excludeHeader: boolean;
  excludeFooter: boolean;
  onExcludeHeaderChange: (v: boolean) => void;
  onExcludeFooterChange: (v: boolean) => void;
  onRun: () => void;
  running: boolean;
  knownUrls: string[];
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!running && url.trim()) onRun();
      }}
      className="card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="url"
          required
          list="known-urls"
          placeholder="https://example.com/pricing — or pick a previous URL"
          value={url}
          disabled={running}
          onChange={(e) => onUrlChange(e.target.value)}
          className="input-field min-w-0 flex-1 rounded-full px-5 py-3 text-[14.5px] outline-none placeholder:text-muted disabled:opacity-60"
        />
        <datalist id="known-urls">
          {knownUrls.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={running || !url.trim()}
          className="btn-primary flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3 text-[14.5px] font-semibold"
        >
          {running ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Play size={15} fill="currentColor" />
          )}
          {running ? "Running…" : "Run"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-5">
        <Toggle
          label="Exclude header"
          checked={excludeHeader}
          onChange={onExcludeHeaderChange}
          disabled={running}
        />
        <Toggle
          label="Exclude footer"
          checked={excludeFooter}
          onChange={onExcludeFooterChange}
          disabled={running}
        />
      </div>
    </form>
  );
}
