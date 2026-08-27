# Wonder Plugin for Obsidian

[![CI](https://github.com/nicholasbutlin/obsidian-wonder-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/nicholasbutlin/obsidian-wonder-plugin/actions/workflows/ci.yml)

A small [Obsidian](https://obsidian.md) plugin that speeds up daily note-taking:
insert date headings from the editor menu, and turn inline `@action` markers
into linked tasks on a central Kanban note.

## Features

### Insert date heading

Right-click in the editor and choose **Insert date heading** to drop a heading
with today's date at the cursor, e.g. `# 2026-06-15`. The date format is
configurable.

### `@action` markers → Kanban

Write an action inline in any note:

```md
@action follow up with Sam about the budget
```

Shortly after you stop typing, the plugin:

1. Rewrites the marker in place as a link back to the Kanban file:
   `**[[ToDo Auto#ToDo|ACTION]]:** follow up with Sam about the budget`
2. Appends the action under the `## ToDo` heading of your Kanban note, with a
   backlink to the source note:

   ```md
   ## ToDo

   - [ ] follow up with Sam about the budget [[My Note]] <!-- ➕ 2026-06-18 -->
   ```

Both `@action` and `@action:` are recognised, and every marker in a note is
processed. Scans are debounced per file, so a burst of edits triggers a single
pass once you settle.

### Last one-to-one dates

Person pages log each one-to-one under a dated heading, newest first:

```md
---
type: person
last_1_1: 2026-08-18
---

# 2026-08-18
```

The plugin mirrors the newest such heading into the `last_1_1` frontmatter
property, on save and across the folder via the **Update last one-to-one dates**
command. The property exists because Bases reads frontmatter and file properties
only, never headings, so a base cannot sort a people index by when the
conversation actually happened. File mtime and `updated` are no substitute:
both record editing, and one bulk edit sets every page to the same day.

Pages with no dated heading are left alone rather than given an invented date,
writes only happen when the value changes, and `_`-prefixed reference notes in
the folder are skipped. The folder, the property name, and the whole feature are
configurable in settings.

### Frontmatter toggle

Hide or show YAML frontmatter / Properties across all notes from a ribbon
button, the **Toggle frontmatter visibility** command, or an inline button under
each note's title. The state is remembered per vault (hidden by default) and
applies in reading view, Live Preview, and source mode. To always show a
specific note's frontmatter regardless of the toggle, add `cssclasses:
show-frontmatter` to its frontmatter.

### PDF export fit

Tighten Obsidian's PDF export spacing and keep Mermaid diagrams inside the
printable page. The feature is on by default and can be toggled from the ribbon,
the **Toggle PDF export fit mode** command, or settings. Open a note in reading
view, then use Obsidian's normal **Export to PDF** command.

### Move to inbox

File any note into a single inbox folder without dragging it through the file
explorer tree. Right-click a note (or a multi-file selection) and choose **Move
to inbox**, or run the **Move note to inbox** command on the active note. Links
pointing at the note are updated, the inbox folder is created if it does not
exist, and a name already taken in the inbox is suffixed (`note 1.md`) rather
than overwritten. Notes already in the inbox are left where they are.

The inbox folder is set in settings as a full vault-relative path.

### Clear stale Git lock files

If a git process dies part-way through (Obsidian quitting mid-sync is the usual
cause) it leaves a `*.lock` file behind in `.git`, and every later git command —
including Obsidian Git's — fails until the file is deleted. Run the **Clear
stale Git lock files** command to remove them. Locks modified in the last 30
seconds are left alone, so a commit or fetch that is still running is never
interrupted. Desktop only.

## Settings

| Setting                                | Description                                                                              | Default      |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | ------------ |
| **Date Format**                        | [Moment.js](https://momentjs.com/docs/#/displaying/format/) format for the date heading. | `YYYY-MM-DD` |
| **Kanban Path**                        | Name of the Kanban note (without `.md`) that actions are routed to.                      | `ToDo Auto`  |
| **Process Refresh Interval (seconds)** | How long to wait after an edit before scanning a note for `@action` markers.             | `10`         |
| **Inbox folder**                       | Full vault-relative path of the folder **Move to inbox** files notes into.               | `Inbox`      |
| **PDF export fit**                     | Apply tight PDF export spacing and Mermaid diagram fitting.                              | `on`         |
| **PDF page margin**                    | Margin in millimetres for PDF export.                                                    | `5`          |
| **PDF maximum Mermaid height**         | Maximum diagram height in millimetres before it is scaled down.                          | `242`        |

The Kanban note must contain a `## ToDo` heading; new actions are inserted
directly beneath it.

## Installation (manual)

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest
   [release](https://github.com/nicholasbutlin/obsidian-wonder-plugin/releases).
2. Copy them into your vault under
   `.obsidian/plugins/obsidian-wonder-plugin/`.
3. Reload Obsidian and enable **Wonder Plugin** in _Settings → Community plugins_.

Requires Obsidian `1.2.0` or newer.

## Development

```bash
npm install     # install dependencies
npm run dev     # build and watch (writes main.js)
npm test        # run the Vitest suite
npm run build   # type-check + production build
```

Source lives in `src/`:

- `main.ts` — plugin lifecycle, event registration, per-file debounce.
- `action-processor.ts` — `@action` detection and Kanban routing.
- `settings.ts` — settings tab.

Tests run against a small `obsidian` module mock (`test/obsidian-mock.ts`),
aliased in `vitest.config.ts`.

## Releasing

Releases are automated with [semantic-release](https://semantic-release.gitbook.io/).
Pushing to `main` runs the release workflow, which derives the next version from
[Conventional Commits](https://www.conventionalcommits.org/), then:

- bumps `manifest.json`, `versions.json`, and `package.json`,
- updates `CHANGELOG.md`,
- tags the release (no `v` prefix, as Obsidian requires), and
- attaches `main.js`, `manifest.json`, and `styles.css` to the GitHub release.

Commit messages drive the version bump: `fix:` → patch, `feat:` → minor,
`feat!:`/`BREAKING CHANGE:` → major. Commits of other types (`chore:`, `docs:`,
`ci:`, …) do not cut a release.
