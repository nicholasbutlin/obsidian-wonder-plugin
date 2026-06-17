# Plan — Wonder: Kanban ↔ Tasks date bridge

## Phase 0 — COMPLETE (shipped through 1.4.1)

**Approach A — `📅`-only canonical dates on board files.** Kanban's picker writes
`@{}`; Wonder converts to a single canonical `📅` on the card's **main line**.
Kanban displays + colours the `📅` natively (overdue red / soon orange). Editing
is two-way: pick in Kanban → reconcile; edit `📅` from Tasks/Reminders → shown
directly. See memory: `wonder-phase0-date-strategy`, `wonder-deploy-loop`.

### Shipped
- 1.1.0 — convert `@{}` → `📅`; `normalizeKanbanDates` setting; board routing
- 1.2.0 — reconcile a re-picked date to a single `📅` (drop the stale one)
- 1.3.0 — lift the `📅` onto the card's main `- [ ]` line (multi-line cards)
- 1.4.0 — re-render the open Kanban board after writing (`setViewData`)
- 1.4.1 — **the fix that makes live picks convert**: route board-vs-note when the
  debounce fires (cache settled), not at event time when a Kanban save has
  invalidated the metadata cache and a board would mis-route to the action scan

### Verified
- 30 unit tests (pure transform + `DateNormalizer` + routing); build + lint clean
- both boards healed to single main-line `📅`; live reconcile via modify
- **PENDING user check:** live Kanban pick on 1.4.1 (BRAT) collapses within ~1–2s

## Next work

### Residual (small, optional)
- [ ] **Footer placement (cosmetic):** Kanban `inline-metadata-position` defaults to
  body; the "Move task data to card footer" toggle isn't persisting. Body is fine;
  decide if footer is wanted, then make the toggle stick (or set the key directly).
- [ ] **Picker opens blank** on re-pick (Kanban can't seed from a `📅`) — accepted
  tradeoff of Approach A; revisit only if it becomes annoying.
- [ ] **`@[[date]]` stamps:** Kanban treats these as its own date in daily-note-link
  mode, so re-picking on such a card replaces the stamp. Watch if relying on them.

### Phase 1 — capture (from `_re/Wonder Plugin Plan.md`)
- [ ] **F1:** `@action` emits a canonical Tasks line `- [ ] {text} ➕ {today} ^id`
  (via `task-format`) so captured actions are real Tasks the board, Dataview, and
  Remindian all see — instead of a plain bullet.
- [ ] Grow `task-format.ts` into the full formatter: `done ✅`, priority `⏫`,
  start `🛫`, `markDone`.
- [ ] "Complete task here" command using `task-format.markDone` (writes `✅` so
  Remindian + Kanban Done agree).

## Deploy loop (reference)
code → push `main` → CI semantic-release → GitHub release (+ `versions.json`/
manifest bump) → **BRAT "Check for updates"** → reload. Hot Reload is OFF.
No manual file copying — BRAT owns the vault plugin folder.
