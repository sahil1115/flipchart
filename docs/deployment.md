# Static deployment

FlipChart produces static files and has no client routes, server API, account service or proxy. Serve the complete `dist/` directory over HTTPS (localhost HTTP is suitable for local checks). No paid host/domain is required. Do not use `file://` or rewrite arbitrary paths to index.html; the service worker intentionally supports the directory URL and index.html only.

## Root build

```sh
npm ci
npm run check
npm run preview
```

Serve `dist/` at `/`. Preview uses http://127.0.0.1:4173/. Service-worker registration is production-only.

## Repository subpath / GitHub Pages

Build for the exact deployment prefix, including both slashes. On PowerShell:

```powershell
$env:FLIPCHART_BASE = '/flipchart/'
npm run build
npm run preview
# Open http://127.0.0.1:4173/flipchart/
Remove-Item Env:FLIPCHART_BASE
```

On a POSIX shell: `FLIPCHART_BASE=/flipchart/ npm run build`. Publish the contents of dist at the repository's `/flipchart/` prefix. For another repository name, substitute that name. A custom-domain root requires `/` instead. Manifest start URL, icon paths, worker registration and cache scope follow that prefix. There are no application routing/rewrite requirements. Hosts may redirect the directory URL to its trailing slash; use that canonical URL when bookmarking/installing.

`npm run test:subpath` builds a separate ignored `dist-subpath/` and serves it under `/flipchart/` on port 4174. It verifies shell/manifest/scope, offline demo and settings recovery, authenticated/query bypass and a waiting worker update activated only by the reload button. Its worker-revision endpoint exists only in the verification server.

## Headers, releases and storage

Serve JavaScript as a JavaScript MIME type, the manifest as application/manifest+json and icons with their proper types. Keep index.html, sw.js and the manifest revalidatable (`Cache-Control: no-cache` where configurable). Fingerprinted assets may use long immutable caching. Publish complete builds atomically and retain old fingerprinted assets long enough for users with a waiting update. Never add provider/authenticated runtime caching or a blanket service-worker navigation fallback. Changes to base paths/origins create different storage contexts and do not migrate local datasets/keys.

The update prompt warns before reloading. Saved library/preferences survive ordinary upgrades; memory-only live data and keys do not. Clearing all site data removes the shell, imported/demo library and remembered keys. Third-party notice and MIT license text are included in build output but are not offline-precache entries. Market-data licensing is independent of deployment/code licensing.

CI only verifies; it does not deploy. No hosting credentials, paid service or real market-data key is needed for fixture checks. Review the release locally before deciding where to publish.
