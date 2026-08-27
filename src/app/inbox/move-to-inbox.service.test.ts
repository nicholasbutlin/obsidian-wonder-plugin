import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { MoveToInboxService } from "./move-to-inbox.service";
import type { FileMoverPort } from "../../ports/file-mover";
import type { Notifier } from "../../ports/notifier";
import type { SettingsStore } from "../../ports/settings-store";
import type { WonderSettings } from "../../settings";

function makeTFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split("/").pop() ?? path;
	file.basename = file.name.replace(/\.md$/, "");
	file.extension = "md";
	return file;
}

function makeService(
	existing: string[] = [],
	overrides: Partial<WonderSettings> = {},
	moveImpl?: (file: TFile, target: string) => Promise<void>,
) {
	const paths = new Set(existing);
	const moves: Array<{ from: string; to: string }> = [];
	const created: string[] = [];
	const notices: string[] = [];
	const mover: FileMoverPort = {
		exists: (path) => paths.has(path),
		ensureFolder: async (path) => {
			created.push(path);
			paths.add(path);
		},
		move: async (file, target) => {
			if (moveImpl) return moveImpl(file, target);
			moves.push({ from: file.path, to: target });
			paths.delete(file.path);
			paths.add(target);
		},
	};
	const notifier: Notifier = { info: (message) => notices.push(message) };
	const settings: SettingsStore<WonderSettings> = {
		get: () => ({ inboxFolder: "Areas/Inbox", ...overrides }) as WonderSettings,
		update: async () => {},
		save: async () => {},
	};
	return {
		service: new MoveToInboxService(mover, notifier, settings),
		moves,
		created,
		notices,
	};
}

describe("MoveToInboxService.run", () => {
	it("moves a note into the inbox folder", async () => {
		const { service, moves, created } = makeService(["Notes/idea.md"]);

		expect(await service.run([makeTFile("Notes/idea.md")])).toBe(1);
		expect(moves).toEqual([
			{ from: "Notes/idea.md", to: "Areas/Inbox/idea.md" },
		]);
		expect(created).toEqual(["Areas/Inbox"]);
	});

	it("suffixes the name when the inbox already holds one", async () => {
		const { service, moves } = makeService([
			"Notes/idea.md",
			"Areas/Inbox/idea.md",
		]);

		await service.run([makeTFile("Notes/idea.md")]);
		expect(moves[0].to).toBe("Areas/Inbox/idea 1.md");
	});

	it("skips a note already in the inbox", async () => {
		const { service, moves, notices } = makeService(["Areas/Inbox/idea.md"]);

		expect(await service.run([makeTFile("Areas/Inbox/idea.md")])).toBe(0);
		expect(moves).toEqual([]);
		expect(notices[0]).toContain("already in Areas/Inbox");
	});

	it("moves several notes, giving each a free name", async () => {
		const { service, moves } = makeService(["a/note.md", "b/note.md"]);

		expect(
			await service.run([makeTFile("a/note.md"), makeTFile("b/note.md")]),
		).toBe(2);
		expect(moves.map((m) => m.to)).toEqual([
			"Areas/Inbox/note.md",
			"Areas/Inbox/note 1.md",
		]);
	});

	it("reports a failed move and continues", async () => {
		const { service, notices } = makeService(["a/note.md"], {}, async () => {
			throw new Error("locked");
		});

		expect(await service.run([makeTFile("a/note.md")])).toBe(0);
		expect(notices[0]).toContain("locked");
	});
});
