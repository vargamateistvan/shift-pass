export type RotateRequest = {
  url: string;
  email: string;
  googleAccessToken: string;
};

export type ProgressPhase =
  | "starting"
  | "navigating"
  | "requesting_reset"
  | "awaiting_email"
  | "reading_email"
  | "setting_password"
  | "saving"
  | "done"
  | "needs_human"
  | "error";

export type BackgroundJobStatus = "queued" | ProgressPhase;

export type ProgressEvent =
  | { type: "phase"; phase: ProgressPhase; message: string }
  | { type: "step"; index: number; action: string; detail?: string }
  | { type: "screenshot"; dataUrl: string }
  | { type: "needs_human"; reason: string; message: string }
  | { type: "done"; site: string; email: string; password: string }
  | { type: "error"; message: string };

export type AgentAction =
  | { action: "screenshot" }
  | { action: "navigate"; url: string }
  | { action: "left_click"; x: number; y: number }
  | { action: "scroll"; x: number; y: number; dx: number; dy: number }
  | { action: "type"; text: string }
  | { action: "key"; key: string }
  | { action: "wait"; ms: number }
  | { action: "done"; summary: string }
  | { action: "needs_human"; reason: string };
