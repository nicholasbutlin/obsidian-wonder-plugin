import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Plugin, TFile } from "obsidian";
import { ScanRouterService } from "./scan-router.service";
import { ObsidianScheduler } from "../adapters/obsidian/scheduler.adapter";
import type { MetadataPort } from "../ports/metadata";
import type { SettingsStore } from "../ports/settings-store";
import type { WonderSettings } from "../settings";

function makeTFile(path: string, basename: string): TFile {
	const file = new TFile();
	file.path = path;
	file.basename = basename;
	return file;
}

// `boardPaths` lists files reported as Kanban boards. `isBoard` can be swapped to
// simulate the metadata cache settling between event and debounce.
function makeRouter(options: { boardPaths?: string[] } = {}) {
	const boardPaths = new Set(options.boardPaths ?? []);
	const scans: TFile[] = [];
	const normalizes: TFile[] = [];

	const metadata: MetadataPort = {
		isKanbanBoard: (file: TFile) => boardPaths.has(file.path),
	};
	const settings = {
		kanbanFile: "ToDo Auto",
		dateDebounceSeconds: 1,
		actionDebounceSeconds: 10,
		normalizeKanbanDates: true,
	} as WonderSettings;
	const store: SettingsStore<WonderSettings> = {
		get: () => settings,
		update: async () => {},
		save: async () => {},
	};
	const actionCapture = {
		run: (file: TFile) => {
			scans.push(file);
			return Promise.resolve();
		},
	};
	const dateNormalize = {
		run: (file: TFile) => {
			normalizes.push(file);
			return Promise.resolve();
		},
	};

	const scheduler = new ObsidianScheduler({
		register: () => {},
	} as unknown as Plugin);
	const router = new ScanRouterService(
		scheduler,
		metadata,
		store,
		actionCapture as never,
		dateNormalize as never,
	);
	return { router, scheduler, scans, normalizes, settings, metadata };
}

describe("ScanRouterService.scheduleScan", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("collapses rapid edits to the same note into a single scan", () => {
		const { router, scans } = makeRouter();
		const note = makeTFile("Note.md", "Note");

		router.scheduleScan(note);
		router.scheduleScan(note);
		router.scheduleScan(note);
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(1);
	});

	it("scans different notes independently", () => {
		const { router, scans } = makeRouter();

		router.scheduleScan(makeTFile("A.md", "A"));
		router.scheduleScan(makeTFile("B.md", "B"));
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(2);
	});

	it("action-scans a note rather than normalizing it", () => {
		const { router, scans, normalizes } = makeRouter();

		router.scheduleScan(makeTFile("Note.md", "Note"));
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(1);
		expect(normalizes).toHaveLength(0);
	});

	it("normalizes a board file rather than action-scanning it", () => {
		const { router, scans, normalizes } = makeRouter({
			boardPaths: ["ToDo Auto.md"],
		});

		router.scheduleScan(makeTFile("ToDo Auto.md", "ToDo Auto"));
		vi.advanceTimersByTime(10_000);

		expect(normalizes).toHaveLength(1);
		expect(scans).toHaveLength(0);
	});

	it("skips board normalization when the setting is disabled", () => {
		const { router, normalizes, settings } = makeRouter({
			boardPaths: ["ToDo Auto.md"],
		});
		settings.normalizeKanbanDates = false;

		router.scheduleScan(makeTFile("ToDo Auto.md", "ToDo Auto"));
		vi.advanceTimersByTime(10_000);

		expect(normalizes).toHaveLength(0);
	});

	it("reconciles board dates on the fast interval and captures actions on the slow one", () => {
		const { router, scans, normalizes } = makeRouter({
			boardPaths: ["ToDo Auto.md"],
		});

		router.scheduleScan(makeTFile("ToDo Auto.md", "ToDo Auto")); // date: 1s
		router.scheduleScan(makeTFile("Note.md", "Note")); // action: 10s

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
		const { router, scans, normalizes, metadata } = makeRouter();
		let cacheReady = false;
		(metadata as { isKanbanBoard: (f: TFile) => boolean }).isKanbanBoard = () =>
			cacheReady;

		router.scheduleScan(makeTFile("ToDo Auto.md", "ToDo Auto"));
		cacheReady = true; // cache settles before the timer fires
		vi.advanceTimersByTime(10_000);

		expect(normalizes).toHaveLength(1);
		expect(scans).toHaveLength(0);
	});

	it("cancels pending scans when the scheduler is torn down", () => {
		const { router, scheduler, scans } = makeRouter();

		router.scheduleScan(makeTFile("Note.md", "Note"));
		scheduler.clearAll(); // what the plugin's unload teardown invokes
		vi.advanceTimersByTime(10_000);

		expect(scans).toHaveLength(0);
	});
});
