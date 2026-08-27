import { describe, it, expect } from "vitest";
import {
	classifyInbox,
	externalTargetPath,
	inboxTargetPath,
	isAbsoluteInboxPath,
	isInFolder,
	normalizeExternalFolder,
	normalizeFolder,
} from "./target-path";

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

describe("isAbsoluteInboxPath", () => {
	it("recognises posix, home, drive and UNC paths", () => {
		expect(isAbsoluteInboxPath("/Users/me/Other Vault/Inbox")).toBe(true);
		expect(isAbsoluteInboxPath(" ~/Inbox ")).toBe(true);
		expect(isAbsoluteInboxPath("~")).toBe(true);
		expect(isAbsoluteInboxPath("C:\\Vault\\Inbox")).toBe(true);
		expect(isAbsoluteInboxPath("\\\\server\\share")).toBe(true);
	});

	it("leaves vault-relative folders alone", () => {
		expect(isAbsoluteInboxPath("Areas/Inbox")).toBe(false);
		expect(isAbsoluteInboxPath("")).toBe(false);
		expect(isAbsoluteInboxPath("~notes/Inbox")).toBe(false);
	});
});

describe("normalizeExternalFolder", () => {
	it("strips whitespace and trailing separators", () => {
		expect(normalizeExternalFolder(" /Users/me/Inbox/ ")).toBe(
			"/Users/me/Inbox",
		);
	});

	it("keeps a root separator", () => {
		expect(normalizeExternalFolder("/")).toBe("/");
		expect(normalizeExternalFolder("C:\\")).toBe("C:\\");
	});
});

describe("classifyInbox", () => {
	it("routes a vault-relative folder in-vault", () => {
		expect(classifyInbox(" Areas/Inbox/ ")).toEqual({
			kind: "vault",
			folder: "Areas/Inbox",
		});
	});

	it("routes an absolute path out of the vault", () => {
		expect(classifyInbox("~/Other Vault/Inbox/")).toEqual({
			kind: "external",
			folder: "~/Other Vault/Inbox",
		});
	});
});

describe("externalTargetPath", () => {
	it("joins an absolute directory and the file name", () => {
		expect(externalTargetPath("/Users/me/Inbox", "note.md", none)).toBe(
			"/Users/me/Inbox/note.md",
		);
	});

	it("keeps backslashes on a Windows path", () => {
		expect(externalTargetPath("C:\\Vault\\Inbox", "note.md", none)).toBe(
			"C:\\Vault\\Inbox\\note.md",
		);
	});

	it("suffixes the stem when the name is taken", () => {
		const taken = new Set(["/Inbox/note.md"]);
		expect(externalTargetPath("/Inbox", "note.md", (p) => taken.has(p))).toBe(
			"/Inbox/note 1.md",
		);
	});

	it("handles the filesystem root", () => {
		expect(externalTargetPath("/", "note.md", none)).toBe("/note.md");
	});
});
