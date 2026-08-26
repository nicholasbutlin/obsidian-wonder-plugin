import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { LastOneToOneService } from "./last-one-to-one.service";
import type { VaultPort } from "../../ports/vault";
import type { Notifier } from "../../ports/notifier";
import type { SettingsStore } from "../../ports/settings-store";
import type { WonderSettings } from "../../settings";

function makeTFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
	file.extension = "md";
	return file;
}

const person = [
	"---",
	"updated: 2026-06-18T13:43",
	"type: person",
	"---",
	"",
	"# 2026-08-18",
	"- notes",
	"",
].join("\n");

function makeService(
	files: Record<string, string>,
	overrides: Partial<WonderSettings> = {},
) {
	const store = { ...files };
	const notices: string[] = [];
	const vault: VaultPort = {
		read: async (file) => store[file.path],
		process: async (file, fn) => (store[file.path] = fn(store[file.path])),
		getFileByPath: () => null,
	};
	const notifier: Notifier = { info: (message) => notices.push(message) };
	const settings: SettingsStore<WonderSettings> = {
		get: () =>
			({
				syncLastOneToOne: true,
				peopleFolder: "Evenergi/One2One",
				lastOneToOneProperty: "last_1_1",
				...overrides,
			}) as WonderSettings,
		update: async () => {},
		save: async () => {},
	};
	return {
		service: new LastOneToOneService(vault, notifier, settings),
		read: (path: string) => store[path],
		notices,
	};
}

describe("LastOneToOneService.run", () => {
	it("writes the newest dated heading into the property", async () => {
		const path = "Evenergi/One2One/Dan Hilson.md";
		const { service, read } = makeService({ [path]: person });

		expect(await service.run(makeTFile(path))).toBe(true);
		expect(read(path)).toContain("type: person\nlast_1_1: 2026-08-18");
	});

	it("is idempotent: a second run writes nothing", async () => {
		const path = "Evenergi/One2One/Dan Hilson.md";
		const { service, read } = makeService({ [path]: person });
		const file = makeTFile(path);

		await service.run(file);
		const after = read(path);
		expect(await service.run(file)).toBe(false);
		expect(read(path)).toBe(after);
	});

	it("updates the property when a newer entry is logged", async () => {
		const path = "Evenergi/One2One/Dan Hilson.md";
		const { service, read } = makeService({
			[path]: person.replace(
				"type: person",
				"type: person\nlast_1_1: 2026-07-23",
			),
		});

		expect(await service.run(makeTFile(path))).toBe(true);
		expect(read(path)).toContain("last_1_1: 2026-08-18");
	});

	it("leaves a person page with no dated entry alone", async () => {
		const path = "Evenergi/One2One/Alex McNeill.md";
		const page = "---\ntype: person\n---\n\n# Alex\n- no dated entries\n";
		const { service, read } = makeService({ [path]: page });

		expect(await service.run(makeTFile(path))).toBe(false);
		expect(read(path)).toBe(page);
	});

	it("skips `_`-prefixed reference pages in the folder", async () => {
		const path = "Evenergi/One2One/_one2one Agenda.md";
		const { service, read } = makeService({ [path]: person });

		expect(await service.run(makeTFile(path))).toBe(false);
		expect(read(path)).toBe(person);
	});

	it("skips notes outside the people folder", async () => {
		const path = "Projects/Notes.md";
		const { service, read } = makeService({ [path]: person });

		expect(await service.run(makeTFile(path))).toBe(false);
		expect(read(path)).toBe(person);
	});

	it("skips notes in the folder that are not person pages", async () => {
		const path = "Evenergi/One2One/Board.md";
		const page = "---\nkanban-plugin: board\n---\n\n# 2026-08-18\n";
		const { service, read } = makeService({ [path]: page });

		expect(await service.run(makeTFile(path))).toBe(false);
		expect(read(path)).toBe(page);
	});

	it("does nothing when the sync is switched off", async () => {
		const path = "Evenergi/One2One/Dan Hilson.md";
		const { service, read } = makeService(
			{ [path]: person },
			{ syncLastOneToOne: false },
		);

		expect(await service.run(makeTFile(path))).toBe(false);
		expect(read(path)).toBe(person);
	});
});

describe("LastOneToOneService.runAll", () => {
	it("updates every in-scope page and reports the count", async () => {
		const a = "Evenergi/One2One/Dan Hilson.md";
		const b = "Evenergi/One2One/Phil Parker.md";
		const skipped = "Evenergi/One2One/_Performance.md";
		const { service, read, notices } = makeService({
			[a]: person,
			[b]: person.replace("# 2026-08-18", "# 2026-08-24"),
			[skipped]: person,
		});

		expect(
			await service.runAll([a, b, skipped].map((path) => makeTFile(path))),
		).toBe(2);
		expect(read(a)).toContain("last_1_1: 2026-08-18");
		expect(read(b)).toContain("last_1_1: 2026-08-24");
		expect(read(skipped)).toBe(person);
		expect(notices).toEqual(["Wonder: updated 2 person pages."]);
	});

	it("says so when everything is already current", async () => {
		const { service, notices } = makeService({});

		expect(await service.runAll([])).toBe(0);
		expect(notices).toEqual(["Wonder: person pages already up to date."]);
	});
});
