import { Plugin } from "obsidian";
import type { SettingsStore } from "../../ports/settings-store";
import { DEFAULT_SETTINGS, type WonderSettings } from "../../settings";

// Obsidian implementation of SettingsStore. Holds one live settings object so
// existing code paths that still read `plugin.settings` (the same reference) stay
// consistent with the store during the migration.
export class ObsidianSettingsStore implements SettingsStore<WonderSettings> {
	private constructor(
		private plugin: Plugin,
		private settings: WonderSettings,
	) {}

	static async load(plugin: Plugin): Promise<ObsidianSettingsStore> {
		const data = await plugin.loadData();
		const settings: WonderSettings = Object.assign({}, DEFAULT_SETTINGS, data);
		// Migrate the old single interval: it governed action capture.
		const legacy = (data as { processRefreshInterval?: number })
			?.processRefreshInterval;
		if (
			legacy != null &&
			(data as { actionDebounceSeconds?: number })?.actionDebounceSeconds == null
		) {
			settings.actionDebounceSeconds = legacy;
		}
		return new ObsidianSettingsStore(plugin, settings);
	}

	get(): WonderSettings {
		return this.settings;
	}

	async update(mutate: (settings: WonderSettings) => void): Promise<void> {
		mutate(this.settings);
		await this.save();
	}

	async save(): Promise<void> {
		await this.plugin.saveData(this.settings);
	}
}
