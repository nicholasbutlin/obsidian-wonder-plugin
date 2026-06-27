import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TFile } from "obsidian";
import WonderPlugin from "./main";

function makeTFile(path: string, basename: string): TFile {
	const file = new TFile();
	file.path = path;
	file.basename = basename;
	return file;
}

// `boardPaths` lists files whose frontmatter should report `kanban-plugin:
// board`, mirroring how the real metadata cache classifies board files.
function makePlugin(options: { boardPaths?: string[] } = {}) {
	const boardPaths = new Set(options.boardPaths ?? []);
	const plugin = new (WonderPlugin as never as { new (): WonderPlugin })();
	const scans: TFile[] = [];
	const normalizes: TFile[] = [];

	(plugin as unknown as { settings: unknown }).settings = {
		kanbanFile: "ToDo Auto",
		dateDebounceSeconds: 1,
		actionDebounceSeconds: 10,
		dateFormat: "YYYY-MM-DD",
		normalizeKanbanDates: true,
	};
	(plugin as unknown as { app: unknown }).app = {
		metadataCache: {
			getFileCache: (file: TFile) =>
				boardPaths.has(file.path)
					? { frontmatter: { "kanban-plugin": "board" } }
					: null,
		},
	};
	(plugin as unknown as { actionCapture: unknown }).actionCapture = {
		run: (file: TFile) => {
			scans.push(file);
			return Promise.resolve();
		},
	};
	(plugin as unknown as { dateNormalizer: unknown }).dateNormalizer = {
		normalize: (file: TFile) => {
			normalizes.push(file);
			return Promise.resolve();
		},
	};
	return { plugin, scans, normalizes };
}

describe("WonderPlugin.scheduleScan", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("collapses rapid edits to the same note into a single scan", () => {
		const { plugin, scans } = makePlugin();
		const note = makeTFile("Note.md", "Note");

		plugin.scheduleScan(note);
		plugin.scheduleScan(note);
		plugin.scheduleScan(note);
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(1);
	});

	it("scans different notes independently", () => {
		const { plugin, scans } = makePlugin();

		plugin.scheduleScan(makeTFile("A.md", "A"));
		plugin.scheduleScan(makeTFile("B.md", "B"));
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(2);
	});

	it("action-scans a note rather than normalizing it", () => {
		const { plugin, scans, normalizes } = makePlugin();

		plugin.scheduleScan(makeTFile("Note.md", "Note"));
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(1);
		expect(normalizes).toHaveLength(0);
	});

	it("normalizes a board file rather than action-scanning it", () => {
		const { plugin, scans, normalizes } = makePlugin({
			boardPaths: ["ToDo Auto.md"],
		});

		plugin.scheduleScan(makeTFile("ToDo Auto.md", "ToDo Auto"));
		vi.advanceTimersByTime(10_000);

		expect(normalizes).toHaveLength(1);
		expect(scans).toHaveLength(0);
	});

	it("skips board normalization when the setting is disabled", () => {
		const { plugin, normalizes } = makePlugin({
			boardPaths: ["ToDo Auto.md"],
		});
		(
			plugin as unknown as { settings: { normalizeKanbanDates: boolean } }
		).settings.normalizeKanbanDates = false;

		plugin.scheduleScan(makeTFile("ToDo Auto.md", "ToDo Auto"));
		vi.advanceTimersByTime(10_000);

		expect(normalizes).toHaveLength(0);
	});

	it("reconciles board dates on the fast interval and captures actions on the slow one", () => {
		const { plugin, scans, normalizes } = makePlugin({
			boardPaths: ["ToDo Auto.md"],
		});

		plugin.scheduleScan(makeTFile("ToDo Auto.md", "ToDo Auto")); // date: 1s
		plugin.scheduleScan(makeTFile("Note.md", "Note")); // action: 10s

		vi.advanceTimersByTime(1000);
		expect(normalizes).toHaveLength(1); // board reconciled fast
		expect(scans).toHaveLength(0); // action capture still waiting

		vi.advanceTimersByTime(9000);
		expect(scans).toHaveLength(1); // action captured after its longer delay
	});

	it("decides board-vs-note when the debounce fires, not when the event does", () => {
		// Kanban's write invalidates the metadata cache, so at event time the
		// frontmatter is briefly missing; it's repopulated before the debounce
		// fires. Routing must use the settled cache, or boards get mis-scanned.
		const { plugin, scans, normalizes } = makePlugin();
		let cacheReady = false;
		(
			plugin as unknown as {
				app: { metadataCache: { getFileCache: (f: TFile) => unknown } };
			}
		).app.metadataCache.getFileCache = () =>
			cacheReady ? { frontmatter: { "kanban-plugin": "board" } } : null;

		plugin.scheduleScan(makeTFile("ToDo Auto.md", "ToDo Auto"));
		cacheReady = true; // cache settles before the timer fires
		vi.advanceTimersByTime(10_000);

		expect(normalizes).toHaveLength(1);
		expect(scans).toHaveLength(0);
	});

	it("cancels pending scans on unload", () => {
		const { plugin, scans } = makePlugin();

		plugin.scheduleScan(makeTFile("Note.md", "Note"));
		plugin.onunload();
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(0);
	});
});

describe("WonderPlugin.refreshContext", () => {
	function makeContextPlugin(activeFile: TFile | null, content: string) {
		const plugin = new (WonderPlugin as never as { new (): WonderPlugin })();
		let written = content;
		(plugin as unknown as { settings: unknown }).settings = {
			contextHeading: "Context",
			contextQuery: "not done",
		};
		(plugin as unknown as { app: unknown }).app = {
			workspace: { getActiveFile: () => activeFile },
			vault: {
				process: async (_f: TFile, fn: (d: string) => string) => {
					written = fn(written);
					return written;
				},
			},
		};
		return { plugin, read: () => written };
	}

	it("inserts the Context block into the active note, leaving the top intact", async () => {
		const { plugin, read } = makeContextPlugin(
			makeTFile("Daily.md", "Daily"),
			"# Daily\nnotes\n",
		);

		await plugin.refreshContext();

		const out = read();
		expect(out.startsWith("# Daily\nnotes\n")).toBe(true);
		expect(out).toContain("<!-- wonder:context:start -->");
		expect(out).toContain("## Context");
		expect(out).toContain("```tasks\nnot done\n```");
	});

	it("does nothing when there is no active note", async () => {
		const { plugin, read } = makeContextPlugin(null, "untouched");
		await plugin.refreshContext();
		expect(read()).toBe("untouched");
	});
});
