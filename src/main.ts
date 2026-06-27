import {
	Editor,
	FileSystemAdapter,
	MarkdownPostProcessorContext,
	MarkdownView,
	Notice,
	Platform,
	Plugin,
	TFile,
	TFolder,
} from "obsidian";
import { WonderSettings, WonderSettingTab } from "./settings";
import { ObsidianVault } from "./adapters/obsidian/vault.adapter";
import { ObsidianNotifier } from "./adapters/obsidian/notifier.adapter";
import { ObsidianMetadata } from "./adapters/obsidian/metadata.adapter";
import { ObsidianScheduler } from "./adapters/obsidian/scheduler.adapter";
import { ObsidianWorkspace } from "./adapters/obsidian/workspace.adapter";
import { ObsidianSettingsStore } from "./adapters/obsidian/settings-store.adapter";
import { ActionCaptureService } from "./app/actions/action-capture.service";
import { DateNormalizeService } from "./app/dates/date-normalize.service";
import { RefreshContextService } from "./app/context/refresh-context.service";
import { ScanRouterService } from "./app/scan-router.service";
import { GitCli } from "./adapters/node/git-cli.adapter";
import { GitFileHistoryService } from "./app/git/file-history.service";
import { GitRepoCommitsService } from "./app/git/repo-commits.service";
import { GIT_VIEW_TYPE, GitView } from "./adapters/obsidian/views/git.view";
import type { SettingsStore } from "./ports/settings-store";
import { ObsidianMermaidEngine } from "./adapters/obsidian/mermaid-engine.adapter";
import type { MermaidAPI } from "./core/mermaid/config";
import { MERMAID_VIEW_TYPE, MermaidEditorView } from "./mermaid-view";
import {
	findAllMermaidBlocks,
	findMermaidBlockAt,
	isMermaidFenceLine,
} from "./core/mermaid/block";
import { decorateDiagram } from "./mermaid-overlay";
import {
	MERMAID_FILE_EXTENSIONS,
	MERMAID_FILE_VIEW_TYPE,
	MermaidFileView,
} from "./mermaid-file-view";

// This is the main plugin class
export default class WonderPlugin extends Plugin {
	// Assigned in onload(), Obsidian's async lifecycle entry point, so the
	// constructor cannot initialize them.
	settings!: WonderSettings;
	settingsStore!: SettingsStore<WonderSettings>;
	scanRouter!: ScanRouterService;
	refreshContext!: RefreshContextService;
	private mermaidEngine!: ObsidianMermaidEngine;

	async onload() {
		this.settingsStore = await ObsidianSettingsStore.load(this);
		this.settings = this.settingsStore.get();

		this.mermaidEngine = new ObsidianMermaidEngine(
			this.app,
			this.manifest,
			this.settingsStore,
		);

		const vault = new ObsidianVault(this.app);
		const workspace = new ObsidianWorkspace(this.app);
		const metadata = new ObsidianMetadata(this.app);
		const scheduler = new ObsidianScheduler(this);
		const notifier = new ObsidianNotifier();
		const actionCapture = new ActionCaptureService(
			vault,
			notifier,
			this.settingsStore,
		);
		const dateNormalize = new DateNormalizeService(vault, workspace);
		this.scanRouter = new ScanRouterService(
			scheduler,
			metadata,
			this.settingsStore,
			actionCapture,
			dateNormalize,
		);
		this.refreshContext = new RefreshContextService(
			vault,
			workspace,
			notifier,
			this.settingsStore,
		);

		// Git history is desktop-only: it shells out to the git CLI against the
		// vault's filesystem path, which is null on mobile / non-FileSystemAdapter.
		const gitRoot =
			Platform.isDesktopApp &&
			this.app.vault.adapter instanceof FileSystemAdapter
				? this.app.vault.adapter.getBasePath()
				: null;
		const git = new GitCli(gitRoot);
		const gitFileHistory = new GitFileHistoryService(git);
		const gitRepoCommits = new GitRepoCommitsService(git);
		this.registerView(
			GIT_VIEW_TYPE,
			(leaf) => new GitView(leaf, gitFileHistory, gitRepoCommits, git),
		);

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
			// Separately, a post-processor stamps each mermaid block's source line
			// onto its element. getSectionInfo is reliable here even though the SVG
			// isn't rendered yet, so the edit button can bind to the exact block.
			this.registerMarkdownPostProcessor((el, ctx) =>
				this.stampMermaidLine(el, ctx),
			);
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

		this.app.workspace.onLayoutReady(() =>
			this.scanRouter.indexBoards(this.app.vault.getMarkdownFiles()),
		);

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
			this.app.vault.on("modify", (file) => this.scanRouter.scheduleScan(file)),
		);

		this.addCommand({
			id: "refresh-context",
			name: "Refresh Context section",
			callback: () => void this.refreshContext.run(),
		});

		// Git history surfaces (command, ribbon, file menu) only on desktop, where
		// the git CLI is reachable. The view itself shows a graceful empty state if
		// the vault is not a git repository.
		if (git.isAvailable()) {
			this.addRibbonIcon("history", "Open Git history", () =>
				this.openGitView(),
			);
			this.addCommand({
				id: "open-git-history",
				name: "Open Git history",
				callback: () => this.openGitView(),
			});
			this.addCommand({
				id: "show-file-git-history",
				name: "Show Git history for current file",
				checkCallback: (checking) => {
					const file = this.app.workspace.getActiveFile();
					if (!file) return false;
					if (!checking) void this.openGitView(file);
					return true;
				},
			});
			this.registerEvent(
				this.app.workspace.on("file-menu", (menu, file) => {
					if (!(file instanceof TFile) || file.extension !== "md") return;
					menu.addItem((item) =>
						item
							.setTitle("Git history")
							.setIcon("history")
							.onClick(() => void this.openGitView(file)),
					);
				}),
			);
		}

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new WonderSettingTab(this.app, this));
	}

	insertDateHeading(editor: Editor) {
		const date = window.moment().format(this.settings.dateFormat);
		editor.replaceSelection(`# ${date}`);
	}

	onunload() {
		// Pending scan timers are cleared by the scheduler's own teardown, which it
		// registered with the plugin in onload. The Mermaid engine restores the
		// global it took over.
		this.mermaidEngine.reset();
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

	// Open (or reveal) the Wonder Git panel in the right sidebar, optionally
	// focused on a file's history.
	private async openGitView(file?: TFile): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(GIT_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: GIT_VIEW_TYPE, active: true });
		}
		await workspace.revealLeaf(leaf);
		const view = leaf.view;
		if (file && view instanceof GitView) await view.showFile(file);
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
		// A rendered note diagram lives inside a markdown view. Mermaid also
		// appends transient measuring nodes to <body> during render() — decorating
		// those would reparent/observe Mermaid's own scratch DOM and break the
		// render ("Cannot read properties of null"). The ancestor check skips them.
		const inNote = (el: HTMLElement): boolean =>
			!!el.closest(
				".markdown-preview-view, .markdown-reading-view, .markdown-source-view, .cm-editor",
			);

		const decorate = (node: HTMLElement) => {
			try {
				const targets: HTMLElement[] = [];
				if (node.classList?.contains("mermaid")) targets.push(node);
				node
					.querySelectorAll?.<HTMLElement>(".mermaid")
					.forEach((n) => targets.push(n));
				for (const el of targets) {
					if (!inNote(el)) continue;
					decorateDiagram(el, {
						enableZoom: true,
						onEdit: () => this.editDiagramElement(el),
					});
				}
			} catch {
				// Never let decoration throw into the observer / Mermaid's render.
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

	// Stamp a mermaid code block's source line onto its rendered element, so the
	// edit button binds to the exact block. getSectionInfo gives the block's line
	// range reliably (even before the SVG renders); we confirm it's a mermaid
	// block by checking its opening fence in the document text.
	private stampMermaidLine(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): void {
		const info = ctx.getSectionInfo(el);
		if (!info) return;
		const lines = info.text.split("\n");
		if (!isMermaidFenceLine(lines[info.lineStart] ?? "")) return;
		el.dataset.wonderMermaidLine = String(info.lineStart);
	}

	// Open the editor bound to a clicked diagram's source block. The diagram's
	// source line is resolved per view mode, since a rendered SVG has no link back
	// to its source:
	//  - Live Preview / source: ask CodeMirror for the element's document position
	//    (posAtDOM), which is exact even though CM only renders visible widgets.
	//  - Reading view: use the line stamped by the post-processor.
	//  - Last resort: the diagram's position among the note's blocks (reliable
	//    only in reading view, where every block is rendered in order).
	private editDiagramElement(el: HTMLElement): void {
		const view = this.viewForElement(el);
		const file = view?.file ?? this.app.workspace.getActiveFile();
		if (!(file instanceof TFile)) {
			new Notice("Wonder: couldn't find the note for this diagram.");
			return;
		}
		void (async () => {
			const content = await this.app.vault.read(file);
			const line = this.lineFromEditor(view, el) ?? this.lineFromStamp(el);
			let block = line != null ? findMermaidBlockAt(content, line) : null;
			if (!block) {
				const blocks = findAllMermaidBlocks(content);
				block = blocks[this.diagramIndex(el)] ?? blocks[0] ?? null;
			}
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

	// In Live Preview / source mode the diagram is a CodeMirror widget; map its
	// DOM node back to a document line via the editor. Returns null in reading
	// view (no editor) or if the position can't be resolved.
	private lineFromEditor(
		view: MarkdownView | null,
		el: HTMLElement,
	): number | null {
		const cm = (
			view?.editor as unknown as { cm?: { posAtDOM(n: Node): number } }
		)?.cm;
		if (!cm || !view) return null;
		try {
			return view.editor.offsetToPos(cm.posAtDOM(el)).line;
		} catch {
			return null;
		}
	}

	// In reading view, the post-processor stamps each block's source line onto its
	// element (see stampMermaidLine); read the nearest stamped ancestor.
	private lineFromStamp(el: HTMLElement): number | null {
		const stamped = el.closest<HTMLElement>("[data-wonder-mermaid-line]");
		const value = stamped?.dataset.wonderMermaidLine;
		return value != null ? parseInt(value, 10) : null;
	}

	// The markdown view whose container holds this element.
	private viewForElement(el: HTMLElement): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.containerEl.contains(el)) {
				return view;
			}
		}
		return null;
	}

	// This diagram's index among all rendered diagrams in its scroll container,
	// matching document order of the source blocks. Reliable only in reading view.
	private diagramIndex(el: HTMLElement): number {
		const container =
			el.closest(
				".markdown-preview-view, .markdown-reading-view, .view-content",
			) ?? document.body;
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

	// Resolve a ready Mermaid instance for the current settings. Used by both
	// views; delegates to the Mermaid engine adapter.
	getMermaidInstance(): Promise<MermaidAPI> {
		return this.mermaidEngine.getInstance();
	}

	// The CodeMirror editor of the active markdown note, if any. Used by the view
	// to insert a diagram when it isn't bound to an existing block.
	activeMarkdownEditor(): Editor | null {
		return this.app.workspace.getActiveViewOfType(MarkdownView)?.editor ?? null;
	}

	// Install the downloaded Mermaid as the global (or restore the built-in).
	// Delegates to the Mermaid engine adapter; kept here for the settings tab.
	syncMermaidGlobal(): Promise<void> {
		return this.mermaidEngine.syncGlobal();
	}

	async saveSettings() {
		await this.settingsStore.save();
	}
}
