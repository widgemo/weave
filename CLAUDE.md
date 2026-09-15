# Weave — Integration Diagram Studio
**by Widgemo**

## What this is
A single-page HTML app for diagramming integration event flows between systems.
It supports two modes: Timeline (timestamp-based) and Flow (causal/trigger-based).
Deployed as a GitHub Pages site.

## Tech stack
- Vanilla JS (ES5-compatible, no framework, no bundler)
- Hand-rolled SVG rendering (no D3 or charting libraries)
- CSS custom properties for theming (dark/light mode)
- Single `index.html` entry point for GitHub Pages

## Architecture (after refactor)
- `index.html` — shell, layout HTML, CSS custom properties, and the `<script>` load order (see below)
- `css/styles.css` — all styles
- `js/logger.js` — in-memory app log (viewable via the Logs button) and the error banner
- `js/state.js` — app state: events, systems, actors, sysOrder, appMode, theme-aware `svgColors()`, timestamp/timezone helpers
- `js/render.js` — SVG primitive builders, the mode dispatcher (`render()`), zoom/pan/scroll-arrow handling, List and Table view rendering, and geometry helpers shared by the two diagram renderers below (`groupAndOffsetArrows`, `perpOffset`, `clipToShape`, `natureColor`, `drawSeqBadge`)
- `js/render-flow.js` — Flow mode diagram rendering (causal/topo-sorted layout)
- `js/render-timeline.js` — Timeline mode diagram rendering (timestamp-based, compact/linear scale)
- `js/import-export.js` — JSON import/export, localStorage persistence, and schema migration (`migrateData()`)
- `js/filter.js` — the filter bar (search text, system/actor/level/code multiselects, event isolation)
- `js/ui-modals.js` — the event context menu, and the About/Confirm/Export-filename modals
- `js/ui-sidebar.js` — banner chrome (file menu, theme toggle, legend), mode/tab switching, the event list, timezone selector, and app init
- `js/ui-forms.js` — the event + interaction add/edit form, scenario save, clear/new-diagram actions
- `js/ui-registry.js` — the Systems/Actors registry CRUD and system lane-order UI
- `js/keyboard.js` — global keyboard shortcuts (delete/duplicate/nudge lane-or-sequence/escape) for canvas and Table mode selection
- `js/datasource-auth.js` — data-source OAuth 2.0 (PKCE) flow, token storage, and the connection config UI
- `js/datasource-query.js` — data-source query form, results list, and record→event field mapping

None of these are ES modules — every file is loaded via a plain `<script>` tag in `index.html` (in the order listed above) and shares one global scope, per the "no build step" constraint below. Splitting a file further only changes which `<script>` tag a function lives in; it does not change how functions call each other.

## Key data structures
- `events[]` — array of event objects `{_id, desc, system, actor, timestamp, interactions[], mode}`
- `interactions[]` — `{target, nature (push|pull|process), delay, order, label, triggerEventId}`
- `sysOrder{}` — `{systemName: orderNumber}` for lane ordering
- `systemsRegistry[]` — `{name, desc, order}`
- `actorsRegistry[]` — `{name, desc}`

## Diagram rendering rules
- Push: arrow from source → target
- Pull: arrow from target → source (arrives at source event)
- Process: dashed line, NO arrowhead
- Arrowheads use SVG markers with unique IDs per render (`arr-push-{rid}`)
- Lines clip to box/circle edges so arrowheads sit on the card border

## About section & versioning
- `APP_VERSION` is declared in `js/state.js` and displayed in the About modal (opened via the "About" banner button).
- Version format is `YYYY.MM.DD` (UTC date), auto-updated by the GitHub Actions workflow at `.github/workflows/update-version.yml` on every push to `main`.
- The workflow runs a `sed` command to patch `APP_VERSION` in `js/state.js` and commits the change automatically. The commit message is `chore: update version to YYYY.MM.DD` — the workflow skips itself when it sees this message to avoid infinite loops.
- To manually set a version, edit the `APP_VERSION` line in `js/state.js`:
  ```js
  var APP_VERSION = '2026.04.03';
  ```

## Data source subsystem (`js/datasource-auth.js` + `js/datasource-query.js`)
Weave can pull records from an external REST API (e.g. a ServiceNow instance) and
import them as diagram events — this is separate from the JSON file Import/Export
in `js/import-export.js`.
- **Auth** (`js/datasource-auth.js`): a generic OAuth 2.0 Authorization Code + PKCE
  client. Config (base URL, client ID, scope, auth/token paths) is stored in
  `localStorage` under `weave-ds-config`; the access/refresh token under
  `weave-ds-token`; the in-flight PKCE verifier/state under `sessionStorage`
  (`weave-ds-pkce`, cleared on tab close). Default auth/token paths
  (`/oauth_auth.do`, `/oauth_token.do`) follow ServiceNow's OAuth endpoint
  convention, but the client itself is instance-agnostic — any OAuth 2.0 + PKCE
  REST API can be configured.
- **Query & mapping** (`js/datasource-query.js`): the query form (endpoint path +
  query string), the results list, and `dsRecordToEvent()` which maps configurable
  response fields (description, system, actor, timestamp, event/integration code,
  level, and an optional interactions array) onto a diagram event. Query form state
  persists to `localStorage` (`weave-ds-query`) and can be exported/imported as a
  standalone JSON file, independent of the diagram JSON export.
- Both files are loaded after `js/ui-modals.js` (for `promptExportFilename`) and
  before the inline `dsInit()` call at the end of `index.html`.
- **Stable IDs and causal (Triggers Event) chains**: the field-mapping form has an
  optional "Record ID field" (mapped onto the imported event's `_id`, instead of an
  auto-generated one) and, per-interaction, an optional "Triggers Event field"
  (mapped onto `interactions[].triggerEventId`). Neither is ServiceNow-specific —
  they're generic importer capabilities that let *any* source express causal links
  between records it returns (e.g. "this Business Rule's execution leads into that
  Script Include"), which Flow mode already renders as a topologically-sorted
  arrow rather than a lane-based one. Example: importing ServiceNow Business
  Rules/Script Includes from a custom Scripted REST API that has already resolved
  each script's GlideRecord table usage server-side (Weave itself does no
  script-source parsing — keeping this generic importer instance-agnostic per the
  constraint above):
  ```json
  {
    "result": [
      {
        "sys_id": "abc123",
        "name": "Update Related Cases",
        "table": "incident",
        "interactions": [
          {"target": "sys_user", "nature": "pull", "label": "look up caller"},
          {"target": "def456", "nature": "process", "label": "calls MyScriptInclude.doThing()", "triggerEventId": "def456"}
        ]
      },
      {"sys_id": "def456", "name": "MyScriptInclude.doThing", "table": "global", "interactions": []}
    ]
  }
  ```
  mapped with: Record ID field=`sys_id`, Description field=`name`, System
  field=`table`, Interactions field=`interactions`, Target field=`target`,
  Nature field=`nature`, Triggers Event field=`triggerEventId`. Note `nature`
  must already be exactly `push`/`pull`/`process` when it arrives — translating
  GlideRecord operation names (query/insert/update/etc.) into that vocabulary is
  the source endpoint's job, not Weave's. **Known limitation** (pre-existing Flow
  rendering behavior, not specific to this mapping): a `triggerEventId` that
  doesn't resolve to any currently-loaded event — e.g. the target script was
  filtered out of the query, or lives on a page never fetched — silently produces
  no edge at all for that interaction, neither causal nor lane-based.

## Important constraints
- Must remain deployable as static GitHub Pages (no server, no build step)
- All files are loaded via relative paths — no CDN JS dependencies
- Google Fonts CDN is acceptable (CSS only, graceful degradation)
- Do not introduce npm, webpack, or any build toolchain
- Maintain dark/light mode support throughout (CSS vars + svgColors() fn)
- SVG colors are set via JS (not CSS) because SVG attributes can't use CSS vars
