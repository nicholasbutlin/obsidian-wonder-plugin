import { loadMermaid, requestUrl } from "obsidian";
import {
	cdnBaseUrl,
	getMermaidConfig,
	rewriteChunkImports,
	type ElkLoader,
	type MermaidAPI,
	type MermaidDiskCache,
} from "../../core/mermaid/config";

// Loads Mermaid for the Wonder plugin. Unlike the bundled approach, we never
// ship Mermaid in main.js: a chosen version is fetched from the jsDelivr CDN
// (on explicit user action), cached to disk, and imported at runtime via a blob
// URL. When nothing is cached we fall back to Obsidian's own built-in Mermaid,
// so the plugin is fully functional offline — it just renders with the built-in
// version until the user downloads a newer one.
//
// The pure config/URL helpers (getMermaidConfig, cdnBaseUrl, rewriteChunkImports,
// createMermaidId) and shared types now live in ./core/mermaid/config and are
// re-exported here for existing importers.
export * from "../../core/mermaid/config";

export async function fetchMermaidSource(version: string): Promise<string> {
	const baseUrl = cdnBaseUrl(version);
	const response = await requestUrl(`${baseUrl}mermaid.esm.min.mjs`);
	return rewriteChunkImports(response.text, baseUrl);
}

// Import an ESM source string through a transient blob URL.
async function importFromSource(source: string): Promise<{ default: unknown }> {
	const blob = new Blob([source], { type: "application/javascript" });
	const blobUrl = URL.createObjectURL(blob);
	try {
		return (await import(/* @vite-ignore */ blobUrl)) as {
			default: unknown;
		};
	} finally {
		URL.revokeObjectURL(blobUrl);
	}
}

let mermaidCache: Record<string, Promise<MermaidAPI> | undefined> = {};

// Resolve a ready-to-use Mermaid instance. Uses the in-memory cache when the
// options match, otherwise builds from the disk-cached CDN source, or falls back
// to Obsidian's built-in Mermaid when nothing is cached.
export async function getMermaid(
	cache: MermaidDiskCache,
	useObsidianTheme = true,
	useElk = true,
	useHandDrawn = false,
	elkLoader?: ElkLoader,
): Promise<MermaidAPI> {
	const cached = await cache.read();
	const key = cached
		? `cdn:${cached.version}:${useObsidianTheme}:${useElk}:${useHandDrawn}`
		: "builtin";

	const hit = mermaidCache[key];
	if (hit) return hit;
	// Options changed (or cache state changed): drop stale instances so the next
	// render rebuilds with the current config.
	mermaidCache = {};

	if (!cached) {
		// No downloaded version: defer to Obsidian's built-in Mermaid. Not stored
		// in mermaidCache so a later download is picked up on the next render.
		return (await loadMermaid()) as MermaidAPI;
	}

	const built = (async () => {
		try {
			const mod = (await importFromSource(cached.source)) as {
				default: MermaidAPI;
			};
			const mermaid = mod.default;
			mermaid.initialize(
				getMermaidConfig(useObsidianTheme, useElk, useHandDrawn),
			);
			if (useElk && elkLoader) {
				try {
					const loaders = await elkLoader();
					if (loaders) mermaid.registerLayoutLoaders(loaders);
				} catch (err) {
					console.warn(
						"[Wonder] ELK layout failed to load; rendering without it.",
						err,
					);
				}
			}
			return mermaid;
		} catch (err) {
			console.warn(
				`[Wonder] Failed to load CDN Mermaid "${cached.version}", falling back to built-in.`,
				err,
			);
			return (await loadMermaid()) as MermaidAPI;
		}
	})();

	mermaidCache[key] = built;
	return built;
}

// Drop the in-memory instance cache (e.g. after the disk cache is cleared so the
// next render falls back to built-in instead of a stale CDN instance).
export function resetMermaidCache(): void {
	mermaidCache = {};
}
