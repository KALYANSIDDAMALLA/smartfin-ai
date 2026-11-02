/** Tiny event bus so any client code can show a toast or ask for confirmation without wiring React context everywhere. */
export type ToastTone = "success" | "error" | "info";
export interface ToastMsg { id: number; text: string; tone: ToastTone; ms: number }
export interface ConfirmOpts { title?: string; message: string; confirmLabel?: string; cancelLabel?: string; tone?: "danger" | "primary" }

const toastListeners = new Set<(t: ToastMsg) => void>();
const confirmListeners = new Set<(o: ConfirmOpts, done: (v: boolean) => void) => void>();
let seq = 0;

export const onToast = (fn: (t: ToastMsg) => void) => { toastListeners.add(fn); return () => { toastListeners.delete(fn); }; };
export const onConfirm = (fn: (o: ConfirmOpts, done: (v: boolean) => void) => void) => { confirmListeners.add(fn); return () => { confirmListeners.delete(fn); }; };

/** Shows a short message that dismisses itself (default 2.6s). */
export function toast(text: string, tone: ToastTone = "success", ms = 2600) { const t = { id: ++seq, text, tone, ms }; toastListeners.forEach((l) => l(t)); }

/** Resolves true only if the user presses the confirm button. Falls back to the browser prompt if the host isn't mounted. */
export function askConfirm(o: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => { if (!confirmListeners.size) { resolve(typeof window !== "undefined" ? window.confirm(o.message) : false); return; } confirmListeners.forEach((l) => l(o, resolve)); });
}
