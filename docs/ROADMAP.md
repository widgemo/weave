# Weave v2 Roadmap

**Status:** proposal / discussion draft
**Prepared:** 2026-09-14
**Scope:** analysis only — no code changed as part of this document

## Why this document exists

Weave has grown from a diagramming tool into something closer to a
ServiceNow integration-analysis workbench: it's used to model current-state
implementations (business rules, the records they touch, the script
includes they call), to sketch upcoming designs, and — via a data-source
connection into a ServiceNow instance — to pull `work_notes`, comments, and
an Integration Events table onto a timeline for troubleshooting.

The app has kept up feature-for-feature, but two things haven't kept pace:
the UI (an always-open sidebar form model that predates canvas-first
editing) and the file structure (a few files have absorbed far more
responsibility than their names suggest). This document lays out what the
next version should address, grounded in a full pass over the current
codebase, and reflects direction decisions already made with the app's
primary user.

## Executive summary

Weave v2 should move from a **form-first** tool to a **canvas-first** one:
click a node to edit just that node in a focused inspector, instead of
keeping one long form permanently open in the sidebar. Diagrams that are
mostly auto-laid-out should stay that way, but authors should be able to
drag a node to override its position or lane when the automatic layout
doesn't match how they want to explain something. Underneath, three files
have outgrown their original shape (`js/ui.js`, `js/datasource-auth.js`,
and the render pair `render-flow.js`/`render-timeline.js`) and should be
split and de-duplicated before more UI work lands on top of them — doing
the UI work first would mean rebuilding on the same shaky foundation twice.

---

## 1. Current-state assessment

### 1.1 Structure

5,094 lines across 11 JS files, still zero-build-step vanilla JS/SVG per
`CLAUDE.md`'s constraints — that constraint is working fine and should
stay. The problem isn't the *approach*, it's that responsibility has
piled up unevenly:

| File | Lines | Functions | Notes |
|---|---:|---:|---|
| `js/datasource-auth.js` | 847 | 46 | Full OAuth2 PKCE + REST query client. **Not mentioned in `CLAUDE.md` at all.** |
| `js/ui.js` | 841 | 68 | Menus, modals, theme toggle, tab switching, the event/interaction form, and CRUD for 3 registries. |
| `js/render.js` | 721 | — | SVG primitives, mode dispatch, zoom/pan, table/list rendering. |
| `js/render-timeline.js` | 446 | — | Essentially one 368-line function (`renderTimeline`). |
| `js/render-flow.js` | 341 | — | Essentially one function spanning the whole file (`renderFlow`). |
| `js/state.js` | 218 | — | Reasonably scoped. |
| `js/filter.js` | 178 | — | Reasonably scoped. |
| `js/import-export.js` | 163 | — | Reasonably scoped; has a schema `version` field but no migration logic. |
| `js/logger.js` | 108 | — | Reasonably scoped. |

Specific issues worth naming:

- **`js/datasource-auth.js` is undocumented scope creep.** It's the
  largest file in the project — a complete OAuth2 Authorization
  Code+PKCE client, token refresh/CSRF handling, a REST query UI, and a
  configurable record→event field mapper (`dsRecordToEvent`) — and
  `CLAUDE.md`'s architecture section doesn't mention it exists. Whatever
  else changes, this needs a home in the docs.
- **`js/ui.js` is a dumping ground.** 68 top-level functions covering
  file menu, context menus, three kinds of modals, theme toggling, the
  event+interaction form (`saveEvent`, `addIField`, `moveI`), and CRUD
  for systems/actors/scenario metadata. None of these are wrong to have,
  but they don't belong in one file together.
- **`render-flow.js` and `render-timeline.js` duplicate real logic**, not
  boilerplate: arrow-pairing/offset math (`pairKey`/`isFwd`/`perpOffset`),
  edge-clipping vector math (box-shaped vs. circle-shaped variants of the
  same computation), push/pull/process→color mapping, sequence-number
  badge drawing, and lane striping are each reimplemented per file. A bug
  fix or visual tweak to one of these today has to be remembered and
  reapplied to the other file by hand.
- **No schema migration path.** `import-export.js` writes a `version`
  field into every export but has no `if (version < N) upgrade()` logic —
  compatibility has been patched ad hoc (e.g. a special case for old
  exports that stored `viewMode:'table'` under `appMode:'timeline'`).
  This will get harder to maintain as the schema keeps evolving.
- **No undo/redo, no keyboard shortcuts, no freeform node positions.**
  Today's layout is fully computed — Flow mode topologically sorts events
  by their `triggerEventId` causal links and lanes them by system;
  Timeline mode places events by timestamp on a custom "compact scale"
  that compresses large idle gaps. The only manual lever is a system lane
  order list in the Diagram tab.

### 1.2 UI / interaction model

The left sidebar has five tabs — **Add/Edit**, **Events**, **Diagram**,
**Registry**, **Data** — and every one of them is an always-open inline
panel; the only modals in the app are About, Confirm, and the
export-filename prompt.

- Creating or editing an event means being on the Add/Edit tab, filling a
  form with description/system/actor/level/codes/timestamp, then adding
  interaction sub-blocks one at a time (target, label, push/pull/process,
  delay or "triggers event"). Editing an existing event re-populates this
  exact form and switches you back to that tab.
- There's no "click the node you care about" flow — the form is
  positionally and conceptually separate from the diagram it's editing.
- The Data tab (the OAuth/REST importer) lives in the same sidebar space
  and tab row as diagram-authoring tools, even though it's a fundamentally
  different activity (configuring an external connection vs. drawing a
  diagram).
- Registry management (systems, actors) shares the same weight and
  visual treatment as event editing, despite being edited far less often.

This is almost certainly the root of "the UI is a bit confusing" — the
sidebar is trying to be a settings panel, a CRUD form, an importer, and a
canvas inspector all at once, with no visual hierarchy distinguishing
"things I do constantly" from "things I set up once."

### 1.3 ServiceNow usage today

`js/datasource-auth.js` already supports the two ServiceNow workflows in
use (`work_notes`/comments on a timeline, and an Integration Events table)
via a generic mechanism: OAuth2 against a configurable base URL/client
ID/scope (defaulting to ServiceNow's conventional `/oauth_auth.do` and
`/oauth_token.do` paths), then a configurable field mapper from arbitrary
JSON records to event objects. It is not ServiceNow-specific code — it's a
generic REST importer that happens to default to ServiceNow's OAuth
endpoint names. Per direction from the app's primary user, **this should
stay generic** rather than growing ServiceNow table/journal-specific
presets — the ask is UX polish on the existing mapper (clearer
field-mapping UI, inline error/validation surfacing, visible pagination
for large result sets), not new ServiceNow-aware logic.

---

## 2. Recommended direction for v2

### 2.1 UX redesign: contextual inspector panel — **core mechanism done**

The click-to-inspect empty/form toggle described below shipped as the
"Inspector" tab. Still open: moving Registry management to a lighter-weight
surface, and separating the Diagram tab's display controls further —
neither was in scope for the initial pass.

Replace the permanently-open Add/Edit tab with **click-to-inspect**:
clicking a node/event on the canvas opens a focused panel scoped to that
one item, reusing the existing form logic in `js/ui.js`
(`saveEvent`, `addIField`, `moveI`, etc.) rather than rewriting it from
scratch.

- "Add new event" becomes an explicit action (a toolbar button, or an
  empty-canvas call to action) instead of a tab that's always sitting
  open and empty.
- The inspector can occupy the same sidebar real estate the Add/Edit tab
  uses today — this is a change in *when* the form appears and *what it's
  scoped to*, not necessarily a full layout rebuild.
- Registry (systems/actors) management moves to a lighter-weight,
  less-prominent surface — it's configuration, not the primary workflow.
- The Diagram tab's display/format controls (card fields, timestamp
  format, legend) stay separate from "what's in the diagram" — that
  separation is already conceptually right, it just needs the event
  authoring pulled out from alongside it.

This directly addresses "the left side panel is confusing": today it
mixes four different jobs at once; splitting "inspect/edit the thing I
clicked" from "configure how everything looks" from "manage systems and
actors" from "connect to a data source" gives each its own moment instead
of five competing tabs.

### 2.2 Drag-and-drop: order/lane override — **done**

Scoped intentionally to **override, not replace** the automatic layout —
full freeform positioning was considered and set aside in favor of this
lighter approach, which keeps diagrams visually consistent while still
giving authors a way to fix a layout that doesn't read well automatically.

- **Both modes**: dragging a node across lanes reassigns its `system` —
  functionally the same as editing the system field in the inspector, just
  done directly on canvas. Reuses the existing `sysOrder`/`getSysArray()`
  machinery in `state.js` rather than adding a parallel positioning system.
- **Flow mode**: dragging a node along the causal-order axis overrides its
  position in the topo-sorted sequence, stored as an event field
  (`layoutAfterId`, an anchor-based override — "place this event immediately
  after event X" — rather than an absolute rank, since that's both what the
  drag gesture naturally produces and more stable under insertions) that
  `renderFlow`'s topo sort consults before falling back to computed order.
  Reset back to automatic via a "Reset Order to Automatic" item in the
  existing right-click context menu; overridden nodes show a small pin badge.
  A single drag gesture on a node dispatches to lane-reassign or
  sequence-override depending on which axis the user actually drags.
- The existing sidebar event-list drag-to-reorder (Flow mode only,
  `js/ui-sidebar.js`, `updateList()`) was deliberately left alone — it
  reorders the underlying `events[]` array, which only affects the
  *fallback* position of edgeless/unvisited nodes and is always superseded
  by a `layoutAfterId` override where one is set, so the two coexist without
  conflict. Retiring it remains a candidate for later, lower-priority cleanup
  — two ways to do the same thing would be redundant.
- Always keep a visible "reset to automatic layout" affordance per node
  or globally, so overrides don't become a one-way trip.

### 2.3 Structural refactor (do this first)

This is foundational rather than user-facing, and should land **before**
the UI redesign — otherwise the inspector panel gets built by carving a
new feature out of the same `ui.js` dumping ground it's meant to fix.

- **Split `js/ui.js`** along the seams the codebase already implies:
  modals (`ui-modals.js`), the event/interaction form (`ui-inspector.js`
  once 2.1 lands, or `ui-forms.js` until then), registry CRUD
  (`ui-registry.js`), and sidebar/tab chrome (`ui-sidebar.js`).
- **De-duplicate `render-flow.js` / `render-timeline.js`** by lifting the
  shared logic into `render.js`: a `groupAndOffsetArrows()` for the
  pairing/offset math, `natureColor()` for push/pull/process coloring, a
  `drawSeqBadge()` helper, and a unified `clipToShape()` that takes a box
  or circle instead of two separate clipping functions.
- **Document `js/datasource-auth.js`** as its own subsystem in
  `CLAUDE.md` at minimum. Given its size, also consider splitting it into
  an auth-only `datasource-auth.js` (PKCE/token handling) and a
  `datasource-query.js` (query UI + record-to-event mapping) — these are
  genuinely separate concerns bolted into one file today.
- **Add schema migration** to `import-export.js`: a small
  `version → upgrade()` chain keyed off the existing `version` field, so
  future schema changes don't accumulate as more ad hoc special cases.
- None of this changes the "no build step" constraint — it's still plain
  `<script>` includes in `index.html`, just more of them, each named for
  what it actually does.

### 2.4 Data-source importer: UX polish (generic, not ServiceNow-specific) — **done**

Per explicit direction, kept the importer instance-agnostic rather than
adding ServiceNow table/journal presets.

- **Clearer field-mapping UI**: every mapping input now offers `<datalist>`
  autocomplete populated from the actual field names seen in the last query's
  results (free typing still works), plus a live preview card showing how
  the first result maps to an event as the mapping is edited.
- **Inline validation and error surfacing**: query-time HTTP/network failures
  and a "not connected" response now show a clear inline message in the
  panel itself (additive to the existing global banner/log trail), and any
  result whose mapped System would be blank is visibly flagged on its own
  card — still importable, just unmistakably marked rather than silently
  producing a broken event.
- **Visible pagination**: a configurable Page Size + Offset Param Name (the
  user names their own API's convention, e.g. `sysparm_offset` or `offset`)
  drive Prev/Next controls that auto-disable on a short last page — no
  hardcoded API convention, no total-count assumption.

### 2.6 Terminology genericity + automatic/manual interaction flag — **done**

A review of every event-attribute and interaction label flagged a few that
read as ServiceNow-specific jargon or were inconsistent across the app, and
a gap in the interaction model: there was no way to record whether an
interaction happened automatically (a business rule, a scheduled job) or was
performed manually (a person ran a script, updated a record by hand) —
distinctions that matter both for diagramming current-state integrations and
for troubleshooting from timeline data.

- **Labels renamed (display text only — every stored key/value is
  unchanged, zero migration risk)**: the `work_note` Event Level now
  displays as "Internal Note" instead of "Work Note"; "Managed Integration
  Code" (previously inconsistent with the "Integration Code" label used
  everywhere else the same field appears) is now just "Integration Code"
  everywhere.
- **New `manual` field on interactions**, independent of the existing
  `nature` (push/pull/process) field: a boolean, defaulting to
  absent/`false` (automatic) so every existing interaction is unaffected.
  Set via a "Manual" checkbox on each interaction in the event form.
- **Distinct line style for manual interactions**: rather than a badge or
  icon, a manual interaction renders with a dotted stroke (`1,3`); a manual
  *process* interaction (both flags set) renders with a dash-dot pattern
  (`5,2,1,2`) so it's distinguishable from both plain process and plain
  manual. A new shared `interactionDasharray()` helper in `render.js`
  computes this for both `render-flow.js` and `render-timeline.js`,
  continuing the de-duplication pattern from 2.3. The diagram legend gained
  a fourth "manual" entry.

### 2.5 Other gaps identified, not yet prioritized

Flagged for a later v2.x rather than blocking this roadmap:

- **No undo/redo** — any accidental delete or edit is permanent within a
  session (aside from re-importing a prior export).
- **No keyboard shortcuts** — no delete/duplicate/nudge/escape bindings
  anywhere in the app.
- **Single-snapshot autosave** — `localStorage` persistence keeps only
  the latest state, no version history to roll back to.

---

## 3. Suggested phasing

This is a suggested order, not a fixed sequence — reorder freely:

1. **Structural refactor** (2.3) — de-risks everything else that touches
   `ui.js` or the render files, and is the lowest-risk, most mechanical
   phase (no behavior change).
2. **Contextual inspector panel** (2.1) — the highest-leverage UX fix,
   now built on the split files rather than the monolith.
3. **Drag-and-drop order/lane override** (2.2) — builds naturally on the
   inspector work (same node-click interaction surface) and the cleaned-up
   render files (2.3 already extracted the geometry helpers it needs).
4. **Data-source importer polish** (2.4) — independent of the above,
   can be pulled forward or done in parallel if there's a nearer-term
   need to keep the ServiceNow data flowing smoothly.
5. **Undo/redo, shortcuts, autosave history** (2.5) — pick up opportunistically
   once the above land.

---

## 4. Expanded use cases beyond ServiceNow

Weave's core model — lanes as systems/participants, nodes as timestamped or
causally-ordered events, and push/pull/process interactions between them —
is already generic enough to support diagramming and analysis work well
outside its original ServiceNow-integration niche. Worth keeping in mind
when prioritizing future work, since none of these need new fundamentals,
just the existing model applied elsewhere:

- **Business-process / workflow diagrams.** Flow mode's causal-trigger
  model (an event triggers the next via `triggerEventId`) maps directly
  onto any swimlane process diagram — approvals, order fulfillment, hiring
  workflows — not just system-to-system integrations.
- **Incident postmortems and timeline reconstruction.** Timeline mode plus
  the generic OAuth2/REST data-source importer (2.4) already works with any
  API that returns timestamped records, not only ServiceNow — PagerDuty,
  Jira, Datadog events, or any observability tool's event log. The new
  automatic/manual interaction flag (2.6) directly strengthens this use
  case: was a remediation step automated or performed by a person?
- **API/webhook interaction documentation.** The push/pull/process
  vocabulary already maps naturally onto request/response/side-effect
  documentation for any API surface, ServiceNow or not.
- **Data-pipeline lineage diagrams.** Systems-as-lanes and events-as-steps
  generalizes to ETL/data-pipeline stage tracking — a record moving through
  extract/transform/load stages is structurally the same diagram.
- **Runbook / playbook diagrams.** The manual-vs-automatic distinction
  (2.6) is exactly the call-out a runbook needs to make for each step.

None of this requires ServiceNow-specific code — it's the same argument
that's already driven keeping the data-source importer generic (1.3, 2.4):
the more Weave's model and terminology stay tool-agnostic, the more of
these use cases it can serve without divergent code paths.

---

## 5. Explicitly out of scope for this roadmap

Set aside based on direction already given, but worth revisiting later if
priorities change:

- **Full freeform node positioning** (vs. the order/lane override in
  2.2) — a bigger change requiring per-event `x`/`y` storage and a
  reset-to-auto-layout escape hatch. The lighter override approach was
  chosen instead.
- **ServiceNow-specific table/field presets** in the data-source importer
  — the importer stays generic; only its UX improves.
