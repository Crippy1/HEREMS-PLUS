# HEREMS_PLUS R220 — deployment-file correction

This package preserves the R220 mobile-fix application's HTML, styles, scripts, service worker and original version values exactly. It changes only deployment plumbing:

- Vercel function entrypoint: `api/gateway.js` (ES modules via existing `package.json` type: module).
- `vercel.json` function pattern matches `api/gateway.js`.
- Build checks that the function, shared handler and Netlify adapter are present, to report incomplete uploads early.
- Netlify adapter and configuration remain unchanged.

## Upload correctly

Extract this ZIP, then replace the deployment repository contents with the extracted files. Upload folders with their original paths; do not flatten folders and do not upload only the ZIP.

Required paths include:

```
package.json
vercel.json
netlify.toml
build.mjs
index.html
sw.js
manifest.webmanifest
api/gateway.js
lib/handler.mjs
netlify/functions/gateway.mjs
icons/
```

Remove the obsolete `api/gateway.mjs` from the repository. Do not remove `lib/handler.mjs` or the Netlify `.mjs` function; they are different files.

Vercel: Framework Other; Root Directory = folder containing package.json, vercel.json and api/; Build Command npm run build; Output Directory public; Node.js 22.x. Do NOT choose public as the root directory. Redeploy the latest GitHub commit.

Netlify: same root/build/publish settings; provided netlify.toml configures functions.

Build output must contain public/index.html. Successful build log: `R220: 10 inline scripts checked; public assets built.`

## Verification / limitations

Local build, syntax, configuration-to-file matching, gateway adapter and mocked provider regressions passed. ZIP byte comparisons confirm app HTML and all non-deployment assets are unchanged. No live GitHub/Vercel/Netlify deployment was performed, so host validation remains necessary.

This fixes deployment packaging, not application security. Previously identified frontend credential and client-side authorization blockers remain unresolved. Use restricted testing only; do not treat successful deployment as production security approval. Keep provider credentials and school-data backups out of GitHub.
