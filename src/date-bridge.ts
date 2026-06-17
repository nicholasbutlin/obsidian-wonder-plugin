import { TFile } from "obsidian";
import WonderPlugin from "./main";
import { formatDue } from "./task-format";

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

// Cheap pre-check so we can skip files with nothing to convert.
const BRACE_GUARD = /@\{\d{4}-\d{2}-\d{2}/;

export function normalizeKanbanDates(text: string): string {
	return text.replace(KANBAN_BRACE_DATE, (_match, date: string) =>
		formatDue(date),
	);
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
