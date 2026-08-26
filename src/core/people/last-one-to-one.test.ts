import { describe, it, expect } from "vitest";
import {
	isPersonPage,
	newestEntryDate,
	readProperty,
	setProperty,
} from "./last-one-to-one";

const page = [
	"---",
	"created: 2023-05-04T16:09",
	"updated: 2026-08-18T13:29",
	"tags:",
	"  - one2one",
	"type: person",
	"---",
	"",
	"# 2026-08-18",
	"- costs",
	"",
	"# 2026-07-23",
	"- earlier",
	"",
].join("\n");

describe("isPersonPage", () => {
	it("accepts a note whose frontmatter is type: person", () => {
		expect(isPersonPage(page)).toBe(true);
	});

	it("rejects a note with no frontmatter or a different type", () => {
		expect(isPersonPage("# 2026-08-18\n- notes\n")).toBe(false);
		expect(isPersonPage("---\ntype: dashboard\n---\n")).toBe(false);
	});

	it("does not match type: person written in the body", () => {
		expect(isPersonPage("# Notes\ntype: person\n")).toBe(false);
	});
});

describe("newestEntryDate", () => {
	it("takes the newest dated heading", () => {
		expect(newestEntryDate(page)).toBe("2026-08-18");
	});

	it("ignores heading order, so an out-of-order entry cannot backdate it", () => {
		expect(newestEntryDate("# 2024-01-01\n# 2026-05-07\n# 2025-02-02\n")).toBe(
			"2026-05-07",
		);
	});

	it("accepts any heading level and wikilinked dates", () => {
		expect(newestEntryDate("### [[2026-04-22]]\n")).toBe("2026-04-22");
	});

	it("ignores dates in the frontmatter and in body text", () => {
		expect(
			newestEntryDate("---\nupdated: 2026-08-26T09:00\n---\n\n# 2025-03-04\n"),
		).toBe("2025-03-04");
		expect(newestEntryDate("# Notes\nmet on 2026-08-26\n")).toBe(null);
	});

	it("returns null when the page has no dated entry", () => {
		expect(newestEntryDate("---\ntype: person\n---\n\n# Alex\n")).toBe(null);
	});
});

describe("setProperty", () => {
	it("inserts the property after type: and leaves the rest untouched", () => {
		const out = setProperty(page, "last_1_1", "2026-08-18");
		expect(out).toContain("type: person\nlast_1_1: 2026-08-18\n");
		expect(out).toContain("updated: 2026-08-18T13:29");
		expect(out).toContain("# 2026-08-18\n- costs");
	});

	it("replaces an existing value in place", () => {
		const once = setProperty(page, "last_1_1", "2026-07-23");
		const twice = setProperty(once, "last_1_1", "2026-08-18");
		expect(readProperty(twice, "last_1_1")).toBe("2026-08-18");
		expect(twice.match(/last_1_1:/g)).toHaveLength(1);
	});

	it("fills an empty property left by the template", () => {
		const template = "---\ntype: person\nlast_1_1:\ntags:\n  - person\n---\n\n";
		expect(readProperty(template, "last_1_1")).toBe("");
		expect(setProperty(template, "last_1_1", "2026-08-18")).toContain(
			"last_1_1: 2026-08-18\ntags:",
		);
	});

	it("returns the input unchanged when the value already matches", () => {
		const once = setProperty(page, "last_1_1", "2026-08-18");
		expect(setProperty(once, "last_1_1", "2026-08-18")).toBe(once);
	});

	it("returns the input unchanged when there is no frontmatter", () => {
		expect(setProperty("# 2026-08-18\n", "last_1_1", "2026-08-18")).toBe(
			"# 2026-08-18\n",
		);
	});

	it("preserves CRLF frontmatter delimiters", () => {
		const crlf = "---\r\ntype: person\r\n---\r\n\r\n# 2026-08-18\r\n";
		expect(setProperty(crlf, "last_1_1", "2026-08-18")).toContain(
			"type: person\nlast_1_1: 2026-08-18\r\n",
		);
	});
});
