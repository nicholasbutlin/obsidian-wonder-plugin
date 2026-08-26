// A person page logs each one-to-one under a dated heading, newest first. The
// date of the newest such heading is the "last one-to-one", but a heading is
// invisible to Bases, which reads frontmatter and file properties only. So it is
// mirrored into a frontmatter property. File mtime and `updated` are no
// substitute: both record editing, and a bulk edit sets every page to the same
// day. Pure: no I/O.

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/;

// A dated entry heading: any heading level, optionally wikilinked, e.g.
// `# 2026-08-18` or `## [[2026-08-18]]`.
const ENTRY_HEADING = /^#{1,6}[ \t]+\[?\[?(\d{4}-\d{2}-\d{2})/gm;

export function frontmatterOf(content: string): string | null {
	return FRONTMATTER.exec(content)?.[1] ?? null;
}

export function isPersonPage(content: string): boolean {
	const frontmatter = frontmatterOf(content);
	return frontmatter !== null && /^type:[ \t]*person[ \t]*$/m.test(frontmatter);
}

// The newest dated entry heading in the body, or null when the page has none.
// Entries are written newest first by convention, but the maximum is taken
// rather than the first so an out-of-order entry cannot backdate the property.
export function newestEntryDate(content: string): string | null {
	const body = content.replace(FRONTMATTER, "");
	const dates = [...body.matchAll(ENTRY_HEADING)].map((match) => match[1]);
	// ISO dates sort lexicographically, so no parsing is needed.
	return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
}

export function readProperty(content: string, property: string): string | null {
	const frontmatter = frontmatterOf(content);
	if (frontmatter === null) return null;
	const line = new RegExp(`^${escapeRegExp(property)}:[ \\t]*(.*)$`, "m").exec(
		frontmatter,
	);
	return line ? line[1].trim() : null;
}

// Write `property: value` into the frontmatter, replacing the existing line if
// there is one and otherwise inserting it after `type:` so person pages keep a
// consistent shape. Only the one line is touched: every other key, its order and
// its formatting survive, which a full YAML round-trip would not guarantee.
// Returns the content unchanged when there is no frontmatter, or when the
// property already holds this value, so callers can skip the write.
export function setProperty(
	content: string,
	property: string,
	value: string,
): string {
	const frontmatter = frontmatterOf(content);
	if (frontmatter === null) return content;
	if (readProperty(content, property) === value) return content;

	const key = escapeRegExp(property);
	const existing = new RegExp(`^${key}:.*$`, "m");
	const updated = existing.test(frontmatter)
		? frontmatter.replace(existing, `${property}: ${value}`)
		: insertAfterType(frontmatter, `${property}: ${value}`);

	// Splice by index rather than String.replace so a `$` in the value cannot be
	// read as a replacement pattern.
	return content.replace(FRONTMATTER, (match, current: string) => {
		const at = match.indexOf(current);
		return match.slice(0, at) + updated + match.slice(at + current.length);
	});
}

function insertAfterType(frontmatter: string, line: string): string {
	const type = /^type:.*$/m;
	if (type.test(frontmatter)) {
		return frontmatter.replace(type, (match) => `${match}\n${line}`);
	}
	return `${frontmatter}\n${line}`;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
