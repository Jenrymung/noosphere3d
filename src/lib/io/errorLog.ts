export const BROWSER_ERROR_LOG_KEY = "mindmap3d.error-log.v1";

export function formatErrorLine(kind: string, message: string, when = new Date()): string {
  const flat = message.replace(/\s+/g, " ").trim().slice(0, 2000);
  return `${when.toISOString()} ${kind} ${flat || "unknown"}`;
}

export function installErrorLog(append: (line: string) => void): () => void {
  const onError = (event: ErrorEvent) => {
    append(formatErrorLine("error", event.message || "unknown error"));
  };
  const onReject = (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "unknown rejection");
    append(formatErrorLine("unhandledrejection", reason));
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onReject);
  };
}
