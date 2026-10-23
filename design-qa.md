# Purple redesign production QA

final result: passed

Source visual truth: `../generated_images/exec-0ae098e4-6890-48a3-bb41-6ba06414fbdb.png` (853 × 1843). Implementation: `../production-evidence/01-team-mobile.png`, `02-trade-mobile.png`, `03-comparison-mobile.png`, `04-stream-mobile.png`, `05-team-desktop.png`. Combined comparison: `../production-evidence/design-comparison.png`.

CSS viewport: 393 × 852, device scale factor 1; implementation pixels 393 × 852. Desktop: 1280 × 900. The selected source was downsampled to 394 × 852 in the combined input. Both source and implementation show the purple dark theme; the Trades capture matches the source analysis state. Team is the production starting tab. Native browser safe areas replace prototype device chrome.

## Findings

No remaining actionable P0/P1/P2 visual findings. Display typography, purple hierarchy, team selector, analysis switch, paired player cards, live impact values, category table, primary action and five-tab navigation retain the selected direction. Source mock values +0.219 and −0.255 agree with the original production calculation.

Five fidelity surfaces reviewed: condensed display and Inter UI typography remain readable; spacing and section rhythm preserve hierarchy; near-black surfaces/purple accents/mint gains/amber losses preserve tokens; circular player initials and standard interface icons require no photographic assets; actual roster names, ranks, live projections and save state replace illustrative content. The readable full-size comparison supports inspection of small table and navigation text without a separate crop. Native web font rendering and larger tap targets are acceptable production adaptations.

## Comparison and verification history

The prototype passed its earlier source comparison. Native integration first exposed a saved-name identity issue and a success toast blocking a subsequent action; canonical serialization and nonblocking toast placement fixed these issues. The post-fix browser suite passed at mobile and desktop sizes. The final comparison above was reviewed after those fixes; no further visual fixes were required.

Primary interactions tested: all five tabs; live 300-player projection data and 168 saved players; trade/category calculation parity; review before saving; missing-token guard; mocked GitHub save and reload; canonical duplicate-name identities; unchanged draft history; stale revision protection; player comparison; search and ADP sorting; streaming from the original schedule; archive and backup access; mobile overflow. No browser application errors. GitHub API writes were mocked, so QA did not alter actual saved rosters.

## Implementation checklist

- [x] Preserve live original calculations and saved data files.
- [x] Verify native mobile and desktop browser screenshots.
- [x] Verify save, reload, and concurrent revision safeguards.
- [x] Compare selected source and implementation together.
- [x] Check all five fidelity surfaces.

Follow-up limit: desktop Chromium emulation verifies the iPhone viewport and touch layout; physical iPhone Safari was not available for this test.

## v30 tool continuity update

Draft Center, projection uploads and saved-team restore now share the purple header, version label, back action and bottom navigation. Screens: `../production-evidence/06-draft-mobile.png`, `07a-projections-start-mobile.png`, `07-projections-mobile.png`, `08-restore-mobile.png`. Existing form validation and publication handlers are retained and scoped to avoid duplicate element IDs. Old upload URLs redirect into the app. Completed drafts now clear stale on-the-clock context. Browser checks cover draft record/undo/local backup restore, 300-player validation, missing-token protection, one mocked projection publication with token clearing, 168-pick restore validation, and the old upload URL redirect. No application errors; checks passed at 393 × 852 and 1280 × 900.

The first upload capture exposed a clipped one-line heading at 393 px. Tool-page headings now wrap naturally; the refreshed `07a-projections-start-mobile.png` shows the full heading, and a browser assertion verifies its content width. Post-fix suite: passed.

A purple loading state now covers original markup during initialization; successful startup hides the loading state, while startup failure reveals the existing fallback tools. This avoids a brief old-interface flash when opening saved upload links.

## v57 audit of the expanded app (2026-10-22 Pacific)

final result: passed

Scope: current v56 production, compared with the corrected v57 implementation. Source truth is the live v56 interface and fresh screenshots in `../audit-2026-10-22/screens/`; mobile before/after captures are in its `before/` and `after/` directories. Viewports: 393 × 852 and 375 × 812 CSS pixels at density 1, plus live desktop cloud-browser inspection.

Findings resolved:
- P1: one-for-one player pickers incorrectly excluded the player held by an invisible second slot. Only visible package slots now exclude duplicates; empty searches offer a clear recovery action.
- P1: searching for Keith still labeled recommendations as Ryan and opening analysis silently substituted Ryan’s player. Recommendation details and analysis now retain the searched team, format, and exact players.
- P2: search selectors could change while work ran, and Trades/Stream shared one loading flag. In-flight trade controls are disabled, feature loading states are separate, and duplicate stream starts are blocked.
- P2: the full weekly-pot board pushed category rankings below most of the phone viewport. A compact expandable summary shows the selected team’s share and keeps all 12 teams one tap away. Wording distinguishes expected split-pot share, category shares, and percentage-point changes.
- P2: asymmetric trade cards had misaligned headings and touching second cards. All multi-player packages align at the top with consistent spacing; recommendation analysis also uses the same avatar cards.
- P2: queued IL changes showed saved-only IL status and offered duplicate actions. Manage now previews the original editor’s working IL state and labels it as a preview. IL buttons have 44 px minimum targets.
- P2: trade results exposed literal `{ideas.avoided}` text, and streaming could show a positive improvement as +0.0 pp. Both displays are corrected without changing the models.

Evidence: full before/after rankings and 2:1 comparisons are saved as `03-ranks-comparison.png` and `09-trade-two-one-comparison.png`; post-fix `13-deal-detail.png` and `14-recommended-analysis.png` retain Keith and the exact recommended players. The source models and data files were compared byte-for-byte and preserved. One early local capture lacked the independently published injury snapshot; post-fix captures serve the actual snapshot, so injury-adjusted cash values can differ in that comparison. This is a data-loading difference rather than a model change.

Fidelity surfaces: existing condensed heading/Inter typography retained; black/purple/mint/amber tokens retained; layout rhythm and radii follow existing cards; player initials use the existing avatar component with no new raster assets; labels refer to the selected manager and current navigation. No unresolved P0/P1/P2 visual findings in reviewed states.

Validation: TypeScript/build passed; injury identity tests passed; the existing production suite passed with added regressions for cross-team handoffs, complete 1:1 selection, empty search recovery, independent search state, collapsed/expanded weekly shares, and IL previews. Existing save/reload, missing-token, stale-revision, upload, backup reconciliation, comparison, schedule and CSP checks passed. GitHub writes were mocked; the audit did not save actual roster or projection changes. Nineteen mobile states passed heading/page-overflow checks with zero browser application errors.

Limits: Chromium touch emulation was used for phone sizes; physical Safari and VoiceOver were not available. This is not a WCAG compliance certification or independent validation of the fantasy projection model.


## v58 — daily lineup projection correction

- Full-season team totals now derive from per-game rates and daily published NBA dates, subject to PG/SG/G/SF/PF/F/2C/3UTIL. All nine categories use one consistent strongest-overall lineup. IL is excluded, multi-position matching shares the streaming matcher, and original projected GP availability is retained.
- Team/Ranks, category gaps, manual/recommended trade rank previews, category-share search screening, and seasonal pot model inputs use the same adjusted totals. Corrected the adapter that previously ignored hypothetical rosters.
- Ranks includes expandable model/coverage details and selected-team scheduled/startable/slot-blocked game counts. Unavailable schedule data gives a persistent explicit fallback notice with retry. Individual player projections, saved rosters, draft history, GitHub save controls, and CSP remain intact.
- Revision 6 roster example: Alan has 1,120 published scheduled player-games, 1,046 startable and 74 slot-blocked before projected availability. DREB estimate changes from 5,136.6 unrestricted to 4,747.3 after coverage and lineup adjustment. Coverage is 80 assigned games per NBA team; two unassigned regular-season games are excluded.
- Validation: typecheck/build; focused lineup tests (including exhaustive feasible-subset comparisons); injury identity tests; full production regression at 393×852 and 1280×900 plus schedule failure/retry at 375×812. Browser regression verifies displayed season totals and proposed-roster ranks against the projection model. All GitHub saves in tests are intercepted fixtures.


## v59 — Season / Week ranking control

- Added an independent ranking-period toggle and accessible matchup selector with date ranges, previous/next controls, and current-week shortcut. Reuses the published Streaming matchup calendar, including extended weeks. Full selected-week projections are labeled separately from live results.
- All Ranks views, gaps, counts and weekly-pot shares use the chosen period. Team and trade analysis retain their season projections. Schedule failures disable Week and preserve the explicit season fallback notice.
- Validation covers inclusive window boundaries, empty periods, season immutability, week-to-week total/rank changes, every weekly league matrix cell, first/last-week limits, current-week reset, season restoration, schedule failure and 375px mobile overflow. Full regression checks roster saving, projection uploads, draft controls and streaming.
