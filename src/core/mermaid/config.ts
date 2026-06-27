// Pure Mermaid configuration and URL helpers — no Obsidian, network, or DOM.
// The runtime loader (fetch, blob import, built-in fallback) lives in the
// adapter that wraps these; everything here is deterministic and unit-tested.

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
}

// Provides Mermaid's ELK layout loaders, or null when unavailable. ELK ships as
// a separate bundled file (elk.js) loaded from disk on demand rather than from a
// CDN, whose code-split render chunk fails to load in Obsidian's blob/CSP context.
export type ElkLoader = () => Promise<unknown[] | null>;

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

export function createMermaidId(prefix = "mermaid"): string {
	return `${prefix}-${crypto.randomUUID()}`;
}
