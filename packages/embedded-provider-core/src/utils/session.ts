import { base64urlEncode } from "@phantom/base64url";

/**
 * Generate a session ID using the platform's CSPRNG.
 *
 * The session ID is used as the OAuth `state` parameter on the authorization
 * request (see `packages/auth2/src/auth2Flow.ts`) and as the `session_id`
 * round-tripped through the redirect callback. Both uses are CSRF / session
 * binding tokens, so the value must be unpredictable to an attacker.
 *
 * `Math.random()` is not a cryptographic PRNG and must not be used for tokens
 * that gate authentication state. We use `crypto.getRandomValues`, which is
 * available in browsers, React Native (via `react-native-get-random-values`
 * pulled in by other SDK packages), and Node.js 19+ as a Web Crypto polyfill
 * on the global `crypto` object — the same primitive already used by
 * `createCodeVerifier` in `@phantom/auth2`.
 *
 * The "session_" prefix is kept for log/debug readability and backwards
 * compatibility with any tooling that greps for it; nothing in this SDK
 * parses the body of the session ID.
 */
export function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "session_" + base64urlEncode(bytes);
}
