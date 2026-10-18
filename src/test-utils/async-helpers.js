// Shared async helpers for tests: let pending promise chains settle and
// build a successful fetch() response.

/** Let `ticks` rounds of queued microtasks run (default enough for fetch chains). */
export async function flush(ticks = 10) {
  for (let i = 0; i < ticks; i += 1) {
    await Promise.resolve();
  }
}

/** A minimal successful fetch() Response with a JSON body. */
export function okResponse(body, status = 200) {
  return { ok: true, status, json: async () => body };
}
