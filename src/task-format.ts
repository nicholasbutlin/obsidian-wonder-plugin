// The canonical Tasks date token lives here so the format has a single
// definition. Phase 1 grows this into the full task formatter; Phase 0 only
// needs the due token.
export const DUE_EMOJI = "📅";

export function formatDue(date: string): string {
	return `${DUE_EMOJI} ${date}`;
}
