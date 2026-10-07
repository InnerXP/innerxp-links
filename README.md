# innerxp-links

App/Universal Link association files for **app.innerxp.ai**, the result page behind the auth
links, the Resonance Link's fallback page, and the Sign in with Apple return hop Android needs. Netlify deploys this repository on push to
`main`; the site serves nothing else.

The host exists so that a Firebase auth action link —
`https://app.innerxp.ai/auth/action?mode=…&oobCode=…` — opens the InnerXP app instead of a
browser. Both platforms resolve the association file on the **host of the link itself**, which is
why these files and the action URL cannot live on different hosts, and why they are here rather
than on the apex `innerxp.ai` (the landing page).

| File | Platform | Keys on |
|---|---|---|
| `.well-known/apple-app-site-association` | iOS | Apple Team ID + App ID |
| `.well-known/assetlinks.json` | Android | `applicationId` + SHA-256 signing fingerprints |

## Two things that must not break

**No file extension on `apple-app-site-association`, and both files must be served as
`application/json`.** That is what [`netlify.toml`](netlify.toml) is for. A wrong Content-Type is
the usual reason Universal Links fail with no error anywhere.

**No redirects on either path.** Android follows none when checking `assetlinks.json`.

The same goes for `/auth/action`, which is why the page is `auth/action.html` and **not**
`auth/action/index.html`: a directory would make Netlify answer the link's own URL with a `301` to
the trailing-slash form. It works — the query string survives and both platforms match the
association against the original URL — but it puts a redirect on the one path a mail link lands
on, for nothing.

## Current state

The identifiers listed are the **final** ones (`ai.innerxp.lumo` / `ai.innerxp.lumo.dev` under
Apple Team `Y95T9S7BHF`). The app is being renamed onto them from the previous
`com.olearis.innerxp*` namespace; until that rename ships, an installed build presents a different
identifier and the links will still open the browser. Nothing here has to change when it does.

The Android fingerprints are the **debug** keystore (dev flavor, local builds) and the **upload**
keystore. Once the app is enrolled in Play App Signing, the *app signing* SHA-256 from Play
Console → App integrity must be **added** here: an app distributed through Play presents Google's
certificate, not ours, so that entry is listed alongside rather than replacing these.

`/auth/action` is served by [`auth/action.html`](auth/action.html) — see below.

## The result page — `/auth/action`

The web half of the auth action links, and only ever the **fallback**: on a device with the app
installed and the association above live, the OS opens the app and this page never loads. It runs
on a desktop, or on a phone without the app.

One static file, no framework and no build step. It calls Google's Identity Toolkit REST API
directly rather than loading the Firebase JS SDK — two endpoints are all it needs, and a static
page keeps this repository free of anything that could shadow `/.well-known/*`.

| `mode` | What it does |
|---|---|
| `verifyEmail` | `accounts:update` with the `oobCode`, then reports the outcome |
| `resetPassword` | verifies the code **first**, then shows the password form, then `accounts:resetPassword` |
| anything else, or a missing code | generic failure |

Four outcomes, each in DE and EN: verified · link expired or already used · password set · generic
failure. An invalid, expired and already-spent code are one outcome on purpose — Firebase tells
them apart and the reader cannot, and all three mean the same thing: ask for a new link.

**The reset code is verified before the form is drawn.** A dead link should say so rather than let
someone choose and confirm a password and only then be told it was never going to work.

**Language** comes from the `lang` parameter Firebase appends, falls back to the browser's, and can
be switched by hand in the footer. The copy is taken verbatim from the app's own `.arb` files, so
the page and screens 4.3 / 4.6 / 4.7 say the same thing in the same voice; the design tokens mirror
`docs/DESIGN_SYSTEM.md`. Keep both in agreement — when the app's copy changes, this changes too.

**The API key** normally comes from the `apiKey` parameter Firebase puts on the handler URL, so the
page uses whichever project sent the mail and needs no key of its own. The hardcoded fallback
exists only so the page can be opened by hand for testing, and points at the dev project — refresh
or drop it once the apps are re-registered under `ai.innerxp.lumo*`.

## The Resonance Link — `/r/<code>`

An invitation (spec 3.8 *Referral*, KAN-84): `https://app.innerxp.ai/r/<code>`. Where the app is
installed the OS opens it and this page never loads — the AASA claims `/r/*` and the Android app's
manifest claims `pathPrefix="/r/"`. Everywhere else, [`netlify.toml`](netlify.toml) rewrites the
path to [`referral.html`](referral.html) with a **200**, so the browser keeps `/r/<code>` and the
page reads the code off its own path. The full plan is
[`docs/REFERRAL_FLOW_PLAN.md`](https://github.com/Olearis-InnerXP/innerxp-mobile/blob/develop/docs/REFERRAL_FLOW_PLAN.md)
in the mobile repo.

**The AASA entry must not go live before the app handles `/r/`.** An installed build without the
`/r/:code` route opens a tapped link on "Page Not Found". The route landed in the mobile repo on
2026-10-05 (F3); deploy `/r/*` only once testers run a build that has it.

What the page does with the code, and nothing else:

- **The Play button carries it** as the store's referrer —
  `…/details?id=<package>&referrer=code%3D<code>` — and the app reads it on its first launch
  through Google's Install Referrer API (F6).
- **The *Open* button carries it back to the app** after an iOS install (F7). It is drawn **only
  on a host other than `app.innerxp.ai`**: iOS will not open an app from a link to the domain the
  reader is already on, so on this host the button would do nothing.
- **It is never rendered.** The page says nothing about who sent the link, and the code goes only
  into the two URLs above, encoded and set as attributes.

Three things are deliberately unfinished:

1. **The landing subdomain does not exist yet** (`get.innerxp.ai` or similar — the plan's Q7). It
   needs one DNS record from whoever holds the `innerxp.ai` zone, then a domain alias on this
   Netlify site, then `/r/*` on `app.innerxp.ai` answering a **302** to it. Until then the iOS
   re-tap cannot work, and iOS visitors see the page without an *Open* button.
2. **`PLAY_PACKAGE` is the dev app** (`ai.innerxp.lumo.dev`), because only dev is being built.
   Switch it to `ai.innerxp.lumo` when prod is stood up.
3. **`APP_STORE_URL` is empty**, so the App Store button is hidden — there is no public listing.
   The official store badges and Apple's Smart App Banner
   (`<meta name="apple-itunes-app" content="app-id=…, app-argument=https://app.innerxp.ai/r/<code>">`)
   come with the listings. The copy is dev copy: no frame draws this page.

## Sign in with Apple on Android — `/auth/apple/callback`

Served by [`netlify/functions/apple-callback.mjs`](netlify/functions/apple-callback.mjs), the one
piece of this site that is not a static file.

Android has no native Apple sheet. The app opens Apple's web OAuth flow in a Chrome Custom Tab and
Apple **POSTs** the result (`response_mode=form_post`) to the Return URL on the Services ID
`ai.innerxp.lumo.signin.dev`. A form POST cannot re-enter an Android app, so this endpoint
answers `307` to

```
intent://callback?<the same body>#Intent;package=<applicationId>;scheme=signinwithapple;end
```

which resolves to `SignInWithAppleCallback` in the app's manifest.

**It verifies nothing, and must not start.** The `id_token` it forwards is verified by the API's
`/v1/auth/provider-precheck`, which re-derives the address and the nonce from the signature. A
second opinion here could only ever disagree with a verified one.

**`state` names the package, and is allowlisted.** Dev and prod are separate installs under
separate ids, and one endpoint serves both — so the app sends its own applicationId out in `state`
and Apple echoes it back. Since it arrives from a browser it is a request, not an instruction: the
function accepts only `ai.innerxp.lumo` and `ai.innerxp.lumo.dev`. **Add a flavor here** if one is
ever added to the app, or its sign-in returns `400`.

**One string in three places, compared literally by Apple:** the Return URL on the Services ID,
`APPLE_REDIRECT_URI` in the app's `env/*.json`, and `config.path` at the bottom of the function.

**One Services ID per environment, sharing this one endpoint.** A Services ID is grouped under
exactly one *primary App ID*, and Apple derives the user's `sub` from that grouping — so a prod
build authorizing through a Services ID grouped under the **dev** App ID would give the same
person a different `sub` on Android than on iOS. Dev is `ai.innerxp.lumo.signin.dev` under
`ai.innerxp.lumo.dev`; `ai.innerxp.lumo.signin` is reserved for prod under `ai.innerxp.lumo`.
Both register **this same Return URL**, which costs nothing here: the function routes on `state`,
never on which Services ID the request came from.

### Setting it up per environment

**Dev is done and green as of 2026-08-10** — an Android debug build of the `dev` flavor signed in with Apple end to end through this endpoint. The list below is what prod will need (BE-3), and the record of what dev took.

1. **Register the domain and the Return URL** on the environment's Services ID — for dev,
   `ai.innerxp.lumo.signin.dev` (Apple Developer → Identifiers → Services IDs → *Sign in with
   Apple* → Configure): domain `app.innerxp.ai`, Return URL
   `https://app.innerxp.ai/auth/apple/callback`. The Return URL field wants the **full https
   URL**, not the Services ID — Apple rejects anything else with *"There is a problem with the
   request entity"*.
2. ~~Host Apple's domain-verification file.~~ **Not needed — established by running it,
   2026-08-10.** The sources disagree: Apple's own help says *"You don't need to upload a file on
   your server to complete the registration process for domains and subdomains"*, while
   third-party guides as recent as May 2026 present
   `/.well-known/apple-developer-domain-association.txt` as mandatory for any web flow. With the
   configuration saved, an Android debug build signed in end to end while that path answered
   **404**. It is deliberately not hosted: a verification file nothing reads is a claim about the
   setup that nothing checks. If a future domain, or a re-created Services ID, starts refusing the
   redirect, that is when it earns its place — and note that re-creating a Services ID regenerates
   the file's contents, so an old one would not have helped anyway.
3. ~~Add the Services ID to the API's `APPLE_OAUTH_AUDIENCES`.~~ **Done 2026-08-10** — the dev
   API carries `ai.innerxp.lumo.dev,ai.innerxp.lumo.signin.dev`. The web flow mints its token against
   the **Services ID**, not the bundle id, so `aud` differs by platform for the same user, and
   until this landed every Android sign-in would have failed the precheck with a perfectly valid
   token. `prod` needs the same when that project is stood up.

## Checking it

```bash
curl -sI https://app.innerxp.ai/.well-known/assetlinks.json               # 200, application/json, no redirect
curl -sI https://app.innerxp.ai/.well-known/apple-app-site-association    # same, and lists /r/*
curl -s -o /dev/null -w '%{http_code}\n' https://app.innerxp.ai/r/aurora-42   # 200, the fallback page

# The Apple callback: a valid state redirects, an unknown one refuses
curl -si -X POST https://app.innerxp.ai/auth/apple/callback \
  -d 'state=ai.innerxp.lumo.dev&code=test&id_token=test' | head -5   # 307 → intent://…
curl -so /dev/null -w '%{http_code}\n' -X POST https://app.innerxp.ai/auth/apple/callback \
  -d 'state=com.example.other&code=test'                             # 400

# Google's validator reads the statements the way Android does
open 'https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://app.innerxp.ai&relation=delegate_permission/common.handle_all_urls'
```

Apple's CDN caches the AASA aggressively; deleting and reinstalling the app is the way to force a
fresh fetch.

Deploy released by InnerXP, 2026-10-07 (repo public)
