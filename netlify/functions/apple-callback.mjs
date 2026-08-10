/**
 * Sign in with Apple — the Android leg's return hop.
 *
 * Android has no native Apple sheet. The app opens Apple's web OAuth flow in a
 * Chrome Custom Tab, and Apple answers by POSTing the result as
 * `application/x-www-form-urlencoded` to the Return URL registered on the
 * Services ID `ai.innerxp.lumo.signin` — this endpoint. A form POST cannot
 * re-enter an Android app, so the only job here is to turn it back into one:
 *
 *   307 → intent://callback?<the same body>#Intent;package=<app>;scheme=signinwithapple;end
 *
 * which resolves to `SignInWithAppleCallback` in the app's manifest and
 * completes the Future the plugin is awaiting. Nothing is stored, nothing is
 * verified, and no token is read: verification belongs to the API's
 * `/v1/auth/provider-precheck`, which re-derives everything from the signed
 * token itself. This hop is pure transport.
 *
 * @see https://github.com/Olearis-InnerXP/innerxp-mobile/blob/develop/lib/core/services/apple_sign_in_service.dart
 */

/**
 * The applicationIds this endpoint will hand a credential to.
 *
 * `state` chooses the package because one endpoint serves both flavors and they
 * are separate installs — but it arrives from the browser, so it is a request,
 * not an instruction. Without this list a crafted `state` would aim Apple's
 * response at an arbitrary installed app, which is a credential-forwarding
 * hole; with it, the worst a crafted value can do is 400.
 */
const ALLOWED_PACKAGES = new Set(['ai.innerxp.lumo', 'ai.innerxp.lumo.dev']);

/** Apple's own value for "the user pressed Cancel" — a normal outcome, not a fault. */
const USER_CANCELLED = 'user_cancelled_authorize';

export default async (request) => {
  if (request.method !== 'POST' && request.method !== 'GET') {
    return problem(405, 'Method not allowed', 'Apple posts this callback; nothing else may.');
  }

  // Apple uses `response_mode=form_post`, so the payload is a form body. GET is
  // accepted too because Apple falls back to query parameters for some error
  // responses, and losing a cancel here would hang the Custom Tab: the plugin's
  // Future only ever completes on the intent this endpoint emits.
  const params =
    request.method === 'POST'
      ? new URLSearchParams(await request.text())
      : new URL(request.url).searchParams;

  const state = params.get('state');
  if (!state || !ALLOWED_PACKAGES.has(state)) {
    return problem(
      400,
      'Unknown application',
      'This sign-in request did not come from an InnerXP build, or it named an application this endpoint does not serve.',
    );
  }

  // Everything except `state` travels on: `code` and `id_token` are what the app
  // exchanges, `user` carries the name/e-mail Apple returns on a first
  // authorization only, and `error` is how a cancel reaches the plugin. `state`
  // itself is forwarded as well — the plugin surfaces it, and dropping it would
  // make the app unable to tell which request it is holding.
  const intent = `intent://callback?${params.toString()}#Intent;package=${state};scheme=signinwithapple;end`;

  return new Response(null, {
    status: 307,
    headers: {
      Location: intent,
      // The response carries a one-time credential in its Location header.
      // Nothing about it may be cached or handed to a referrer.
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
};

/**
 * A human-readable dead end.
 *
 * Reached only when the request is malformed, which for a real user means the
 * Custom Tab is showing it — so it says what happened in plain words rather than
 * returning a bare status. A cancel never lands here: it carries a valid `state`
 * and is forwarded to the app as {@link USER_CANCELLED}, which the plugin turns
 * into a silent no-op.
 */
function problem(status, title, detail) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<div style="font:16px/1.5 system-ui;max-width:32rem;margin:4rem auto;padding:0 1.5rem">` +
      `<h1 style="font-size:1.25rem">${title}</h1><p>${detail}</p>` +
      `<p>You can close this window and try again from the app.</p></div>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

/**
 * The path is declared here rather than as a `[[redirects]]` rule so the route
 * and the handler cannot drift apart. It must match, exactly, both the Return
 * URL registered on the Services ID and `APPLE_REDIRECT_URI` in the app's
 * `env/*.json` — Apple compares the string, not the resolved page.
 */
export const config = { path: '/auth/apple/callback' };
