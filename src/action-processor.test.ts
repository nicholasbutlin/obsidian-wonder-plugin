import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { ActionProcessor } from "./action-processor";

// A tiny in-memory stand-in for Obsidian's Vault, exposing only what
// ActionProcessor touches.
class FakeVault {
	private contents = new Map<TFile, string>();
	private byPath = new Map<string, TFile>();

	addFile(path: string, basename: string, content: string): TFile {
		const file = new TFile();
		file.path = path;
		file.basename = basename;
		this.contents.set(file, content);
		this.byPath.set(path, file);
		return file;
	}

	async read(file: TFile): Promise<string> {
		return this.contents.get(file) ?? "";
	}

	async modify(file: TFile, data: string): Promise<void> {
		this.contents.set(file, data);
	}

	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		const next = fn(this.contents.get(file) ?? "");
		this.contents.set(file, next);
		return next;
	}

	getAbstractFileByPath(path: string): TFile | null {
		return this.byPath.get(path) ?? null;
	}
}

function makeProcessor(vault: FakeVault): ActionProcessor {
	const plugin = {
		app: { vault },
		settings: { kanbanFile: "ToDo Auto" },
	};
	// Deterministic, unique anchor IDs keep assertions stable across runs.
	let counter = 0;
	return new ActionProcessor(plugin as never, () => `id${counter++}`);
}

describe("ActionProcessor.processActionMarkers", () => {
	it("processes every @action marker and links each to a unique anchor", async () => {
		const vault = new FakeVault();
		const note = vault.addFile(
			"Note.md",
			"Note",
			"# Notes\n@action call Bob\nfiller\n@action: email Alice\n",
		);
		const kanban = vault.addFile("ToDo Auto.md", "ToDo Auto", "## ToDo\n");

		await makeProcessor(vault).processActionMarkers(note);

		const noteOut = await vault.read(note);
		const kanbanOut = await vault.read(kanban);

		// Both markers are rewritten in the source note.
		expect(noteOut).toContain("|ACTION]]:** call Bob");
		expect(noteOut).toContain("|ACTION]]:** email Alice");
		expect(noteOut).not.toContain("@action");

		// Both actions are added to the Kanban file, backlinked to the note.
		expect(kanbanOut).toContain("- call Bob ");
		expect(kanbanOut).toContain("- email Alice ");
		expect(kanbanOut).toContain("[[Note]]");

		// Every ACTION link in the note resolves to an anchor in the Kanban file.
		const linkIds = [...noteOut.matchAll(/#\^(\w+)\|ACTION/g)].map((m) => m[1]);
		const anchorIds = [...kanbanOut.matchAll(/\^(\w+)/g)].map((m) => m[1]);
		expect(linkIds).toHaveLength(2);
		expect(new Set(anchorIds).size).toBe(2);
		expect(new Set(anchorIds)).toEqual(new Set(linkIds));
	});

	it("leaves a note with no markers untouched", async () => {
		const vault = new FakeVault();
		const note = vault.addFile("Note.md", "Note", "# Notes\njust text\n");
		const kanban = vault.addFile("ToDo Auto.md", "ToDo Auto", "## ToDo\n");

		await makeProcessor(vault).processActionMarkers(note);

		expect(await vault.read(note)).toBe("# Notes\njust text\n");
		expect(await vault.read(kanban)).toBe("## ToDo\n");
	});

	it("does not rewrite the note when the Kanban file is missing", async () => {
		const vault = new FakeVault();
		const note = vault.addFile("Note.md", "Note", "@action do thing\n");

		await makeProcessor(vault).processActionMarkers(note);

		expect(await vault.read(note)).toBe("@action do thing\n");
	});

	it("leaves the note untouched when the Kanban file has no ToDo heading", async () => {
		const vault = new FakeVault();
		const note = vault.addFile("Note.md", "Note", "@action do thing\n");
		const kanban = vault.addFile("ToDo Auto.md", "ToDo Auto", "## Tasks\n");

		await makeProcessor(vault).processActionMarkers(note);

		// The note must not gain ACTION links to anchors that were never filed.
		expect(await vault.read(note)).toBe("@action do thing\n");
		expect(await vault.read(kanban)).toBe("## Tasks\n");
	});
});
