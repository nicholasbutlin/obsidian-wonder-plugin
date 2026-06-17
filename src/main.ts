import { Editor, Plugin, TAbstractFile, TFile } from "obsidian";
import { WonderSettings, DEFAULT_SETTINGS, WonderSettingTab } from "./settings";
import { ActionProcessor } from "./action-processor";
import { DateNormalizer } from "./date-bridge";

// This is the main plugin class
export default class WonderPlugin extends Plugin {
	// Assigned in onload(), Obsidian's async lifecycle entry point, so the
	// constructor cannot initialize them.
	settings!: WonderSettings;
	actionProcessor!: ActionProcessor;
	dateNormalizer!: DateNormalizer;

	// Pending action scans, keyed by file path, so rapid edits to the same
	// note collapse into a single scan once editing settles.
	private scanTimers = new Map<string, ReturnType<typeof setTimeout>>();

	async onload() {
		await this.loadSettings();

		this.actionProcessor = new ActionProcessor(this);
		this.dateNormalizer = new DateNormalizer(this);

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

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new WonderSettingTab(this.app, this));
	}

	insertDateHeading(editor: Editor) {
		const date = window.moment().format(this.settings.dateFormat);
		editor.replaceSelection(`# ${date}`);
	}

	onunload() {
		for (const timer of this.scanTimers.values()) {
			clearTimeout(timer);
		}
		this.scanTimers.clear();
	}

	// Route a modified file by type: Kanban board files get their picker dates
	// normalized to the Tasks emoji format; every other note is scanned for
	// @action markers. Both paths are debounced per file so a burst of edits
	// triggers only one run once the file settles.
	scheduleScan(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;

		const run = this.isBoardFile(file)
			? () =>
					this.settings.normalizeKanbanDates &&
					this.dateNormalizer.normalize(file)
			: () => this.actionProcessor.processActionMarkers(file);

		this.debounce(file.path, run);
	}

	// Board detection reads frontmatter from the metadata cache rather than the
	// file, avoiding a second read. `kanban-plugin: board` is static frontmatter
	// present since the board was created, so even a cache entry that lags this
	// modify event still carries it.
	private isBoardFile(file: TFile): boolean {
		return (
			this.app.metadataCache.getFileCache(file)?.frontmatter?.[
				"kanban-plugin"
			] === "board"
		);
	}

	private debounce(path: string, fn: () => void) {
		const pending = this.scanTimers.get(path);
		if (pending) {
			clearTimeout(pending);
		}

		this.scanTimers.set(
			path,
			setTimeout(() => {
				this.scanTimers.delete(path);
				fn();
			}, this.settings.processRefreshInterval * 1000),
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
