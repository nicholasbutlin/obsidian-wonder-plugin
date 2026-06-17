import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { normalizeKanbanDates, DateNormalizer } from "./date-bridge";

describe("normalizeKanbanDates", () => {
	it("converts a brace date to the Tasks due emoji", () => {
		expect(normalizeKanbanDates("do thing @{2026-06-20}")).toBe(
			"do thing 📅 2026-06-20",
		);
	});

	it("drops the time component from brace date-times", () => {
		expect(normalizeKanbanDates("@{2026-06-20 09:00}")).toBe("📅 2026-06-20");
		expect(normalizeKanbanDates("@{2026-06-20T09:00}")).toBe("📅 2026-06-20");
	});

	it("leaves @[[date]] reference stamps untouched", () => {
		expect(normalizeKanbanDates("done @[[2026-03-27]]")).toBe(
			"done @[[2026-03-27]]",
		);
	});

	it("converts only the brace date on a line that has both", () => {
		expect(normalizeKanbanDates("task @[[2026-03-27]] @{2026-06-20}")).toBe(
			"task @[[2026-03-27]] 📅 2026-06-20",
		);
	});

	it("is idempotent", () => {
		const once = normalizeKanbanDates("a @{2026-06-20} b @{2026-07-01}");
		expect(normalizeKanbanDates(once)).toBe(once);
	});

	it("returns the input unchanged when there are no brace dates", () => {
		const text = "# Notes\n- [ ] something 📅 2026-06-14 @[[2026-03-27]]\n";
		expect(normalizeKanbanDates(text)).toBe(text);
	});

	// Re-picking a date: Kanban can't edit a 📅 it doesn't own, so it inserts a
	// fresh @{} alongside the existing 📅. The picked date must supersede the old
	// one rather than leaving two due dates on the card.
	it("replaces an existing 📅 on a line when a new brace date is picked", () => {
		expect(
			normalizeKanbanDates(
				"- [ ] Pay HMRC 📅 2026-06-30 #General @{2026-07-15}",
			),
		).toBe("- [ ] Pay HMRC #General 📅 2026-07-15");
	});

	it("only replaces the 📅 on the line that has the new brace date", () => {
		expect(
			normalizeKanbanDates(
				"- [ ] a 📅 2026-06-30\n- [ ] b 📅 2026-01-01 @{2026-07-15}",
			),
		).toBe("- [ ] a 📅 2026-06-30\n- [ ] b 📅 2026-07-15");
	});

	it("is idempotent through a replace", () => {
		const once = normalizeKanbanDates("- [ ] b 📅 2026-01-01 @{2026-07-15}");
		expect(normalizeKanbanDates(once)).toBe(once);
	});

	// Tasks reads the date on a card's main `- [ ]` line, and Kanban only renders
	// inline metadata there too. A picker date that lands on an indented
	// continuation line must be lifted to the card's main line.
	it("lifts a converted date from a continuation line to the card's main line", () => {
		expect(
			normalizeKanbanDates("- [ ] Policies:\n\tdetail @{2026-06-20}"),
		).toBe("- [ ] Policies: 📅 2026-06-20\n\tdetail");
	});

	it("heals an existing 📅 stranded on a continuation line (no brace)", () => {
		expect(
			normalizeKanbanDates("- [ ] Strategy\n\t[[Plan review]] 📅 2026-06-18"),
		).toBe("- [ ] Strategy 📅 2026-06-18\n\t[[Plan review]]");
	});

	it("leaves a card whose 📅 is already on the main line untouched", () => {
		const text = "- [ ] a 📅 2026-06-30\n\tsome detail";
		expect(normalizeKanbanDates(text)).toBe(text);
	});

	it("replaces and lifts on a re-picked multi-line card", () => {
		expect(
			normalizeKanbanDates("- [ ] task 📅 2026-01-01\n\tnote @{2026-07-15}"),
		).toBe("- [ ] task 📅 2026-07-15\n\tnote");
	});
});

// In-memory Vault stand-in with a write counter so we can assert the no-op guard.
class FakeVault {
	private contents = new Map<TFile, string>();
	processCalls = 0;

	addFile(path: string, content: string): TFile {
		const file = new TFile();
		file.path = path;
		this.contents.set(file, content);
		return file;
	}

	async read(file: TFile): Promise<string> {
		return this.contents.get(file) ?? "";
	}

	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		this.processCalls++;
		const next = fn(this.contents.get(file) ?? "");
		this.contents.set(file, next);
		return next;
	}
}

// A stand-in for an open Kanban board view, recording setViewData calls.
class FakeKanbanLeaf {
	view: {
		file: { path: string };
		setViewData: (data: string, clear: boolean) => void;
	};
	calls: { data: string; clear: boolean }[] = [];

	constructor(path: string) {
		this.view = {
			file: { path },
			setViewData: (data, clear) => this.calls.push({ data, clear }),
		};
	}
}

function makeNormalizer(
	vault: FakeVault,
	leaves: FakeKanbanLeaf[] = [],
): DateNormalizer {
	const plugin = {
		app: { vault, workspace: { getLeavesOfType: () => leaves } },
	};
	return new DateNormalizer(plugin as never);
}

describe("DateNormalizer.normalize", () => {
	it("rewrites brace dates on a board file", async () => {
		const vault = new FakeVault();
		const board = vault.addFile(
			"ToDo Auto.md",
			"## ToDo\n- [ ] ship it @{2026-06-20}\n",
		);

		await makeNormalizer(vault).normalize(board);

		expect(await vault.read(board)).toBe(
			"## ToDo\n- [ ] ship it 📅 2026-06-20\n",
		);
	});

	it("does not write when there is nothing to convert", async () => {
		const vault = new FakeVault();
		const board = vault.addFile(
			"ToDo Auto.md",
			"## ToDo\n- [ ] already 📅 2026-06-20 @[[2026-03-27]]\n",
		);

		await makeNormalizer(vault).normalize(board);

		expect(vault.processCalls).toBe(0);
	});

	it("leaves the %% kanban:settings %% block untouched", async () => {
		const vault = new FakeVault();
		const settings =
			'%% kanban:settings\n```\n{"kanban-plugin":"board"}\n```\n%%\n';
		const board = vault.addFile(
			"ToDo Auto.md",
			`## ToDo\n- [ ] ship it @{2026-06-20}\n\n${settings}`,
		);

		await makeNormalizer(vault).normalize(board);

		expect(await vault.read(board)).toContain(settings);
	});

	// Obsidian won't push an external write into a focused board view, so after
	// writing we re-feed the content to any open Kanban leaf for the file.
	it("re-renders an open Kanban board showing the file", async () => {
		const vault = new FakeVault();
		const board = vault.addFile(
			"ToDo Auto.md",
			"## ToDo\n- [ ] ship it @{2026-06-20}\n",
		);
		const leaf = new FakeKanbanLeaf("ToDo Auto.md");

		await makeNormalizer(vault, [leaf]).normalize(board);

		expect(leaf.calls).toHaveLength(1);
		expect(leaf.calls[0].data).toContain("📅 2026-06-20");
	});

	it("does not refresh a Kanban board showing a different file", async () => {
		const vault = new FakeVault();
		const board = vault.addFile(
			"ToDo Auto.md",
			"## ToDo\n- [ ] ship it @{2026-06-20}\n",
		);
		const other = new FakeKanbanLeaf("ToDo General.md");

		await makeNormalizer(vault, [other]).normalize(board);

		expect(other.calls).toHaveLength(0);
	});

	it("does not refresh when there was no change to write", async () => {
		const vault = new FakeVault();
		const board = vault.addFile(
			"ToDo Auto.md",
			"## ToDo\n- [ ] already 📅 2026-06-20\n",
		);
		const leaf = new FakeKanbanLeaf("ToDo Auto.md");

		await makeNormalizer(vault, [leaf]).normalize(board);

		expect(leaf.calls).toHaveLength(0);
	});
});
