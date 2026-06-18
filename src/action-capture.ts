import { newTask } from "./task-format";

// Action grammar lives here so the marker syntax has a single definition.
// `ACTION_GUARD` is a cheap, stateless check; `ACTION_MARKER` is the global
// matcher used to rewrite every occurrence in one pass.
const ACTION_GUARD = /@action:? /i;
const ACTION_MARKER = /@action:? (.*)/gi;

// New items are filed directly beneath the "## ToDo" heading.
const TODO_HEADER = /(##\s+ToDo\s*\n)/;

export interface CapturedAction {
	// The action description, for user-facing notices.
	text: string;
	// The full Kanban board entry: a canonical task line plus a backlink.
	entry: string;
}

export interface CaptureContext {
	kanbanFile: string;
	noteBasename: string;
	today: () => string;
	newBlockId: () => string;
}

// Pure: rewrite every @action marker in a note to an ACTION link, and return the
// canonical board entries to file for them. Each entry is anchored with the same
// block ID its ACTION link targets, and backlinked to the source note.
export function captureActions(
	text: string,
	ctx: CaptureContext,
): { rewritten: string; captured: CapturedAction[] } {
	const captured: CapturedAction[] = [];

	// A replacer function (not a replacement string) keeps `$` in action text
	// literal instead of triggering substitution patterns.
	const rewritten = text.replace(ACTION_MARKER, (_match, rawText: string) => {
		const actionText = rawText.trim();
		const blockId = ctx.newBlockId();
		const task = newTask({ text: actionText, created: ctx.today(), blockId });
		captured.push({
			text: actionText,
			entry: `${task}\n[[${ctx.noteBasename}]]`,
		});
		return `**[[${ctx.kanbanFile}#^${blockId}|ACTION]]:** ${actionText}`;
	});

	return { rewritten, captured };
}

export function hasActions(text: string): boolean {
	return ACTION_GUARD.test(text);
}

export function hasTodoHeading(text: string): boolean {
	return TODO_HEADER.test(text);
}

export function insertUnderTodoHeading(
	text: string,
	entries: string[],
): string {
	return text.replace(TODO_HEADER, `$1${entries.join("\n")}\n`);
}
