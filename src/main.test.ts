import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TFile } from "obsidian";
import WonderPlugin from "./main";

function makeTFile(path: string, basename: string): TFile {
	const file = new TFile();
	file.path = path;
	file.basename = basename;
	return file;
}

function makePlugin() {
	const plugin = new (WonderPlugin as never as { new (): WonderPlugin })();
	const scans: TFile[] = [];
	(plugin as unknown as { settings: unknown }).settings = {
		kanbanFile: "ToDo Auto",
		processRefreshInterval: 10,
		dateFormat: "YYYY-MM-DD",
	};
	(plugin as unknown as { actionProcessor: unknown }).actionProcessor = {
		processActionMarkers: (file: TFile) => {
			scans.push(file);
			return Promise.resolve();
		},
	};
	return { plugin, scans };
}

describe("WonderPlugin.scheduleActionScan", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("collapses rapid edits to the same note into a single scan", () => {
		const { plugin, scans } = makePlugin();
		const note = makeTFile("Note.md", "Note");

		plugin.scheduleActionScan(note);
		plugin.scheduleActionScan(note);
		plugin.scheduleActionScan(note);
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(1);
	});

	it("scans different notes independently", () => {
		const { plugin, scans } = makePlugin();

		plugin.scheduleActionScan(makeTFile("A.md", "A"));
		plugin.scheduleActionScan(makeTFile("B.md", "B"));
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(2);
	});

	it("skips the Kanban file", () => {
		const { plugin, scans } = makePlugin();

		plugin.scheduleActionScan(makeTFile("ToDo Auto.md", "ToDo Auto"));
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(0);
	});

	it("cancels pending scans on unload", () => {
		const { plugin, scans } = makePlugin();

		plugin.scheduleActionScan(makeTFile("Note.md", "Note"));
		plugin.onunload();
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(0);
	});
});
