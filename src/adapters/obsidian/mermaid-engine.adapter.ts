import { App, PluginManifest, loadMermaid } from "obsidian";
import { getMermaid, resetMermaidCache } from "../../mermaid-loader";
import type { MermaidAPI, MermaidDiskCache } from "../../core/mermaid/config";
import type { SettingsStore } from "../../ports/settings-store";
import type { WonderSettings } from "../../settings";
import type { MermaidEnginePort } from "../../ports/mermaid-engine";

// Marks a `window.mermaid` we installed, so we know whether to restore Obsidian's
// original on unload and don't re-stash our own as the "original".
const OWNED_BY_WONDER = Symbol("wonder.mermaid.owned");

type WindowWithMermaid = Window & {
	mermaid?: MermaidAPI & { [OWNED_BY_WONDER]?: true };
	obsidian_mermaid?: MermaidAPI;
};

export class ObsidianMermaidEngine implements MermaidEnginePort {
	// Memoized ELK layout loaders, imported from the bundled elk.js shipped beside
	// the plugin. Loaded once, on first use, and only when ELK is enabled.
	private elkLoaders: Promise<unknown[] | null> | null = null;

	// Disk cache for the downloaded CDN Mermaid, backed by plugin settings so a
	// downloaded version survives reloads.
	private readonly diskCache: MermaidDiskCache;

	constructor(
		private app: App,
		private manifest: PluginManifest,
		private settings: SettingsStore<WonderSettings>,
	) {
		this.diskCache = {
			read: async () => this.settings.get().mermaidCdnCache,
			write: async (value) => {
				await this.settings.update((s) => {
					s.mermaidCdnCache = value;
				});
			},
		};
	}

	// Resolve a ready Mermaid instance for the current settings, injecting the
	// local ELK loader. Used by both views and the global swap.
	getInstance(): Promise<MermaidAPI> {
		const s = this.settings.get();
		return getMermaid(
			this.diskCache,
			s.mermaidUseObsidianTheme,
			s.mermaidUseElk,
			s.mermaidUseHandDrawn,
			() => this.loadElkLoaders(),
		);
	}

	// Install the downloaded Mermaid as `window.mermaid` so every `mermaid` block
	// across Obsidian renders with it. With no download cached this restores the
	// built-in, so the swap is a safe no-op until the user opts in via a download.
	async syncGlobal(): Promise<void> {
		const win = window as WindowWithMermaid;
		// Stash Obsidian's original exactly once, before we overwrite it.
		if (!win.mermaid?.[OWNED_BY_WONDER]) {
			win.obsidian_mermaid =
				win.mermaid ?? ((await loadMermaid()) as MermaidAPI);
		}
		if (this.settings.get().mermaidCdnCache) {
			const mermaid = await this.getInstance();
			const owned = mermaid as MermaidAPI & { [OWNED_BY_WONDER]?: true };
			owned[OWNED_BY_WONDER] = true;
			win.mermaid = owned;
		} else if (win.obsidian_mermaid) {
			// Nothing downloaded (or cache cleared): hand back to the built-in.
			win.mermaid = win.obsidian_mermaid;
			resetMermaidCache();
		}
	}

	reset(): void {
		if (typeof window !== "undefined") {
			const win = window as WindowWithMermaid;
			if (win.mermaid?.[OWNED_BY_WONDER] && win.obsidian_mermaid) {
				win.mermaid = win.obsidian_mermaid;
			}
		}
		resetMermaidCache();
	}

	// Import the bundled elk.js from the plugin folder (via the vault adapter) and
	// return its layout loaders. Memoized; returns null on any failure so ELK
	// simply degrades to the default layout.
	private loadElkLoaders(): Promise<unknown[] | null> {
		if (!this.elkLoaders) {
			this.elkLoaders = (async () => {
				try {
					const path = `${this.app.vault.configDir}/plugins/${this.manifest.id}/elk.js`;
					const source = await this.app.vault.adapter.read(path);
					const blob = new Blob([source], {
						type: "application/javascript",
					});
					const url = URL.createObjectURL(blob);
					try {
						const mod = (await import(/* @vite-ignore */ url)) as {
							default?: unknown[];
						};
						return mod.default ?? null;
					} finally {
						URL.revokeObjectURL(url);
					}
				} catch (err) {
					console.warn(
						"[Wonder] ELK bundle (elk.js) unavailable; using default layout.",
						err,
					);
					return null;
				}
			})();
		}
		return this.elkLoaders;
	}
}
