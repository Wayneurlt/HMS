/** Uniform result returned by every server action. Client-safe. */
export type ActionResult<R = unknown> =
  | { ok: true; message?: string; data?: R }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
