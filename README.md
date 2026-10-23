# PL Fantasy Basketball

Mobile-first fantasy basketball tools with the approved purple interface. The published site remains at https://ryan-trann.github.io/ryans-draft-room/.

## Build and publish

Use Node.js 22.12 or later, run `npm ci`, then `npm run build`. The build writes `dist/index.html` and hashed assets under `dist/assets/`. Publish that HTML to repository-root `index.html` and copy `dist/assets/` to root `assets/`. Keep `index.source.html` as the editable HTML source. The existing GitHub Pages configuration serves the repository root.

The classic files (`analysis-tools.js`, projections, saved rosters, draft history, schedule, upload pages) remain at the repository root. `modern-bridge.js` connects the interface to their live state. Rebuilds copy these files to `dist/` for local testing; do not overwrite newer saved roster or schedule data when publishing UI changes.

## Behavior and compatibility

The six tabs provide team management, category rankings, player search and comparison, trade analysis, and streaming. Menu → Draft & backups opens draft controls and backup/restore inside the purple app shell. GitHub & projections opens native projection upload and saved-team restore screens. Old upload URLs redirect to their matching app routes. Draft controls retain their original event handlers and state. Upload and restore forms retain their original validation and publication code, scoped to each form. If initialization fails, the original tools remain available.

GitHub roster saves retain the original one-time token, review/confirmation, and concurrent-revision protection. Tokens are not stored by the new interface. A serialization fix saves canonical projection names instead of disambiguated display labels so players with duplicate abbreviated names can reload correctly.

## Verification

After `npm run build`, install a Playwright Chromium browser (`npx playwright install chromium`) and run `npm run test:production`. The test serves the GitHub Pages subpath, mocks all GitHub API writes, and checks live data, calculation parity, save/reload, concurrent edits, comparisons, rankings, search, streaming, backups, and responsive layout. An existing browser can be supplied with `QA_BROWSER_EXECUTABLE` and JSON `QA_BROWSER_ARGS`. Evidence is written to `../production-evidence/`.

## Schedule-aware projections (v58)

Team ranks, category gaps, category-share trade screening, and weekly-pot estimates use per-game rates and the published `nba-schedule.json`. Each date selects one maximum-size legal lineup in descending equal-weight nine-category per-game z-score order, using augmenting-path position matching: PG, SG, G, SF, PF, F, C, C, UTIL, UTIL, UTIL. All categories use the same starters. Saved IL players are excluded before projecting; multi-position players can fill any eligible slot. Seven C-only players on one date can contribute at most five games.

Each selected game contributes season-stat / projected-GP × min(1, projected-GP / 82). This retains the source GP availability forecast without guessing future injury dates or filling projected absences with bench games. Rankings cover the full published season, including past scheduled dates, and contain no actual results. The current 1,200-game schedule has 80 assigned games per NBA team; unassigned games contribute nothing until dates are published. The Ranks screen explains coverage and shows scheduled, startable, and slot-blocked player-games before the availability adjustment. If the schedule cannot load or validate, a persistent notice labels unrestricted fallback estimates and offers Retry schedule. Player comparisons retain the original individual season projections.

Trade previews recompute the proposed active rosters rather than reusing saved-roster ranks. Existing pot simulations, injury adjustments, trade fairness/rival screening, and streaming eligibility rules are retained; the team totals feeding season models now obey the daily lineup limits. Streaming shares the same position matcher. These projections assume consistent strongest-overall lineups, not category-specific daily coaching or knowledge of future absences.

Run `node scripts/test-lineups.mjs` to verify positional congestion, flexible eligibility, maximal legal lineups against exhaustive subset checks, schedule aliases/duplicates, GP weighting, proposed rosters, and tied ranks. CI runs these checks before the production browser suite and verified publication.
