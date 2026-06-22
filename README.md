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

## Settings

| Setting                                | Description                                                                              | Default      |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | ------------ |
| **Date Format**                        | [Moment.js](https://momentjs.com/docs/#/displaying/format/) format for the date heading. | `YYYY-MM-DD` |
| **Kanban Path**                        | Name of the Kanban note (without `.md`) that actions are routed to.                      | `ToDo Auto`  |
| **Process Refresh Interval (seconds)** | How long to wait after an edit before scanning a note for `@action` markers.             | `10`         |

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
