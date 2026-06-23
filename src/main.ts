import {
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	TAbstractFile,
	TFile,
	TFolder,
	loadMermaid,
} from "obsidian";
import { WonderSettings, DEFAULT_SETTINGS, WonderSettingTab } from "./settings";
import { ActionProcessor } from "./action-processor";
import { DateNormalizer } from "./date-bridge";
import { buildContextBlock, upsertContextSection } from "./context-section";
import {
	getMermaid,
	resetMermaidCache,
	type MermaidAPI,
	type MermaidDiskCache,
} from "./mermaid-loader";
import { MERMAID_VIEW_TYPE, MermaidEditorView } from "./mermaid-view";
import {
	findAllMermaidBlocks,
	findMermaidBlockAt,
} from "./mermaid-block";
import { decorateDiagram } from "./mermaid-overlay";
import {
	MERMAID_FILE_EXTENSIONS,
	MERMAID_FILE_VIEW_TYPE,
	MermaidFileView,
} from "./mermaid-file-view";

// Marks a `window.mermaid` we installed, so we know whether to restore Obsidian's
// original on unload and don't re-stash our own as the "original".
const OWNED_BY_WONDER = Symbol("wonder.mermaid.owned");

type WindowWithMermaid = Window & {
	mermaid?: MermaidAPI & { [OWNED_BY_WONDER]?: true };
	obsidian_mermaid?: MermaidAPI;
};

// This is the main plugin class
export default class WonderPlugin extends Plugin {
	// Assigned in onload(), Obsidian's async lifecycle entry point, so the
	// constructor cannot initialize them.
	settings!: WonderSettings;
	actionProcessor!: ActionProcessor;
	dateNormalizer!: DateNormalizer;

	// Pending scans, keyed by file path, so rapid edits to the same file
	// collapse into a single run once editing settles.
	private scanTimers = new Map<string, ReturnType<typeof setTimeout>>();

	// Paths known to be Kanban boards. Seeded at load and updated as files are
	// scanned, so the right debounce can be chosen at schedule time even when a
	// Kanban save has momentarily invalidated the metadata cache.
	private knownBoards = new Set<string>();

	// Disk cache for the downloaded CDN Mermaid, backed by plugin settings so a
	// downloaded version survives reloads.
	readonly mermaidDiskCache: MermaidDiskCache = {
		read: async () => this.settings.mermaidCdnCache,
		write: async (value) => {
			this.settings.mermaidCdnCache = value;
			await this.saveSettings();
		},
	};

	async onload() {
		await this.loadSettings();

		this.actionProcessor = new ActionProcessor(this);
		this.dateNormalizer = new DateNormalizer(this);

		this.registerView(
			MERMAID_VIEW_TYPE,
			(leaf) => new MermaidEditorView(leaf, this),
		);
		// Standalone .mermaid/.mmd files open in their own diagram editor.
		this.registerView(
			MERMAID_FILE_VIEW_TYPE,
			(leaf) => new MermaidFileView(leaf, this),
		);
		this.registerExtensions(MERMAID_FILE_EXTENSIONS, MERMAID_FILE_VIEW_TYPE);

		this.addRibbonIcon("git-fork", "Open Mermaid editor", () =>
			this.openMermaidEditor(),
		);
		this.addCommand({
			id: "open-mermaid-editor",
			name: "Open Mermaid editor",
			callback: () => this.openMermaidEditor(),
		});
		this.addCommand({
			id: "edit-mermaid-block",
			name: "Edit Mermaid block at cursor",
			editorCallback: (editor) => this.editMermaidBlockAtCursor(editor),
		});
		this.addCommand({
			id: "new-mermaid-file",
			name: "Create new Mermaid file",
			callback: () => void this.createMermaidFile(),
		});

		// Add an edit button + pan/zoom overlay to every rendered diagram. A
		// MutationObserver (not a markdown post-processor) is used because Obsidian
		// renders Mermaid asynchronously, after post-processors have run, so a
		// post-processor frequently sees no `.mermaid` element yet.
		if (this.settings.mermaidDiagramTools) {
			this.app.workspace.onLayoutReady(() => this.startDiagramDecoration());
		}

		// "New Mermaid file" in the folder context menu.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				const folder = file instanceof TFolder ? file : file.parent;
				if (!folder) return;
				menu.addItem((item) =>
					item
						.setTitle("New Mermaid file")
						.setIcon("git-fork")
						.onClick(() => void this.createMermaidFile(folder)),
				);
			}),
		);

		// Replace Obsidian's built-in Mermaid with the downloaded version (no-op
		// until a version is downloaded). Deferred to layout-ready so the built-in
		// is available to stash as the fallback.
		this.app.workspace.onLayoutReady(() => void this.syncMermaidGlobal());

		this.app.workspace.onLayoutReady(() => this.indexBoards());

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				menu.addItem((item) =>
					item
						.setTitle("Insert date heading")
						.onClick(() => this.insertDateHeading(editor)),
				);
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => this.scheduleScan(file)),
		);

		this.addCommand({
			id: "refresh-context",
			name: "Refresh Context section",
			callback: () => this.refreshContext(),
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new WonderSettingTab(this.app, this));
	}

	insertDateHeading(editor: Editor) {
		const date = window.moment().format(this.settings.dateFormat);
		editor.replaceSelection(`# ${date}`);
	}

	// Insert or refresh the marked Context section at the bottom of the active
	// note, leaving everything above it untouched.
	async refreshContext() {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Wonder: open a note to refresh its Context section.");
			return;
		}
		const block = buildContextBlock(
			this.settings.contextHeading,
			this.settings.contextQuery,
		);
		await this.app.vault.process(file, (data) =>
			upsertContextSection(data, block),
		);
	}

	onunload() {
		for (const timer of this.scanTimers.values()) {
			clearTimeout(timer);
		}
		this.scanTimers.clear();

		// Hand Mermaid back to Obsidian if we took it over.
		if (typeof window !== "undefined") {
			const win = window as WindowWithMermaid;
			if (win.mermaid?.[OWNED_BY_WONDER] && win.obsidian_mermaid) {
				win.mermaid = win.obsidian_mermaid;
			}
		}
		resetMermaidCache();
	}

	// Open (or reveal) the Mermaid editor in the right sidebar.
	private async openMermaidEditor(seed?: {
		source: string;
		file: TFile;
		anchorLine: number;
	}): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(MERMAID_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: MERMAID_VIEW_TYPE, active: true });
		}
		await workspace.revealLeaf(leaf);
		if (seed) {
			const view = leaf.view;
			if (view instanceof MermaidEditorView) {
				view.setDiagram(seed.source, {
					file: seed.file,
					anchorLine: seed.anchorLine,
				});
			}
		}
	}

	// Open the editor seeded from the `mermaid` block under the cursor, bound so
	// edits can be written back to that block.
	private editMermaidBlockAtCursor(editor: Editor): void {
		const file = this.app.workspace.getActiveFile();
		if (!file) return;
		const line = editor.getCursor().line;
		const block = findMermaidBlockAt(editor.getValue(), line);
		if (!block) {
			new Notice("Wonder: no Mermaid block at the cursor.");
			return;
		}
		void this.openMermaidEditor({
			source: block.body,
			file,
			anchorLine: block.startLine,
		});
	}

	// Watch the DOM for rendered Mermaid diagrams (reading view and Live Preview)
	// and attach the edit + pan/zoom overlay to each. Obsidian adds these nodes
	// asynchronously, so an observer catches them reliably where a post-processor
	// would race the render.
	private startDiagramDecoration(): void {
		const decorate = (node: HTMLElement) => {
			const targets: HTMLElement[] = [];
			if (node.classList?.contains("mermaid")) targets.push(node);
			node.querySelectorAll?.<HTMLElement>(".mermaid").forEach((n) =>
				targets.push(n),
			);
			for (const el of targets) {
				decorateDiagram(el, {
					enableZoom: true,
					onEdit: () => this.editDiagramElement(el),
				});
			}
		};

		const observer = new MutationObserver((mutations) => {
			for (const m of mutations) {
				for (const added of Array.from(m.addedNodes)) {
					if (added instanceof HTMLElement) decorate(added);
				}
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
		this.register(() => observer.disconnect());

		// Decorate anything already on screen at startup.
		document
			.querySelectorAll<HTMLElement>(".mermaid")
			.forEach((el) => decorate(el));
	}

	// Resolve a clicked diagram's source block by its position among the rendered
	// diagrams of its note, then open the editor bound to it. Position mapping is
	// used because a rendered SVG carries no link back to its source lines.
	private editDiagramElement(el: HTMLElement): void {
		const file = this.fileForElement(el) ?? this.app.workspace.getActiveFile();
		if (!(file instanceof TFile)) {
			new Notice("Wonder: couldn't find the note for this diagram.");
			return;
		}
		const index = this.diagramIndex(el);
		void (async () => {
			const content = await this.app.vault.read(file);
			const blocks = findAllMermaidBlocks(content);
			const block = blocks[index] ?? blocks[0];
			if (!block) {
				new Notice("Wonder: couldn't find the diagram source.");
				return;
			}
			await this.openMermaidEditor({
				source: block.body,
				file,
				anchorLine: block.startLine,
			});
		})();
	}

	// The file backing the workspace leaf that contains this element.
	private fileForElement(el: HTMLElement): TFile | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.containerEl.contains(el)) {
				return view.file ?? null;
			}
		}
		return null;
	}

	// This diagram's index among all rendered diagrams in its scroll container,
	// matching document order of the source blocks.
	private diagramIndex(el: HTMLElement): number {
		const container =
			el.closest(".markdown-preview-view, .markdown-source-view, .view-content") ??
			document.body;
		const all = Array.from(container.querySelectorAll<HTMLElement>(".mermaid"));
		const idx = all.indexOf(el);
		return idx < 0 ? 0 : idx;
	}

	// Create a new, empty .mermaid file and open it. Defaults to the active file's
	// folder when invoked from a command.
	private async createMermaidFile(folder?: TFolder): Promise<void> {
		const parent =
			folder ??
			this.app.workspace.getActiveFile()?.parent ??
			this.app.vault.getRoot();
		const ext = MERMAID_FILE_EXTENSIONS[0];
		const base = "Untitled diagram";
		let name = `${base}.${ext}`;
		let n = 1;
		const dir = parent.path === "/" ? "" : `${parent.path}/`;
		while (this.app.vault.getAbstractFileByPath(`${dir}${name}`)) {
			name = `${base} ${n++}.${ext}`;
		}
		const created = await this.app.vault.create(
			`${dir}${name}`,
			"flowchart TD\n  A --> B\n",
		);
		await this.app.workspace.getLeaf(true).openFile(created);
	}

	// The CodeMirror editor of the active markdown note, if any. Used by the view
	// to insert a diagram when it isn't bound to an existing block.
	activeMarkdownEditor(): Editor | null {
		return (
			this.app.workspace.getActiveViewOfType(MarkdownView)?.editor ?? null
		);
	}

	// Install the downloaded Mermaid as `window.mermaid` so every `mermaid` block
	// across Obsidian renders with it. With no download cached this restores the
	// built-in, so the swap is a safe no-op until the user opts in via a download.
	async syncMermaidGlobal(): Promise<void> {
		const win = window as WindowWithMermaid;
		// Stash Obsidian's original exactly once, before we overwrite it.
		if (!win.mermaid?.[OWNED_BY_WONDER]) {
			win.obsidian_mermaid =
				win.mermaid ?? ((await loadMermaid()) as MermaidAPI);
		}
		if (this.settings.mermaidCdnCache) {
			const mermaid = await getMermaid(
				this.mermaidDiskCache,
				this.settings.mermaidUseObsidianTheme,
				this.settings.mermaidUseElk,
				this.settings.mermaidUseHandDrawn,
			);
			const owned = mermaid as MermaidAPI & { [OWNED_BY_WONDER]?: true };
			owned[OWNED_BY_WONDER] = true;
			win.mermaid = owned;
		} else if (win.obsidian_mermaid) {
			// Nothing downloaded (or cache cleared): hand back to the built-in.
			win.mermaid = win.obsidian_mermaid;
			resetMermaidCache();
		}
	}

	// Debounce a modified file's scan so a burst of edits triggers one run once
	// the file settles. The board-vs-note routing is decided when the timer
	// fires, NOT here: a Kanban save invalidates the metadata cache, so at event
	// time `getFileCache` can briefly report no frontmatter and a board would be
	// mis-routed to the action scan. By the time the debounce fires the cache has
	// settled and `isBoardFile` is reliable.
	scheduleScan(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;
		this.debounce(
			file.path,
			() => this.scan(file),
			this.debounceSecondsFor(file),
		);
	}

	// Date reconcile is debounced briefly so a board settles fast; action capture
	// waits longer so it doesn't fire mid-typing. The board check here is
	// best-effort (it only picks the interval); the authoritative routing happens
	// in scan() once the cache has settled.
	private debounceSecondsFor(file: TFile): number {
		const isBoard = this.knownBoards.has(file.path) || this.isBoardFile(file);
		return isBoard
			? this.settings.dateDebounceSeconds
			: this.settings.actionDebounceSeconds;
	}

	// Route a settled file: Kanban board files get their picker dates normalized
	// to the Tasks emoji format; every other note is scanned for @action markers.
	private scan(file: TFile) {
		if (this.isBoardFile(file)) {
			this.knownBoards.add(file.path);
			if (this.settings.normalizeKanbanDates)
				this.dateNormalizer.normalize(file);
		} else {
			this.knownBoards.delete(file.path);
			this.actionProcessor.processActionMarkers(file);
		}
	}

	private indexBoards() {
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.isBoardFile(file)) this.knownBoards.add(file.path);
		}
	}

	private isBoardFile(file: TFile): boolean {
		return (
			this.app.metadataCache.getFileCache(file)?.frontmatter?.[
				"kanban-plugin"
			] === "board"
		);
	}

	private debounce(path: string, fn: () => void, seconds: number) {
		const pending = this.scanTimers.get(path);
		if (pending) {
			clearTimeout(pending);
		}

		this.scanTimers.set(
			path,
			setTimeout(() => {
				this.scanTimers.delete(path);
				fn();
			}, seconds * 1000),
		);
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		// Migrate the old single interval: it governed action capture.
		const legacy = (data as { processRefreshInterval?: number })
			?.processRefreshInterval;
		if (legacy != null && data?.actionDebounceSeconds == null) {
			this.settings.actionDebounceSeconds = legacy;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
