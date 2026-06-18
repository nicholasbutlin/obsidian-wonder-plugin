import { TFile } from "obsidian";
import WonderPlugin from "./main";
import { DUE_EMOJI, formatDue } from "./task-format";

// Kanban's date picker writes brace dates (`@{YYYY-MM-DD}`) when
// `link-date-to-daily-note` is off. We rewrite those to the canonical Tasks due
// token so Tasks/Dataview/Remindian can read them, and place the result on the
// card's main `- [ ]` line — the only place Tasks reads a date and Kanban
// renders it as an inline date chip.
//
// `@[[YYYY-MM-DD]]` reference stamps are intentionally NOT matched: they are
// "date-added" backlinks, not due dates, and converting them would invent false
// due dates.
//
// The optional `[ T]HH:mm` branch is defensive — this vault has no Kanban time
// trigger configured, so date-times don't occur in practice, but if one ever
// appears we drop the time (core Tasks dates are date-only).
const KANBAN_BRACE_DATE = /@\{(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2})?\}/g;

// Token-stripping variants consume a leading space so removing a date doesn't
// leave a double space behind.
const BRACE_STRIP = /\s*@\{\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?\}/g;
const DUE_STRIP = new RegExp(`\\s*${DUE_EMOJI} \\d{4}-\\d{2}-\\d{2}`, "g");
const DUE_DATE = new RegExp(`${DUE_EMOJI} (\\d{4}-\\d{2}-\\d{2})`, "g");

// Cheap, stateless presence check (no `g` flag, so safe for `.test()`).
const HAS_BRACE = /@\{\d{4}-\d{2}-\d{2}/;

// A due date that is the very last token on a line.
const DUE_AT_END = new RegExp(`${DUE_EMOJI} \\d{4}-\\d{2}-\\d{2}$`);

// A board card is a top-level list item; its continuation lines are indented or
// blank. Headings, the settings block, and thematic breaks end a card.
const CARD_START = /^[-*] /;
const CARD_BOUNDARY = /^(#{1,6} |%%|\*\*\*\s*$|---\s*$)/;

export function normalizeKanbanDates(text: string): string {
	const out: string[] = [];
	let card: string[] | null = null;

	const flushCard = () => {
		if (card) {
			out.push(...reconcileCard(card));
			card = null;
		}
	};

	for (const line of text.split("\n")) {
		if (CARD_START.test(line)) {
			flushCard();
			card = [line];
		} else if (card && !CARD_BOUNDARY.test(line)) {
			card.push(line);
		} else {
			flushCard();
			out.push(reconcileStandalone(line));
		}
	}
	flushCard();

	return out.join("\n");
}

// Lift a card's due date onto its main line: a freshly-picked brace date wins
// over any existing 📅; otherwise an already-present 📅 that has drifted onto a
// continuation line is moved up.
//
// Multi-line caveat: Kanban only displays a card date that ends strictly before
// the card's first newline, so a date that is the last token on the main line
// (flush against the newline) is silently dropped. We give it a trailing space.
// "Multi-line" means a continuation line with actual content — a trailing blank
// line (from the file's final newline) is not Kanban content and doesn't count.
function reconcileCard(card: string[]): string[] {
	const multiline = card.slice(1).some((line) => line.trim() !== "");
	const braceDate = lastMatch(card.join("\n"), KANBAN_BRACE_DATE);
	const dueLines: { index: number; date: string }[] = [];
	card.forEach((line, index) => {
		const date = lastMatch(line, DUE_DATE);
		if (date !== null) dueLines.push({ index, date });
	});

	if (!braceDate) {
		if (dueLines.length === 0) return card; // no dates at all
		// Already canonical (one 📅 on the main line). Leave it — except heal the
		// case Kanban mis-renders: a multi-line date flush against the newline.
		if (dueLines.length === 1 && dueLines[0].index === 0) {
			if (multiline && DUE_AT_END.test(card[0])) {
				return [`${card[0]} `, ...card.slice(1)];
			}
			return card;
		}
	}

	const due = braceDate ?? dueLines[dueLines.length - 1].date;
	const stripped = card.map((line) =>
		line.replace(BRACE_STRIP, "").replace(DUE_STRIP, ""),
	);
	const tail = multiline ? " " : "";
	stripped[0] = `${stripped[0].replace(/[ \t]+$/, "")} ${formatDue(due)}${tail}`;
	return stripped;
}

// Lines outside any card (rare on a board). Convert a brace date in place; never
// disturb a line that has no brace.
function reconcileStandalone(line: string): string {
	if (!HAS_BRACE.test(line)) return line;
	return line
		.replace(DUE_STRIP, "")
		.replace(KANBAN_BRACE_DATE, (_match, date: string) => formatDue(date));
}

function lastMatch(text: string, pattern: RegExp): string | null {
	const matches = [...text.matchAll(pattern)];
	return matches.length ? matches[matches.length - 1][1] : null;
}

type BoardLeaf = {
	view?: { file?: { path: string } };
	rebuildView?: () => void;
};

export class DateNormalizer {
	constructor(private plugin: WonderPlugin) {}

	async normalize(file: TFile): Promise<void> {
		const content = await this.plugin.app.vault.read(file);
		const next = normalizeKanbanDates(content);
		// The no-op-write guard is also the loop guard: a normalized board has no
		// brace dates and every 📅 on its main line, so the re-triggered `modify`
		// event recomputes an identical string and exits here without writing.
		if (next === content) return;
		await this.plugin.app.vault.process(file, () => next);
		this.refreshOpenBoards(file);
	}

	// Kanban reparses the board from the *view's* in-memory data, which Obsidian
	// doesn't update on an external write — so a focused board keeps showing the
	// stale Kanban date after we reconcile, until it's reloaded from disk. Rebuild
	// the leaf (the programmatic equivalent of navigating away and back) so it
	// re-reads the file. Best-effort: a Kanban/Obsidian internal must never break
	// normalization.
	private refreshOpenBoards(file: TFile): void {
		const workspace = this.plugin.app.workspace;
		if (!workspace?.getLeavesOfType) return;
		for (const leaf of workspace.getLeavesOfType("kanban") as BoardLeaf[]) {
			if (leaf.view?.file?.path !== file.path) continue;
			try {
				leaf.rebuildView?.();
			} catch {
				// swallow: keep the canonical date even if the rebuild fails
			}
		}
	}
}
