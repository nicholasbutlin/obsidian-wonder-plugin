import { describe, it, expect } from "vitest";
import { parseNameStatus } from "./name-status";

describe("parseNameStatus", () => {
	it("parses added, modified and deleted files", () => {
		const out = "A\tnew.md\nM\tedited.md\nD\tgone.md\n";
		expect(parseNameStatus(out)).toEqual([
			{ status: "A", path: "new.md" },
			{ status: "M", path: "edited.md" },
			{ status: "D", path: "gone.md" },
		]);
	});

	it("parses a rename with its old and new path, dropping the score", () => {
		const out = "R100\told/name.md\tnew/name.md\n";
		expect(parseNameStatus(out)).toEqual([
			{ status: "R", oldPath: "old/name.md", path: "new/name.md" },
		]);
	});

	it("parses a copy with old and new path", () => {
		const out = "C075\tsrc.md\tdest.md\n";
		expect(parseNameStatus(out)).toEqual([
			{ status: "C", oldPath: "src.md", path: "dest.md" },
		]);
	});

	it("ignores blank lines (e.g. a leading newline from git show)", () => {
		const out = "\nM\tfile.md\n";
		expect(parseNameStatus(out)).toEqual([{ status: "M", path: "file.md" }]);
	});

	it("returns an empty array for empty output", () => {
		expect(parseNameStatus("")).toEqual([]);
	});
});
