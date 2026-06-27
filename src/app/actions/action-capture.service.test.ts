import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { ActionCaptureService } from "./action-capture.service";
import type { VaultPort } from "../../ports/vault";
import type { Notifier } from "../../ports/notifier";
import type { SettingsStore } from "../../ports/settings-store";
import type { WonderSettings } from "../../settings";

// A tiny in-memory VaultPort, exposing only what the service touches.
class FakeVault implements VaultPort {
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

	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		const next = fn(this.contents.get(file) ?? "");
		this.contents.set(file, next);
		return next;
	}

	getFileByPath(path: string): TFile | null {
		return this.byPath.get(path) ?? null;
	}
}

function makeService(vault: FakeVault): ActionCaptureService {
	const notifier: Notifier = { info: () => {} };
	const settings: SettingsStore<WonderSettings> = {
		get: () => ({ kanbanFile: "ToDo Auto" }) as WonderSettings,
		update: async () => {},
		save: async () => {},
	};
	return new ActionCaptureService(vault, notifier, settings);
}

describe("ActionCaptureService.run", () => {
	it("processes every @action marker and links each to the board ToDo heading", async () => {
		const vault = new FakeVault();
		const note = vault.addFile(
			"Note.md",
			"Note",
			"# Notes\n@action call Bob\nfiller\n@action: email Alice\n",
		);
		const kanban = vault.addFile("ToDo Auto.md", "ToDo Auto", "## ToDo\n");

		await makeService(vault).run(note);

		const noteOut = await vault.read(note);
		const kanbanOut = await vault.read(kanban);

		// Both markers are rewritten in the source note.
		expect(noteOut).toContain("|ACTION]]:** call Bob");
		expect(noteOut).toContain("|ACTION]]:** email Alice");
		expect(noteOut).not.toContain("@action");
		expect(noteOut).not.toContain("#^");

		// Both actions are filed as canonical Tasks lines with inline backlinks.
		expect(kanbanOut).toContain("- [ ] call Bob [[Note]]");
		expect(kanbanOut).toContain("- [ ] email Alice [[Note]]");
		expect(kanbanOut).not.toContain("^");
	});

	it("leaves a note with no markers untouched", async () => {
		const vault = new FakeVault();
		const note = vault.addFile("Note.md", "Note", "# Notes\njust text\n");
		const kanban = vault.addFile("ToDo Auto.md", "ToDo Auto", "## ToDo\n");

		await makeService(vault).run(note);

		expect(await vault.read(note)).toBe("# Notes\njust text\n");
		expect(await vault.read(kanban)).toBe("## ToDo\n");
	});

	it("does not rewrite the note when the Kanban file is missing", async () => {
		const vault = new FakeVault();
		const note = vault.addFile("Note.md", "Note", "@action do thing\n");

		await makeService(vault).run(note);

		expect(await vault.read(note)).toBe("@action do thing\n");
	});

	it("leaves the note untouched when the Kanban file has no ToDo heading", async () => {
		const vault = new FakeVault();
		const note = vault.addFile("Note.md", "Note", "@action do thing\n");
		const kanban = vault.addFile("ToDo Auto.md", "ToDo Auto", "## Tasks\n");

		await makeService(vault).run(note);

		// The note must not gain ACTION links to work that was never filed.
		expect(await vault.read(note)).toBe("@action do thing\n");
		expect(await vault.read(kanban)).toBe("## Tasks\n");
	});
});
