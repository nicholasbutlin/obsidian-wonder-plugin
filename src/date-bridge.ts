import { TFile } from "obsidian";
import WonderPlugin from "./main";
import { DUE_EMOJI, formatDue } from "./task-format";

// Kanban's date picker writes brace dates (`@{YYYY-MM-DD}`) when
// `link-date-to-daily-note` is off. We rewrite those to the canonical Tasks
// due token so Tasks/Dataview/Remindian can read them.
//
// `@[[YYYY-MM-DD]]` reference stamps are intentionally NOT matched: they are
// "date-added" backlinks, not due dates, and converting them would invent
// false due dates.
//
// The optional `[ T]HH:mm` branch is defensive — this vault has no Kanban time
// trigger configured, so date-times don't occur in practice, but if one ever
// appears we drop the time (core Tasks dates are date-only).
const KANBAN_BRACE_DATE = /@\{(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2})?\}/g;

// Cheap per-line/whole-file pre-check (no `g` flag, so it carries no lastIndex
// state and is safe for `.test()`).
const BRACE_GUARD = /@\{\d{4}-\d{2}-\d{2}/;

// An already-canonical due date plus any leading whitespace, so we can drop a
// superseded date without leaving a double space behind.
const EXISTING_DUE = new RegExp(`\\s*${DUE_EMOJI} \\d{4}-\\d{2}-\\d{2}`, "g");

export function normalizeKanbanDates(text: string): string {
	return text.split("\n").map(reconcileLine).join("\n");
}

// A freshly-picked brace date supersedes any due date already on the same line:
// Kanban can't edit a 📅 it doesn't own, so re-picking inserts a new @{} next to
// the old date. Drop the stale 📅 first, then convert the brace, leaving exactly
// one canonical due date. Lines without a brace date (and their 📅) are left
// untouched.
function reconcileLine(line: string): string {
	if (!BRACE_GUARD.test(line)) return line;
	return line
		.replace(EXISTING_DUE, "")
		.replace(KANBAN_BRACE_DATE, (_match, date: string) => formatDue(date));
}

export class DateNormalizer {
	constructor(private plugin: WonderPlugin) {}

	async normalize(file: TFile): Promise<void> {
		const content = await this.plugin.app.vault.read(file);
		if (!BRACE_GUARD.test(content)) return; // nothing to do

		const next = normalizeKanbanDates(content);
		// Skip the no-op write: this is the loop guard. After conversion no
		// `@{}` remains, so the re-triggered `modify` event exits at BRACE_GUARD.
		if (next === content) return;

		await this.plugin.app.vault.process(file, () => next);
	}
}
