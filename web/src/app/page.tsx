"use client";

import { Radar } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/cn";
import { AgentTrail } from "@/components/AgentTrail";
import { ReportView, type RunPhase } from "@/components/ReportView";
import type {
  ErrorPayload,
  ReportPayload,
  StatusPayload,
  TrailPayload,
} from "@/components/sse-types";
import { TriggerForm } from "@/components/TriggerForm";
import type { RenderSpec } from "@/lib/types";

export default function Home() {
  const [url, setUrl] = useState("");
  // Default to body-only: Defuddle already extracts clean main content, and header/footer
  // are usually boilerplate. Users can opt back in by toggling these off.
  const [excludeHeader, setExcludeHeader] = useState(true);
  const [excludeFooter, setExcludeFooter] = useState(true);

  // Landing shows a centered hero (title + search only); the first Run slides it up and reveals
  // the results. Stays true afterwards.
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [statuses, setStatuses] = useState<(StatusPayload & { ts: number })[]>(
    []
  );
  const [trail, setTrail] = useState<TrailPayload[]>([]);
  const [report, setReport] = useState<RenderSpec | null>(null);
  const [error, setError] = useState<ErrorPayload | null>(null);

  const [knownUrls, setKnownUrls] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const loadKnownUrls = () =>
    fetch("/api/urls")
      .then((r) => r.json())
      .then((d) => setKnownUrls(d.urls ?? []))
      .catch(() => {});

  useEffect(() => {
    loadKnownUrls();
    return () => esRef.current?.close();
  }, []);

  function run() {
    esRef.current?.close();

    setStarted(true);
    setPhase("running");
    setStatuses([]);
    setTrail([]);
    setReport(null);
    setError(null);

    const params = new URLSearchParams({
      url,
      includeHeader: String(!excludeHeader),
      includeFooter: String(!excludeFooter),
    });
    const es = new EventSource(`/api/run?${params}`);
    esRef.current = es;

    es.addEventListener("status", (ev) => {
      const data = JSON.parse(ev.data) as StatusPayload;
      setStatuses((prev) => [...prev, { ...data, ts: Date.now() }]);
    });

    es.addEventListener("trail", (ev) => {
      const data = JSON.parse(ev.data) as TrailPayload;
      setTrail((prev) => [...prev, data]);
    });

    es.addEventListener("report", (ev) => {
      const data = JSON.parse(ev.data) as ReportPayload;
      setReport(data.renderSpec);
      setPhase("done");
      es.close();
      loadKnownUrls(); // a first-time URL is now in the DB — refresh the picker
    });

    es.addEventListener("error", (ev) => {
      const messageEvent = ev as MessageEvent<string>;
      setError(
        messageEvent.data
          ? (JSON.parse(messageEvent.data) as ErrorPayload)
          : { type: "connection", message: "Lost connection to the server." }
      );
      setPhase("error");
      es.close();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pb-12">
      <div
        className={cn(
          "flex flex-col gap-7 transition-all duration-700 ease-out",
          started ? "pt-10 sm:pt-12" : "pt-[26vh]"
        )}
      >
        <header className="flex items-center gap-3.5">
          <span className="brand-mark flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
            <Radar size={24} strokeWidth={2} />
          </span>
          <div>
            <h1 className="text-[27px] font-semibold leading-none tracking-tight">
              Change Detective
            </h1>
            <p className="mt-2 text-[14.5px] text-muted">
              Point it at a URL. It tells you what changed since last time — and why it matters.
            </p>
          </div>
        </header>

        <TriggerForm
          url={url}
          onUrlChange={setUrl}
          excludeHeader={excludeHeader}
          excludeFooter={excludeFooter}
          onExcludeHeaderChange={setExcludeHeader}
          onExcludeFooterChange={setExcludeFooter}
          onRun={run}
          running={phase === "running"}
          knownUrls={knownUrls}
        />
      </div>

      {started && (
        <div className="fade-in mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-1">
            <AgentTrail entries={trail} loading={phase === "running"} />
          </div>
          <div className="lg:col-span-2">
            <ReportView phase={phase} statuses={statuses} error={error} report={report} />
          </div>
        </div>
      )}
    </div>
  );
}
