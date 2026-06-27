import { describe, it, expect } from "vitest";
import { parseUnifiedDiff } from "./diff";

describe("parseUnifiedDiff", () => {
	it("pairs deletions with additions and tracks line numbers", () => {
		const patch = [
			"diff --git a/foo.md b/foo.md",
			"index 1111111..2222222 100644",
			"--- a/foo.md",
			"+++ b/foo.md",
			"@@ -1,3 +1,4 @@",
			" line one",
			"-old two",
			"+new two",
			"+inserted three",
			" line three",
		].join("\n");

		const diff = parseUnifiedDiff(patch);
		expect(diff.binary).toBe(false);
		expect(diff.hunks).toHaveLength(1);
		const rows = diff.hunks[0].rows;

		expect(rows[0]).toEqual({
			left: { text: "line one", lineNo: 1 },
			right: { text: "line one", lineNo: 1 },
			kind: "context",
		});
		// "old two" -> "new two" is a paired change row.
		expect(rows[1]).toEqual({
			left: { text: "old two", lineNo: 2 },
			right: { text: "new two", lineNo: 2 },
			kind: "change",
		});
		// "inserted three" is a surplus addition with no left side.
		expect(rows[2]).toEqual({
			left: null,
			right: { text: "inserted three", lineNo: 3 },
			kind: "add",
		});
		expect(rows[3]).toEqual({
			left: { text: "line three", lineNo: 3 },
			right: { text: "line three", lineNo: 4 },
			kind: "context",
		});
	});

	it("emits del rows for a pure deletion", () => {
		const patch = [
			"--- a/foo.md",
			"+++ b/foo.md",
			"@@ -1,3 +1,2 @@",
			" keep",
			"-remove me",
			" tail",
		].join("\n");

		const rows = parseUnifiedDiff(patch).hunks[0].rows;
		expect(rows[1]).toEqual({
			left: { text: "remove me", lineNo: 2 },
			right: null,
			kind: "del",
		});
	});

	it("parses multiple hunks", () => {
		const patch = [
			"@@ -1,1 +1,1 @@",
			"-a",
			"+A",
			"@@ -10,1 +10,1 @@",
			"-b",
			"+B",
		].join("\n");

		const diff = parseUnifiedDiff(patch);
		expect(diff.hunks).toHaveLength(2);
		expect(diff.hunks[1].rows[0]).toEqual({
			left: { text: "b", lineNo: 10 },
			right: { text: "B", lineNo: 10 },
			kind: "change",
		});
	});

	it("captures the section heading after the @@ ranges", () => {
		const patch = ["@@ -1,1 +1,1 @@ function foo()", "-a", "+b"].join("\n");
		expect(parseUnifiedDiff(patch).hunks[0].header).toBe("function foo()");
	});

	it("ignores the no-newline marker", () => {
		const patch = [
			"@@ -1,1 +1,1 @@",
			"-a",
			"\\ No newline at end of file",
			"+b",
			"\\ No newline at end of file",
		].join("\n");
		const rows = parseUnifiedDiff(patch).hunks[0].rows;
		expect(rows).toHaveLength(1);
		expect(rows[0].kind).toBe("change");
	});

	it("flags a binary diff", () => {
		const patch = "Binary files a/img.png and b/img.png differ";
		expect(parseUnifiedDiff(patch)).toEqual({ binary: true, hunks: [] });
	});

	it("returns no hunks for an empty diff", () => {
		expect(parseUnifiedDiff("")).toEqual({ binary: false, hunks: [] });
	});
});
