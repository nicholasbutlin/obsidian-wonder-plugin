// The daily-note "Context" section is a marked, idempotent region: re-running
// the command rewrites only what's between the markers, leaving the rest of the
// note untouched. The block hosts a live Tasks query, so it self-updates; the
// command just guarantees it exists and is current. Pure: no I/O.

export const CONTEXT_START = "<!-- wonder:context:start -->";
export const CONTEXT_END = "<!-- wonder:context:end -->";

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Non-greedy so it matches a single region; no `g` flag so `.test()` is safe.
const CONTEXT_REGION = new RegExp(
	`${escapeRegExp(CONTEXT_START)}[\\s\\S]*?${escapeRegExp(CONTEXT_END)}`,
);

export function buildContextBlock(heading: string, query: string): string {
	return [
		CONTEXT_START,
		`## ${heading}`,
		"```tasks",
		query,
		"```",
		CONTEXT_END,
	].join("\n");
}

// Replace the existing region in place, or append the block at the end of the
// note. Content above the start marker is never altered.
export function upsertContextSection(content: string, block: string): string {
	if (CONTEXT_REGION.test(content)) {
		return content.replace(CONTEXT_REGION, block);
	}
	const trimmed = content.replace(/\s*$/, "");
	return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}
