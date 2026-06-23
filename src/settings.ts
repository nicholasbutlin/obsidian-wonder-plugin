import { App, PluginSettingTab, Setting } from "obsidian";
import WonderPlugin from "./main";
import {
	fetchElkSource,
	fetchMermaidSource,
	type MermaidCdnCache,
} from "./mermaid-loader";

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
	// Mermaid rendering: the version to fetch from CDN and the render toggles.
	// `mermaidCdnCache` holds the downloaded source so it survives reloads; null
	// means "use Obsidian's built-in Mermaid".
	mermaidVersion: string;
	mermaidUseObsidianTheme: boolean;
	mermaidUseElk: boolean;
	mermaidUseHandDrawn: boolean;
	mermaidCdnCache: MermaidCdnCache | null;
	// Show the edit button + pan/zoom overlay on rendered diagrams in notes.
	mermaidDiagramTools: boolean;
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
	mermaidVersion: "latest",
	mermaidUseObsidianTheme: true,
	mermaidUseElk: true,
	mermaidUseHandDrawn: false,
	mermaidCdnCache: null,
	mermaidDiagramTools: true,
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

		this.displayMermaid();
	}

	// Mermaid rendering settings: choose a CDN version, download it (so all
	// `mermaid` blocks render with it), and tune the render options.
	private displayMermaid(): void {
		const s = this.plugin.settings;

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
						await this.plugin.saveSettings();
					}),
			);

		const cache = s.mermaidCdnCache;
		const cacheSetting = new Setting(this.containerEl)
			.setName("Downloaded Mermaid")
			.setDesc(
				cache
					? `Cached: ${cache.version}${cache.elk ? " (with ELK)" : ""}. All mermaid blocks render with this version.`
					: "Nothing downloaded — using Obsidian's built-in Mermaid.",
			);

		if (cache) {
			cacheSetting.addButton((btn) =>
				btn.setButtonText("Clear").onClick(async () => {
					s.mermaidCdnCache = null;
					await this.plugin.saveSettings();
					await this.plugin.syncMermaidGlobal();
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
								// ELK is best-effort: a failure here shouldn't block the
								// core download.
								let elk: string | undefined;
								try {
									elk = await fetchElkSource();
								} catch {
									elk = undefined;
								}
								s.mermaidCdnCache = {
									version: s.mermaidVersion,
									source,
									elk,
								};
								await this.plugin.saveSettings();
								await this.plugin.syncMermaidGlobal();
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
					await this.plugin.saveSettings();
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
					await this.plugin.saveSettings();
					await this.plugin.syncMermaidGlobal();
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
