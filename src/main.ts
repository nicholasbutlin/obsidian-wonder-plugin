import { Editor, Plugin, TAbstractFile, TFile } from "obsidian";
import {
	WonderSettings,
	DEFAULT_SETTINGS,
	WonderSettingTab,
	kanbanPath,
} from "./settings";
import { ActionProcessor } from "./action-processor";

// This is the main plugin class
export default class WonderPlugin extends Plugin {
	// Assigned in onload(), Obsidian's async lifecycle entry point, so the
	// constructor cannot initialize them.
	settings!: WonderSettings;
	actionProcessor!: ActionProcessor;

	// Pending action scans, keyed by file path, so rapid edits to the same
	// note collapse into a single scan once editing settles.
	private scanTimers = new Map<string, ReturnType<typeof setTimeout>>();

	async onload() {
		await this.loadSettings();

		this.actionProcessor = new ActionProcessor(this);

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
			this.app.vault.on("modify", (file) => this.scheduleActionScan(file)),
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

	// Scan modified notes for @action markers, but skip the Kanban file itself.
	// Debounced per file so a burst of edits triggers only one scan once the
	// file settles.
	scheduleActionScan(file: TAbstractFile) {
		if (
			!(file instanceof TFile) ||
			file.path === kanbanPath(this.settings.kanbanFile)
		) {
			return;
		}

		const pending = this.scanTimers.get(file.path);
		if (pending) {
			clearTimeout(pending);
		}

		this.scanTimers.set(
			file.path,
			setTimeout(() => {
				this.scanTimers.delete(file.path);
				this.actionProcessor.processActionMarkers(file);
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
