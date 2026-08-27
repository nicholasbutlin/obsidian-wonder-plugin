import { describe, it, expect } from "vitest";
import { inboxTargetPath, isInFolder, normalizeFolder } from "./target-path";

const none = () => false;

describe("normalizeFolder", () => {
	it("strips surrounding whitespace and slashes", () => {
		expect(normalizeFolder(" /Areas/Inbox/ ")).toBe("Areas/Inbox");
	});

	it("maps an empty setting to the vault root", () => {
		expect(normalizeFolder("  ")).toBe("");
	});
});

describe("isInFolder", () => {
	it("is true for a direct child", () => {
		expect(isInFolder("Areas/Inbox/note.md", "Areas/Inbox")).toBe(true);
	});

	it("is false for a nested subfolder", () => {
		expect(isInFolder("Areas/Inbox/sub/note.md", "Areas/Inbox")).toBe(false);
	});

	it("handles the vault root", () => {
		expect(isInFolder("note.md", "")).toBe(true);
		expect(isInFolder("Areas/note.md", "")).toBe(false);
	});
});

describe("inboxTargetPath", () => {
	it("joins the folder and the file name", () => {
		expect(inboxTargetPath("Areas/Inbox", "note.md", none)).toBe(
			"Areas/Inbox/note.md",
		);
	});

	it("targets the vault root for an empty folder", () => {
		expect(inboxTargetPath("", "note.md", none)).toBe("note.md");
	});

	it("suffixes the stem when the name is taken", () => {
		const taken = new Set(["Inbox/note.md", "Inbox/note 1.md"]);
		expect(inboxTargetPath("Inbox", "note.md", (p) => taken.has(p))).toBe(
			"Inbox/note 2.md",
		);
	});

	it("keeps the extension of a non-markdown file", () => {
		const taken = new Set(["Inbox/scan.pdf"]);
		expect(inboxTargetPath("Inbox", "scan.pdf", (p) => taken.has(p))).toBe(
			"Inbox/scan 1.pdf",
		);
	});

	it("leaves a dotfile name intact", () => {
		expect(inboxTargetPath("Inbox", ".keep", none)).toBe("Inbox/.keep");
	});
});
