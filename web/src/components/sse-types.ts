// Shared shape for the /api/run SSE contract (TRD §2.2), used by both the
// route handler (server) and the page (client) so they can't drift apart.
import type { RenderSpec } from "@/lib/types";

export interface StatusPayload {
  message: string;
}

export interface TrailPayload {
  step: number;
  action: string;
  reasoning: string;
}

export interface ReportPayload {
  renderSpec: RenderSpec;
}

export interface ErrorPayload {
  type: string;
  message: string;
}

export type SSEEventName = "status" | "trail" | "report" | "error";
