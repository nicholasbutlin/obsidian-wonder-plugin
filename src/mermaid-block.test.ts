import { describe, expect, it } from "vitest";
import {
	findFirstMermaidBlock,
	findMermaidBlockAt,
	replaceBlockBody,
} from "./mermaid-block";

// Locate a block and assert it exists, so the test body works with a definite
// value instead of a non-null assertion at every call site.
function blockAt(text: string, line: number) {
	const block = findMermaidBlockAt(text, line);
	if (!block) throw new Error(`expected a mermaid block at line ${line}`);
	return block;
}

const NOTE = [
	"# Title", // 0
	"", // 1
	"```mermaid", // 2
	"graph TD", // 3
	"  A --> B", // 4
	"```", // 5
	"", // 6
	"some text", // 7
].join("\n");

describe("findMermaidBlockAt", () => {
	it("finds the block from a line inside it", () => {
		const block = findMermaidBlockAt(NOTE, 4);
		expect(block).not.toBeNull();
		expect(block).toMatchObject({ startLine: 2, endLine: 5, fence: "```" });
		expect(block?.body).toBe("graph TD\n  A --> B");
	});

	it("matches when the cursor is on the opening fence", () => {
		expect(findMermaidBlockAt(NOTE, 2)?.startLine).toBe(2);
	});

	it("matches when the cursor is on the closing fence", () => {
		expect(findMermaidBlockAt(NOTE, 5)?.endLine).toBe(5);
	});

	it("returns null for a line outside any block", () => {
		expect(findMermaidBlockAt(NOTE, 0)).toBeNull();
		expect(findMermaidBlockAt(NOTE, 7)).toBeNull();
	});

	it("ignores non-mermaid fenced blocks", () => {
		const text = ["```ts", "const a = 1;", "```"].join("\n");
		expect(findMermaidBlockAt(text, 1)).toBeNull();
	});

	it("handles indented fences", () => {
		const text = ["- item", "  ```mermaid", "  pie", "  ```"].join("\n");
		const block = findMermaidBlockAt(text, 2);
		expect(block).toMatchObject({ startLine: 1, endLine: 3 });
		expect(block?.body).toBe("  pie");
	});

	it("treats an unclosed block as running to the last line", () => {
		const text = ["```mermaid", "graph TD", "A-->B"].join("\n");
		const block = findMermaidBlockAt(text, 1);
		expect(block).toMatchObject({ startLine: 0, endLine: 2 });
		expect(block?.body).toBe("graph TD\nA-->B");
	});

	it("finds the second of two blocks", () => {
		const text = [
			"```mermaid", // 0
			"a", // 1
			"```", // 2
			"between", // 3
			"```mermaid", // 4
			"b", // 5
			"```", // 6
		].join("\n");
		expect(findMermaidBlockAt(text, 5)?.startLine).toBe(4);
		expect(findMermaidBlockAt(text, 3)).toBeNull();
	});
});

describe("findFirstMermaidBlock", () => {
	it("returns the first block", () => {
		expect(findFirstMermaidBlock(NOTE)?.startLine).toBe(2);
	});

	it("returns null when there is no block", () => {
		expect(findFirstMermaidBlock("just text")).toBeNull();
	});
});

describe("replaceBlockBody", () => {
	it("replaces the body, preserving surrounding content and fences", () => {
		const block = blockAt(NOTE, 4);
		const next = replaceBlockBody(NOTE, block, "sequenceDiagram\n  A->>B: hi");
		expect(next).toBe(
			[
				"# Title",
				"",
				"```mermaid",
				"sequenceDiagram",
				"  A->>B: hi",
				"```",
				"",
				"some text",
			].join("\n"),
		);
	});

	it("can empty a block", () => {
		const block = blockAt(NOTE, 4);
		const next = replaceBlockBody(NOTE, block, "");
		expect(next).toContain("```mermaid\n```");
	});

	it("closes a previously unclosed block", () => {
		const text = ["```mermaid", "graph TD"].join("\n");
		const block = blockAt(text, 1);
		const next = replaceBlockBody(text, block, "pie");
		expect(next).toBe(["```mermaid", "pie", "```"].join("\n"));
	});

	it("preserves a longer/indented fence token", () => {
		const text = ["  ````mermaid", "  pie", "  ````"].join("\n");
		const block = blockAt(text, 1);
		const next = replaceBlockBody(text, block, "  graph TD");
		expect(next).toBe(["  ````mermaid", "  graph TD", "  ````"].join("\n"));
	});
});
