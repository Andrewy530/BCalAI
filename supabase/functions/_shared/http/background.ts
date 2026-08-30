/**
 * Run work after the response has been sent.
 *
 * Both providers treat a slow webhook endpoint as a failed delivery, and a user
 * importing a calendar should not watch a spinner while a year of events is
 * paged in. `EdgeRuntime.waitUntil` keeps the isolate alive for the promise
 * after the response is returned; where it is unavailable (local `deno serve`,
 * tests) the work is simply awaited, which is slower but never silently lost.
 */

interface EdgeRuntimeLike {
  waitUntil?: (promise: Promise<unknown>) => void;
}

export async function runAfterResponse(work: () => Promise<void>): Promise<void> {
  const runtime = (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime;

  const guarded = work().catch((error: unknown) => {
    // A background failure has no response to attach itself to, so logging is
    // the only place it can surface. The queue records it separately.
    console.error(JSON.stringify({ code: 'BACKGROUND_TASK_FAILED', detail: String(error) }));
  });

  if (typeof runtime?.waitUntil === 'function') {
    runtime.waitUntil(guarded);
    return;
  }

  await guarded;
}
