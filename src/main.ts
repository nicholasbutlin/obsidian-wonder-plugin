import { Editor, Plugin, TAbstractFile, TFile } from "obsidian";
import { WonderSettings, DEFAULT_SETTINGS, WonderSettingTab } from "./settings";
import { ActionProcessor } from "./action-processor";

// This is the main plugin class
export default class WonderPlugin extends Plugin {
	settings: WonderSettings;
	actionProcessor: ActionProcessor;

	async onload() {
		await this.loadSettings();

		this.actionProcessor = new ActionProcessor(this);

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				menu.addItem((item) =>
					item
						.setTitle("Insert date heading")
						.onClick(() => this.insertDateHeading(editor))
				);
			})
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => this.scheduleActionScan(file))
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new WonderSettingTab(this.app, this));
	}

	insertDateHeading(editor: Editor) {
		const date = window.moment().format(this.settings.dateFormat);
		editor.replaceSelection(`# ${date}`);
	}

	// Scan modified notes for @action markers, but skip the Kanban file itself.
	// A delay lets the file settle before we read and rewrite it.
	scheduleActionScan(file: TAbstractFile) {
		if (
			!(file instanceof TFile) ||
			file.path === `${this.settings.kanbanFile}.md`
		) {
			return;
		}
		setTimeout(() => {
			this.actionProcessor.processActionMarkers(file);
		}, this.settings.processRefreshInterval * 1000);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
