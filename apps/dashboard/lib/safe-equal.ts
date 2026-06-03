// Runtime-agnostic constant-time string comparison for the hub access token.
//
// Uses Web Crypto only — no `node:*`, no `import "server-only"`, no `@hub/core`
// import — so it stays importable from any runtime, including `proxy.ts`. Next
// 16 runs `proxy` on the Node.js runtime; keeping this Web-Crypto-only also
// means it works unchanged if proxy ever moves back to the edge runtime (where
// node:crypto / Buffer don't exist).
//
// Strategy: HMAC-SHA256 both inputs under a per-process random key, then compare
// the two equal-length (32-byte) digests with a branchless accumulator. The
// secret random key blinds the comparison (the compared bytes reveal nothing
// about the real token), and equal-length digests sidestep timingSafeEqual's
// throw-on-unequal-length trap. Raw input length stays non-secret (inherent and
// acceptable for a high-entropy token).

const encoder = new TextEncoder();

// One random key per runtime instance; never leaves the process.
const hmacKeyPromise: Promise<CryptoKey> = (async () => {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
})();

async function hmac(value: string): Promise<Uint8Array> {
  const key = await hmacKeyPromise;
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return new Uint8Array(sig);
}

export async function safeStrEqual(
  a: string | undefined | null,
  b: string | undefined | null,
): Promise<boolean> {
  // Coerce missing/undefined to "" so the comparison always runs (never
  // short-circuits on a missing cookie/token).
  const [da, db] = await Promise.all([hmac(a ?? ""), hmac(b ?? "")]);
  let diff = da.length ^ db.length;
  for (let i = 0; i < da.length; i++) {
    diff |= da[i] ^ db[i];
  }
  return diff === 0;
}
