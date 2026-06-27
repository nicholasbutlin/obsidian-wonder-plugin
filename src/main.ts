import {
	Editor,
	FileSystemAdapter,
	Platform,
	Plugin,
	TFile,
	TFolder,
} from "obsidian";
import { WonderSettings } from "./settings";
import { WonderSettingTab } from "./adapters/obsidian/settings-tab";
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
import { MermaidUi } from "./adapters/obsidian/mermaid-ui";
import { FrontmatterToggle } from "./adapters/obsidian/frontmatter-toggle";
import {
	MERMAID_VIEW_TYPE,
	MermaidEditorView,
} from "./adapters/obsidian/views/mermaid-editor.view";
import {
	MERMAID_FILE_EXTENSIONS,
	MERMAID_FILE_VIEW_TYPE,
	MermaidFileView,
} from "./adapters/obsidian/views/mermaid-file.view";

// The plugin's composition root: build the adapters and application services,
// then register Obsidian's surfaces (views, commands, ribbon, menus, events)
// and delegate to the services. Feature logic lives in app/ and adapters/.
export default class WonderPlugin extends Plugin {
	// Assigned in onload(), Obsidian's async lifecycle entry point, so the
	// constructor cannot initialize them.
	settings!: WonderSettings;
	settingsStore!: SettingsStore<WonderSettings>;
	scanRouter!: ScanRouterService;
	refreshContext!: RefreshContextService;
	private mermaidEngine!: ObsidianMermaidEngine;
	private frontmatterToggle!: FrontmatterToggle;

	async onload() {
		this.settingsStore = await ObsidianSettingsStore.load(this);
		this.settings = this.settingsStore.get();

		this.mermaidEngine = new ObsidianMermaidEngine(
			this.app,
			this.manifest,
			this.settingsStore,
		);
		const mermaidUi = new MermaidUi(this.app);

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

		this.registerView(MERMAID_VIEW_TYPE, (leaf) => new MermaidEditorView(leaf));
		// Standalone .mermaid/.mmd files open in their own diagram editor.
		this.registerView(
			MERMAID_FILE_VIEW_TYPE,
			(leaf) => new MermaidFileView(leaf, this.mermaidEngine),
		);
		this.registerExtensions(MERMAID_FILE_EXTENSIONS, MERMAID_FILE_VIEW_TYPE);

		this.addRibbonIcon(
			"git-fork",
			"Open Mermaid editor",
			() => void mermaidUi.openEditor(),
		);
		this.addCommand({
			id: "open-mermaid-editor",
			name: "Open Mermaid editor",
			callback: () => void mermaidUi.openEditor(),
		});
		this.addCommand({
			id: "edit-mermaid-block",
			name: "Edit Mermaid block at cursor",
			editorCallback: (editor) => mermaidUi.editBlockAtCursor(editor),
		});
		this.addCommand({
			id: "new-mermaid-file",
			name: "Create new Mermaid file",
			callback: () => void mermaidUi.createMermaidFile(),
		});

		// Frontmatter visibility toggle (folded in from the standalone plugin):
		// a body class drives the CSS, with a ribbon icon, a command, and an inline
		// button under each note title that all stay in sync.
		const frontmatterToggle = new FrontmatterToggle(
			this.app,
			this.settingsStore,
		);
		this.frontmatterToggle = frontmatterToggle;
		frontmatterToggle.applyState();
		frontmatterToggle.setRibbon(
			this.addRibbonIcon(
				frontmatterToggle.icon(),
				frontmatterToggle.label(),
				() => void frontmatterToggle.toggle(),
			),
		);
		this.addCommand({
			id: "toggle-frontmatter-visibility",
			name: "Toggle frontmatter visibility",
			callback: () => void frontmatterToggle.toggle(),
		});
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () =>
				frontmatterToggle.scheduleRefresh(),
			),
		);
		this.registerEvent(
			this.app.workspace.on("layout-change", () =>
				frontmatterToggle.scheduleRefresh(),
			),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () =>
				frontmatterToggle.scheduleRefresh(),
			),
		);
		this.registerEvent(
			this.app.workspace.on("css-change", () =>
				frontmatterToggle.scheduleRefresh(),
			),
		);
		this.app.workspace.onLayoutReady(() =>
			frontmatterToggle.refreshInlineButtons(),
		);
		this.registerInterval(
			window.setInterval(() => frontmatterToggle.refreshInlineButtons(), 2000),
		);

		// Add an edit button + pan/zoom overlay to every rendered diagram. A
		// MutationObserver (not a markdown post-processor) is used because Obsidian
		// renders Mermaid asynchronously, after post-processors have run, so a
		// post-processor frequently sees no `.mermaid` element yet.
		if (this.settings.mermaidDiagramTools) {
			this.app.workspace.onLayoutReady(() =>
				this.register(mermaidUi.startDecoration()),
			);
			// Separately, a post-processor stamps each mermaid block's source line
			// onto its element. getSectionInfo is reliable here even though the SVG
			// isn't rendered yet, so the edit button can bind to the exact block.
			this.registerMarkdownPostProcessor((el, ctx) =>
				mermaidUi.stampMermaidLine(el, ctx),
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
						.onClick(() => void mermaidUi.createMermaidFile(folder)),
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
		this.addSettingTab(
			new WonderSettingTab(
				this.app,
				this,
				this.settingsStore,
				this.mermaidEngine,
				this.frontmatterToggle,
			),
		);
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
		this.frontmatterToggle.cleanup();
	}

	// Open (or reveal) the Wonder Git panel as a tab in the main editor pane,
	// optionally focused on a file's history. The side-by-side diff wants the
	// width, so it lives in the main area rather than the sidebar.
	private async openGitView(file?: TFile): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(GIT_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: GIT_VIEW_TYPE, active: true });
		}
		await workspace.revealLeaf(leaf);
		const view = leaf.view;
		if (file && view instanceof GitView) await view.showFile(file);
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
