import { describe, it, expect } from "vitest";
import {
	CONTEXT_START,
	CONTEXT_END,
	buildContextBlock,
	upsertContextSection,
} from "./context-section";

const QUERY =
	"not done\n(due before tomorrow) OR (happens today)\nsort by priority";

describe("buildContextBlock", () => {
	it("wraps the heading and a tasks query between the markers", () => {
		expect(buildContextBlock("Context", QUERY)).toBe(
			`${CONTEXT_START}\n## Context\n\`\`\`tasks\n${QUERY}\n\`\`\`\n${CONTEXT_END}`,
		);
	});
});

describe("upsertContextSection", () => {
	const block = buildContextBlock("Context", QUERY);

	it("appends the block when no region is present, leaving the note above intact", () => {
		expect(upsertContextSection("# 2026-06-18\n\nnotes here\n", block)).toBe(
			`# 2026-06-18\n\nnotes here\n\n${block}\n`,
		);
	});

	it("replaces only the marked region when present", () => {
		const stale = `${CONTEXT_START}\n## Context\n\`\`\`tasks\nold query\n\`\`\`\n${CONTEXT_END}`;
		const content = `# Daily\n\ntop notes\n\n${stale}\n`;
		expect(upsertContextSection(content, block)).toBe(
			`# Daily\n\ntop notes\n\n${block}\n`,
		);
	});

	it("never touches content above the start marker", () => {
		const content = `important top content\n${block}\nold trailing`;
		const out = upsertContextSection(
			content,
			buildContextBlock("Context", "new"),
		);
		expect(out.startsWith("important top content\n")).toBe(true);
	});

	it("is idempotent", () => {
		const once = upsertContextSection("# Daily\nnotes\n", block);
		expect(upsertContextSection(once, block)).toBe(once);
	});

	it("writes just the block for an empty note", () => {
		expect(upsertContextSection("", block)).toBe(`${block}\n`);
	});
});
