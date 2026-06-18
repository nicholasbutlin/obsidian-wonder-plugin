import { Editor, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { WonderSettings, DEFAULT_SETTINGS, WonderSettingTab } from "./settings";
import { ActionProcessor } from "./action-processor";
import { DateNormalizer } from "./date-bridge";
import { buildContextBlock, upsertContextSection } from "./context-section";

// This is the main plugin class
export default class WonderPlugin extends Plugin {
	// Assigned in onload(), Obsidian's async lifecycle entry point, so the
	// constructor cannot initialize them.
	settings!: WonderSettings;
	actionProcessor!: ActionProcessor;
	dateNormalizer!: DateNormalizer;

	// Pending scans, keyed by file path, so rapid edits to the same file
	// collapse into a single run once editing settles.
	private scanTimers = new Map<string, ReturnType<typeof setTimeout>>();

	// Paths known to be Kanban boards. Seeded at load and updated as files are
	// scanned, so the right debounce can be chosen at schedule time even when a
	// Kanban save has momentarily invalidated the metadata cache.
	private knownBoards = new Set<string>();

	async onload() {
		await this.loadSettings();

		this.actionProcessor = new ActionProcessor(this);
		this.dateNormalizer = new DateNormalizer(this);

		this.app.workspace.onLayoutReady(() => this.indexBoards());

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				menu.addItem((item) =>
					item
						.setTitle("Insert date heading")
						.onClick(() => this.insertDateHeading(editor)),
				);
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => this.scheduleScan(file)),
		);

		this.addCommand({
			id: "refresh-context",
			name: "Refresh Context section",
			callback: () => this.refreshContext(),
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new WonderSettingTab(this.app, this));
	}

	insertDateHeading(editor: Editor) {
		const date = window.moment().format(this.settings.dateFormat);
		editor.replaceSelection(`# ${date}`);
	}

	// Insert or refresh the marked Context section at the bottom of the active
	// note, leaving everything above it untouched.
	async refreshContext() {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Wonder: open a note to refresh its Context section.");
			return;
		}
		const block = buildContextBlock(
			this.settings.contextHeading,
			this.settings.contextQuery,
		);
		await this.app.vault.process(file, (data) =>
			upsertContextSection(data, block),
		);
	}

	onunload() {
		for (const timer of this.scanTimers.values()) {
			clearTimeout(timer);
		}
		this.scanTimers.clear();
	}

	// Debounce a modified file's scan so a burst of edits triggers one run once
	// the file settles. The board-vs-note routing is decided when the timer
	// fires, NOT here: a Kanban save invalidates the metadata cache, so at event
	// time `getFileCache` can briefly report no frontmatter and a board would be
	// mis-routed to the action scan. By the time the debounce fires the cache has
	// settled and `isBoardFile` is reliable.
	scheduleScan(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;
		this.debounce(
			file.path,
			() => this.scan(file),
			this.debounceSecondsFor(file),
		);
	}

	// Date reconcile is debounced briefly so a board settles fast; action capture
	// waits longer so it doesn't fire mid-typing. The board check here is
	// best-effort (it only picks the interval); the authoritative routing happens
	// in scan() once the cache has settled.
	private debounceSecondsFor(file: TFile): number {
		const isBoard = this.knownBoards.has(file.path) || this.isBoardFile(file);
		return isBoard
			? this.settings.dateDebounceSeconds
			: this.settings.actionDebounceSeconds;
	}

	// Route a settled file: Kanban board files get their picker dates normalized
	// to the Tasks emoji format; every other note is scanned for @action markers.
	private scan(file: TFile) {
		if (this.isBoardFile(file)) {
			this.knownBoards.add(file.path);
			if (this.settings.normalizeKanbanDates)
				this.dateNormalizer.normalize(file);
		} else {
			this.knownBoards.delete(file.path);
			this.actionProcessor.processActionMarkers(file);
		}
	}

	private indexBoards() {
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.isBoardFile(file)) this.knownBoards.add(file.path);
		}
	}

	private isBoardFile(file: TFile): boolean {
		return (
			this.app.metadataCache.getFileCache(file)?.frontmatter?.[
				"kanban-plugin"
			] === "board"
		);
	}

	private debounce(path: string, fn: () => void, seconds: number) {
		const pending = this.scanTimers.get(path);
		if (pending) {
			clearTimeout(pending);
		}

		this.scanTimers.set(
			path,
			setTimeout(() => {
				this.scanTimers.delete(path);
				fn();
			}, seconds * 1000),
		);
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		// Migrate the old single interval: it governed action capture.
		const legacy = (data as { processRefreshInterval?: number })
			?.processRefreshInterval;
		if (legacy != null && data?.actionDebounceSeconds == null) {
			this.settings.actionDebounceSeconds = legacy;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
