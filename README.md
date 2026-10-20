# PL Fantasy Basketball

Mobile-first fantasy basketball tools with the approved purple interface. The published site remains at https://ryan-trann.github.io/ryans-draft-room/.

## Build and publish

Use Node.js 22.12 or later, run `npm ci`, then `npm run build`. The build writes `dist/index.html` and hashed assets under `dist/assets/`. Publish that HTML to repository-root `index.html` and copy `dist/assets/` to root `assets/`. Keep `index.source.html` as the editable HTML source. The existing GitHub Pages configuration serves the repository root.

The classic files (`analysis-tools.js`, projections, saved rosters, draft history, schedule, upload pages) remain at the repository root. `modern-bridge.js` connects the interface to their live state. Rebuilds copy these files to `dist/` for local testing; do not overwrite newer saved roster or schedule data when publishing UI changes.

## Behavior and compatibility

The five tabs provide team management, category rankings, player search and comparison, trade analysis, and streaming. Menu → Draft archive & backups opens the original draft controls, backup/restore, and upload links. If initialization fails, the original tools remain available.

GitHub roster saves retain the original one-time token, review/confirmation, and concurrent-revision protection. Tokens are not stored by the new interface. A serialization fix saves canonical projection names instead of disambiguated display labels so players with duplicate abbreviated names can reload correctly.

## Verification

After `npm run build`, install a Playwright Chromium browser (`npx playwright install chromium`) and run `npm run test:production`. The test serves the GitHub Pages subpath, mocks all GitHub API writes, and checks live data, calculation parity, save/reload, concurrent edits, comparisons, rankings, search, streaming, backups, and responsive layout. An existing browser can be supplied with `QA_BROWSER_EXECUTABLE` and JSON `QA_BROWSER_ARGS`. Evidence is written to `../production-evidence/`.
