import { loadMermaid, requestUrl } from "obsidian";

// Loads Mermaid for the Wonder plugin. Unlike the bundled approach, we never
// ship Mermaid in main.js: a chosen version is fetched from the jsDelivr CDN
// (on explicit user action), cached to disk, and imported at runtime via a blob
// URL. When nothing is cached we fall back to Obsidian's own built-in Mermaid,
// so the plugin is fully functional offline — it just renders with the built-in
// version until the user downloads a newer one.

export interface MermaidAPI {
	initialize(config: Record<string, unknown>): void;
	render(
		id: string,
		definition: string,
	): Promise<{ svg: string; bindFunctions?: (el: Element) => void }>;
	registerLayoutLoaders(loaders: unknown[]): void;
}

// Pure: the Mermaid initialize() config derived from the user's toggles.
export function getMermaidConfig(
	useObsidianTheme = true,
	useElk = true,
	useHandDrawn = false,
): Record<string, unknown> {
	return {
		startOnLoad: false,
		securityLevel: "strict",
		...(useElk ? { layout: "elk" } : {}),
		...(useHandDrawn ? { look: "handDrawn" } : {}),
		...(useObsidianTheme
			? {}
			: {
					theme: "default",
					themeVariables: {
						textColor: "var(--text-normal)",
						fontFamily: "var(--font-mermaid)",
					},
				}),
		flowchart: { useMaxWidth: false },
		sequence: { useMaxWidth: false },
		journey: { useMaxWidth: true },
		class: { useMaxWidth: true },
		git: { useMaxWidth: false },
		state: { useMaxWidth: true },
		er: { useMaxWidth: false },
		pie: { useMaxWidth: true },
		mindmap: { useMaxWidth: false },
		gantt: {
			// cspell:ignore gantt
			useMaxWidth: true,
			axisFormatter: [["%Y-%m-%d", (e: Date) => e.getDay() === 1]],
		},
	};
}

// What we persist between sessions so a downloaded version survives a reload.
export interface MermaidCdnCache {
	version: string;
	source: string;
	// The ELK layout loader bundle (jsDelivr /+esm, deps inlined). Optional: ELK
	// is best-effort and the diagram still renders without it.
	elk?: string;
}

export interface MermaidDiskCache {
	read(): Promise<MermaidCdnCache | null>;
	write(value: MermaidCdnCache): Promise<void>;
}

// Pure: the CDN directory for a Mermaid version ("latest" or e.g. "11.15.0").
export function cdnBaseUrl(version: string): string {
	return version === "latest"
		? "https://cdn.jsdelivr.net/npm/mermaid/dist/"
		: `https://cdn.jsdelivr.net/npm/mermaid@${version}/dist/`;
}

// Pure: rewrite Mermaid's relative chunk imports to absolute CDN URLs so the
// source can be imported from a blob URL (which has no base to resolve against).
export function rewriteChunkImports(source: string, baseUrl: string): string {
	return source.replace(
		/(['"])(\.\/[^'"]+)\1/g,
		(_, q: string, path: string) => `${q}${baseUrl}${path.slice(2)}${q}`,
	);
}

export async function fetchMermaidSource(version: string): Promise<string> {
	const baseUrl = cdnBaseUrl(version);
	const response = await requestUrl(`${baseUrl}mermaid.esm.min.mjs`);
	return rewriteChunkImports(response.text, baseUrl);
}

// The ELK loader, as a self-contained ESM bundle (elkjs inlined by jsDelivr).
const ELK_ESM_URL = "https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk/+esm";

export async function fetchElkSource(): Promise<string> {
	const response = await requestUrl(ELK_ESM_URL);
	return response.text;
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
			if (useElk && cached.elk) {
				try {
					const elkMod = await importFromSource(cached.elk);
					const loaders = (elkMod.default ?? elkMod) as unknown[];
					mermaid.registerLayoutLoaders(loaders);
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

export function createMermaidId(prefix = "mermaid"): string {
	return `${prefix}-${crypto.randomUUID()}`;
}
