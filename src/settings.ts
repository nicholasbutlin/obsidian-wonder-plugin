import { App, PluginSettingTab, Setting } from "obsidian";
import WonderPlugin from "./main";

export interface WonderSettings {
	dateFormat: string;
	kanbanFile: string;
	processRefreshInterval: number;
	normalizeKanbanDates: boolean;
}

export const DEFAULT_SETTINGS: WonderSettings = {
	dateFormat: "YYYY-MM-DD",
	kanbanFile: "ToDo Auto",
	processRefreshInterval: 10,
	normalizeKanbanDates: true,
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
			"Process Refresh Interval (seconds)",
			"Interval in seconds to wait before processing modified files.",
			DEFAULT_SETTINGS.processRefreshInterval.toString(),
			this.plugin.settings.processRefreshInterval.toString(),
			(value) => {
				const interval = parseInt(value, 10);
				if (!isNaN(interval) && interval > 0) {
					this.plugin.settings.processRefreshInterval = interval;
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
