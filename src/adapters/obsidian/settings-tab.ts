import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, type WonderSettings } from "../../settings";
import { fetchMermaidSource } from "./mermaid-loader";
import type { SettingsStore } from "../../ports/settings-store";
import type { MermaidEnginePort } from "../../ports/mermaid-engine";

// The Wonder settings UI. Depends on the settings store (read/persist) and the
// Mermaid engine (re-sync the global after a render option changes), not on the
// plugin's internals.
export class WonderSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private store: SettingsStore<WonderSettings>,
		private engine: MermaidEnginePort,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.store.get();

		containerEl.empty();

		this.addTextSetting(
			"Date Format",
			"Desired date format.",
			DEFAULT_SETTINGS.dateFormat,
			settings.dateFormat,
			(value) => {
				settings.dateFormat = value;
			},
		);

		this.addTextSetting(
			"Kanban Path",
			"Path to the Kanban file.",
			DEFAULT_SETTINGS.kanbanFile,
			settings.kanbanFile,
			(value) => {
				settings.kanbanFile = value;
			},
		);

		this.addTextSetting(
			"Date reconcile delay (seconds)",
			"How long to wait after a board edit before normalizing Kanban dates.",
			DEFAULT_SETTINGS.dateDebounceSeconds.toString(),
			settings.dateDebounceSeconds.toString(),
			(value) => {
				const interval = parseInt(value, 10);
				if (!isNaN(interval) && interval > 0) {
					settings.dateDebounceSeconds = interval;
				}
			},
		);

		this.addTextSetting(
			"Action capture delay (seconds)",
			"How long to wait after a note edit before capturing @action markers.",
			DEFAULT_SETTINGS.actionDebounceSeconds.toString(),
			settings.actionDebounceSeconds.toString(),
			(value) => {
				const interval = parseInt(value, 10);
				if (!isNaN(interval) && interval > 0) {
					settings.actionDebounceSeconds = interval;
				}
			},
		);

		this.addToggleSetting(
			"Normalize Kanban dates to 📅",
			"Rewrite Kanban picker dates (@{YYYY-MM-DD}) to the Tasks emoji format on board files.",
			settings.normalizeKanbanDates,
			(value) => {
				settings.normalizeKanbanDates = value;
			},
		);

		this.addTextSetting(
			"Context heading",
			"Heading for the section the Refresh Context command maintains.",
			DEFAULT_SETTINGS.contextHeading,
			settings.contextHeading,
			(value) => {
				settings.contextHeading = value.trim() || "Context";
			},
		);

		this.addTextAreaSetting(
			"Context query",
			"Tasks query placed in the Context section (one clause per line).",
			DEFAULT_SETTINGS.contextQuery,
			settings.contextQuery,
			(value) => {
				settings.contextQuery = value;
			},
		);

		this.displayMermaid();
	}

	// Mermaid rendering settings: choose a CDN version, download it (so all
	// `mermaid` blocks render with it), and tune the render options.
	private displayMermaid(): void {
		const s = this.store.get();

		new Setting(this.containerEl).setName("Mermaid").setHeading();

		new Setting(this.containerEl)
			.setName("Version")
			.setDesc(
				'CDN version to fetch — a version number or "latest". Download it below to take effect.',
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.mermaidVersion)
					.setValue(s.mermaidVersion)
					.onChange(async (value) => {
						s.mermaidVersion = value.trim() || DEFAULT_SETTINGS.mermaidVersion;
						await this.store.save();
					}),
			);

		const cache = s.mermaidCdnCache;
		const cacheSetting = new Setting(this.containerEl)
			.setName("Downloaded Mermaid")
			.setDesc(
				cache
					? `Cached: ${cache.version}. All mermaid blocks render with this version.`
					: "Nothing downloaded — using Obsidian's built-in Mermaid.",
			);

		if (cache) {
			cacheSetting.addButton((btn) =>
				btn.setButtonText("Clear").onClick(async () => {
					s.mermaidCdnCache = null;
					await this.store.save();
					await this.engine.syncGlobal();
					this.display();
				}),
			);
		} else {
			cacheSetting.addButton((btn) =>
				btn
					.setButtonText("Download")
					.setCta()
					.onClick(() => {
						btn.setDisabled(true);
						btn.setButtonText("Downloading…");
						void (async () => {
							try {
								const source = await fetchMermaidSource(s.mermaidVersion);
								s.mermaidCdnCache = {
									version: s.mermaidVersion,
									source,
								};
								await this.store.save();
								await this.engine.syncGlobal();
								this.display();
							} catch (err) {
								btn.setDisabled(false);
								btn.setButtonText("Download");
								cacheSetting.setDesc(
									`Download failed: ${err instanceof Error ? err.message : String(err)}`,
								);
							}
						})();
					}),
			);
		}

		this.addMermaidToggle(
			"Obsidian theme integration",
			"Diagrams follow the active Obsidian theme. When off, Mermaid uses its default theme.",
			s.mermaidUseObsidianTheme,
			(value) => {
				s.mermaidUseObsidianTheme = value;
			},
		);
		this.addMermaidToggle(
			"ELK layout engine",
			"Use ELK as the layout engine — better results for complex flowcharts and graphs.",
			s.mermaidUseElk,
			(value) => {
				s.mermaidUseElk = value;
			},
		);
		this.addMermaidToggle(
			"Hand-drawn look",
			"Render diagrams with a sketched, hand-drawn style.",
			s.mermaidUseHandDrawn,
			(value) => {
				s.mermaidUseHandDrawn = value;
			},
		);

		new Setting(this.containerEl)
			.setName("Diagram edit & zoom controls")
			.setDesc(
				"Show an edit button and pan/zoom controls on rendered diagrams in notes. Takes effect after a reload.",
			)
			.addToggle((toggle) =>
				toggle.setValue(s.mermaidDiagramTools).onChange(async (value) => {
					s.mermaidDiagramTools = value;
					await this.store.save();
				}),
			);
	}

	// A toggle that, after saving, re-syncs the global Mermaid instance so open
	// notes re-render with the new option on next paint.
	private addMermaidToggle(
		name: string,
		desc: string,
		value: boolean,
		apply: (value: boolean) => void,
	): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((toggle) =>
				toggle.setValue(value).onChange(async (value) => {
					apply(value);
					await this.store.save();
					await this.engine.syncGlobal();
				}),
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
						await this.store.save();
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
					await this.store.save();
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
						await this.store.save();
					}),
			);
	}
}
