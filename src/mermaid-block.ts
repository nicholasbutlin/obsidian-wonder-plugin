// Pure helpers for locating and rewriting a fenced ```mermaid block inside note
// text. The live editor uses these to load the block under the cursor and to
// write edited source back. No I/O.

export interface MermaidBlock {
	// Zero-based line indices, inclusive: `startLine` is the opening fence,
	// `endLine` is the closing fence (or the last line if the fence is unclosed).
	startLine: number;
	endLine: number;
	// The diagram source between the fences (fence lines excluded), no trailing
	// newline.
	body: string;
	// The exact fence token that opened the block (e.g. "```" or "~~~~"),
	// preserved so a rewrite reuses it verbatim.
	fence: string;
}

// A fence is three or more backticks/tildes, optionally indented, followed by an
// info string. We capture the indent + run so the closing fence can be matched
// by the same marker type and length (CommonMark allows a longer closing run).
const OPEN_FENCE = /^(\s*)(`{3,}|~{3,})\s*mermaid\s*$/i;

function closeFenceRe(indent: string, marker: string): RegExp {
	const ch = marker[0] === "`" ? "`" : "~";
	return new RegExp(`^\\s*${ch}{${marker.length},}\\s*$`);
}

// Find the mermaid block that contains the given (zero-based) line, if any. The
// line may be the opening fence, the closing fence, or any line in between.
export function findMermaidBlockAt(
	text: string,
	line: number,
): MermaidBlock | null {
	const lines = text.split("\n");
	for (const block of iterMermaidBlocks(lines)) {
		if (line >= block.startLine && line <= block.endLine) return block;
	}
	return null;
}

// Find the first mermaid block in the text, if any. Useful when opening the
// editor without a cursor context.
export function findFirstMermaidBlock(text: string): MermaidBlock | null {
	const lines = text.split("\n");
	for (const block of iterMermaidBlocks(lines)) return block;
	return null;
}

// Every mermaid block in document order. Used to map a rendered diagram to its
// source by position when an exact line range isn't available.
export function findAllMermaidBlocks(text: string): MermaidBlock[] {
	return [...iterMermaidBlocks(text.split("\n"))];
}

function* iterMermaidBlocks(lines: string[]): Generator<MermaidBlock> {
	let i = 0;
	while (i < lines.length) {
		const open = OPEN_FENCE.exec(lines[i]);
		if (!open) {
			i++;
			continue;
		}
		const [, indent, marker] = open;
		const close = closeFenceRe(indent, marker);
		const startLine = i;
		let j = i + 1;
		while (j < lines.length && !close.test(lines[j])) j++;
		// `j` is the closing fence, or lines.length if the block is unclosed; in
		// the unclosed case the block runs to the final line.
		const endLine = j < lines.length ? j : lines.length - 1;
		const bodyEnd = j < lines.length ? j : lines.length;
		const body = lines.slice(startLine + 1, bodyEnd).join("\n");
		yield { startLine, endLine, body, fence: marker };
		i = endLine + 1;
	}
}

// Replace a block's body with new source, preserving the fence lines. The block
// must come from `findMermaidBlockAt`/`findFirstMermaidBlock` on the same text.
export function replaceBlockBody(
	text: string,
	block: MermaidBlock,
	newBody: string,
): string {
	const lines = text.split("\n");
	const openLine = lines[block.startLine];
	const bodyLines = newBody === "" ? [] : newBody.split("\n");
	const before = lines.slice(0, block.startLine);
	// `endLine` is the closing fence for a closed block, or the last content line
	// for an unclosed one. Detect which, and always emit a closing fence so the
	// rewritten block is well-formed regardless.
	const closed =
		block.endLine > block.startLine &&
		isClosingFence(lines[block.endLine], block.fence);
	const closeLine = closed ? lines[block.endLine] : block.fence;
	const after = lines.slice(block.endLine + 1);
	return [...before, openLine, ...bodyLines, closeLine, ...after].join("\n");
}

function isClosingFence(line: string, fence: string): boolean {
	const ch = fence[0] === "`" ? "`" : "~";
	return new RegExp(`^\\s*${ch}{${fence.length},}\\s*$`).test(line);
}
