import type { MermaidCdnCache } from "./core/mermaid/config";

// The plugin's settings model and defaults — framework-free data. The settings
// UI lives in adapters/obsidian/settings-tab.

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
	// Show YAML frontmatter / Properties across notes. When false, frontmatter is
	// hidden everywhere except notes with `cssclasses: show-frontmatter`.
	showFrontmatter: boolean;
	// Tighten PDF export margins and fit Mermaid diagrams inside the page.
	pdfExportFitEnabled: boolean;
	pdfExportFitPageMarginMm: number;
	pdfExportFitMaxMermaidHeightMm: number;
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
	showFrontmatter: false,
	pdfExportFitEnabled: true,
	pdfExportFitPageMarginMm: 5,
	pdfExportFitMaxMermaidHeightMm: 242,
};

// The Kanban setting stores a vault-relative name without extension; the file
// on disk is always that name with a `.md` suffix.
export function kanbanPath(kanbanFile: string): string {
	return `${kanbanFile}.md`;
}
