# innerxp-links

App/Universal Link association files for **app.innerxp.ai**. Netlify deploys this repository on
push to `main`; the site serves nothing else.

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

## Current state

The identifiers listed are the **final** ones (`ai.innerxp.lumo` / `ai.innerxp.lumo.dev` under
Apple Team `Y95T9S7BHF`). The app is being renamed onto them from the previous
`com.olearis.innerxp*` namespace; until that rename ships, an installed build presents a different
identifier and the links will still open the browser. Nothing here has to change when it does.

The Android fingerprints are the **debug** keystore (dev flavor, local builds) and the **upload**
keystore. Once the app is enrolled in Play App Signing, the *app signing* SHA-256 from Play
Console → App integrity must be **added** here: an app distributed through Play presents Google's
certificate, not ours, so that entry is listed alongside rather than replacing these.

`/auth/action` itself is not served yet — a link tapped without the app installed currently gets
a 404. The result page is tracked separately.

## Checking it

```bash
curl -sI https://app.innerxp.ai/.well-known/assetlinks.json               # 200, application/json, no redirect
curl -sI https://app.innerxp.ai/.well-known/apple-app-site-association    # same

# Google's validator reads the statements the way Android does
open 'https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://app.innerxp.ai&relation=delegate_permission/common.handle_all_urls'
```

Apple's CDN caches the AASA aggressively; deleting and reinstalling the app is the way to force a
fresh fetch.
