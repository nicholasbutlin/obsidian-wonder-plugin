import {
	App,
	Editor,
	MarkdownPostProcessorContext,
	MarkdownView,
	Notice,
	TFile,
	TFolder,
} from "obsidian";
import {
	findAllMermaidBlocks,
	findMermaidBlockAt,
	isMermaidFenceLine,
} from "../../core/mermaid/block";
import { decorateDiagram } from "./mermaid-overlay";
import {
	MERMAID_VIEW_TYPE,
	MermaidEditorView,
} from "./views/mermaid-editor.view";
import { MERMAID_FILE_EXTENSIONS } from "./views/mermaid-file.view";

// Obsidian-side controller for the in-note Mermaid editing experience: opening
// the side-panel editor, decorating rendered diagrams with the edit/zoom
// overlay, and resolving a clicked or cursor diagram back to its source block.
// This is the fragile CodeMirror/DOM glue, isolated from the composition root.
export class MermaidUi {
	constructor(private app: App) {}

	// Open (or reveal) the Mermaid editor in the right sidebar.
	async openEditor(seed?: {
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
	editBlockAtCursor(editor: Editor): void {
		const file = this.app.workspace.getActiveFile();
		if (!file) return;
		const line = editor.getCursor().line;
		const block = findMermaidBlockAt(editor.getValue(), line);
		if (!block) {
			new Notice("Wonder: no Mermaid block at the cursor.");
			return;
		}
		void this.openEditor({
			source: block.body,
			file,
			anchorLine: block.startLine,
		});
	}

	// Watch the DOM for rendered Mermaid diagrams (reading view and Live Preview)
	// and attach the edit + pan/zoom overlay to each. Obsidian adds these nodes
	// asynchronously, so an observer catches them reliably where a post-processor
	// would race the render. Returns a disposer for the caller to register.
	startDecoration(): () => void {
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

		// Decorate anything already on screen at startup.
		document
			.querySelectorAll<HTMLElement>(".mermaid")
			.forEach((el) => decorate(el));

		return () => observer.disconnect();
	}

	// Stamp a mermaid code block's source line onto its rendered element, so the
	// edit button binds to the exact block. getSectionInfo gives the block's line
	// range reliably (even before the SVG renders); we confirm it's a mermaid
	// block by checking its opening fence in the document text.
	stampMermaidLine(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		const info = ctx.getSectionInfo(el);
		if (!info) return;
		const lines = info.text.split("\n");
		if (!isMermaidFenceLine(lines[info.lineStart] ?? "")) return;
		el.dataset.wonderMermaidLine = String(info.lineStart);
	}

	// Create a new, empty .mermaid file and open it. Defaults to the active file's
	// folder when invoked from a command.
	async createMermaidFile(folder?: TFolder): Promise<void> {
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
			await this.openEditor({
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
}
