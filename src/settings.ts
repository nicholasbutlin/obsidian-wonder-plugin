import { App, PluginSettingTab, Setting } from "obsidian";
import WonderPlugin from "./main";

export interface WonderSettings {
	dateFormat: string;
	kanbanFile: string;
	// Date reconcile is debounced briefly so the board settles quickly after a
	// picker edit; action capture waits longer so it doesn't fire mid-typing.
	dateDebounceSeconds: number;
	actionDebounceSeconds: number;
	normalizeKanbanDates: boolean;
	// The "Refresh Context" command's heading and Tasks query (template string).
	contextHeading: string;
	contextQuery: string;
}

export const DEFAULT_SETTINGS: WonderSettings = {
	dateFormat: "YYYY-MM-DD",
	kanbanFile: "ToDo Auto",
	dateDebounceSeconds: 1,
	actionDebounceSeconds: 10,
	normalizeKanbanDates: true,
	contextHeading: "Context",
	contextQuery:
		"not done\n(due before tomorrow) OR (happens today)\nsort by priority",
};

// The Kanban setting stores a vault-relative name without extension; the file
// on disk is always that name with a `.md` suffix.
export function kanbanPath(kanbanFile: string): string {
	return `${kanbanFile}.md`;
}

export class WonderSettingTab extends PluginSettingTab {
	plugin: WonderPlugin;

	constructor(app: App, plugin: WonderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		this.addTextSetting(
			"Date Format",
			"Desired date format.",
			DEFAULT_SETTINGS.dateFormat,
			this.plugin.settings.dateFormat,
			(value) => {
				this.plugin.settings.dateFormat = value;
			},
		);

		this.addTextSetting(
			"Kanban Path",
			"Path to the Kanban file.",
			DEFAULT_SETTINGS.kanbanFile,
			this.plugin.settings.kanbanFile,
			(value) => {
				this.plugin.settings.kanbanFile = value;
			},
		);

		this.addTextSetting(
			"Date reconcile delay (seconds)",
			"How long to wait after a board edit before normalizing Kanban dates.",
			DEFAULT_SETTINGS.dateDebounceSeconds.toString(),
			this.plugin.settings.dateDebounceSeconds.toString(),
			(value) => {
				const interval = parseInt(value, 10);
				if (!isNaN(interval) && interval > 0) {
					this.plugin.settings.dateDebounceSeconds = interval;
				}
			},
		);

		this.addTextSetting(
			"Action capture delay (seconds)",
			"How long to wait after a note edit before capturing @action markers.",
			DEFAULT_SETTINGS.actionDebounceSeconds.toString(),
			this.plugin.settings.actionDebounceSeconds.toString(),
			(value) => {
				const interval = parseInt(value, 10);
				if (!isNaN(interval) && interval > 0) {
					this.plugin.settings.actionDebounceSeconds = interval;
				}
			},
		);

		this.addToggleSetting(
			"Normalize Kanban dates to 📅",
			"Rewrite Kanban picker dates (@{YYYY-MM-DD}) to the Tasks emoji format on board files.",
			this.plugin.settings.normalizeKanbanDates,
			(value) => {
				this.plugin.settings.normalizeKanbanDates = value;
			},
		);

		this.addTextSetting(
			"Context heading",
			"Heading for the section the Refresh Context command maintains.",
			DEFAULT_SETTINGS.contextHeading,
			this.plugin.settings.contextHeading,
			(value) => {
				this.plugin.settings.contextHeading = value.trim() || "Context";
			},
		);

		this.addTextAreaSetting(
			"Context query",
			"Tasks query placed in the Context section (one clause per line).",
			DEFAULT_SETTINGS.contextQuery,
			this.plugin.settings.contextQuery,
			(value) => {
				this.plugin.settings.contextQuery = value;
			},
		);
	}

	private addTextAreaSetting(
		name: string,
		desc: string,
		placeholder: string,
		value: string,
		apply: (value: string) => void,
	) {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addTextArea((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(value)
					.onChange(async (value) => {
						apply(value);
						await this.plugin.saveSettings();
					}),
			);
	}

	private addToggleSetting(
		name: string,
		desc: string,
		value: boolean,
		apply: (value: boolean) => void,
	) {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((toggle) =>
				toggle.setValue(value).onChange(async (value) => {
					apply(value);
					await this.plugin.saveSettings();
				}),
			);
	}

	private addTextSetting(
		name: string,
		desc: string,
		placeholder: string,
		value: string,
		apply: (value: string) => void,
	) {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(value)
					.onChange(async (value) => {
						apply(value);
						await this.plugin.saveSettings();
					}),
			);
	}
}
