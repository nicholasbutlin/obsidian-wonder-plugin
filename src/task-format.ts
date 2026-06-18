// The Obsidian Tasks emoji vocabulary — the single source of the on-disk task
// format that Tasks, Dataview, Kanban, and Remindian all read. Pure: no I/O.

export const DUE_EMOJI = "📅";
export const CREATED_EMOJI = "➕";
export const DONE_EMOJI = "✅";

export function formatDue(date: string): string {
	return `${DUE_EMOJI} ${date}`;
}

export function formatCreated(date: string): string {
	return `${CREATED_EMOJI} ${date}`;
}

export function formatDone(date: string): string {
	return `${DONE_EMOJI} ${date}`;
}

// A new, uncompleted task line filed on the board: checkbox, description, a
// created-date stamp, and the block anchor the in-note ACTION link targets.
export function newTask({
	text,
	created,
	blockId,
}: {
	text: string;
	created: string;
	blockId: string;
}): string {
	return `- [ ] ${text.trim()} ${formatCreated(created)} ^${blockId}`;
}
