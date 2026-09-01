/**
 * Provider-neutral cryptographic helpers.
 *
 * These values are used by OAuth handshakes and provider watch registrations,
 * so they live beside the provider boundary rather than inside one adapter.
 */

/** RFC 7636 PKCE pair. `crypto` is available in the Edge runtime. */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/** Generate a URL-safe random token for provider watch registrations. */
export function randomToken(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
