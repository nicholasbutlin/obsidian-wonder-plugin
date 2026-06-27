import {
	Editor,
	ItemView,
	MarkdownView,
	Notice,
	TFile,
	WorkspaceLeaf,
	setIcon,
} from "obsidian";
import {
	findMermaidBlockAt,
	replaceBlockBody,
} from "../../../core/mermaid/block";
import { SNIPPET_CATEGORIES } from "../../../core/mermaid/snippets";

// A closing fence line: 3+ backticks/tildes, optionally indented, nothing else.
const CLOSING_FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

export const MERMAID_VIEW_TYPE = "wonder-mermaid-editor";

// Which note block this editing session is bound to. The note itself is the live
// preview: as the user types, the bound block is rewritten (debounced) so
// Obsidian re-renders the diagram in place. `anchorLine` is the block's opening
// fence; content above it never changes from here, so it stays valid across
// edits and we re-locate the block from it on every write.
interface DiagramBinding {
	file: TFile;
	anchorLine: number;
}

// A side-panel Mermaid editor: a source box plus a snippet palette. Opened bound
// to a specific `mermaid` block (via the edit button on a rendered diagram, or
// the cursor command); edits stream back to that block so the note is the
// preview. When unbound it acts as a scratchpad with an "Insert into note" action.
export class MermaidEditorView extends ItemView {
	private textarea!: HTMLTextAreaElement;
	private statusEl!: HTMLElement;
	private binding: DiagramBinding | null = null;
	private pendingValue: string | null = null;
	private writeTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return MERMAID_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Mermaid editor";
	}

	getIcon(): string {
		return "pencil";
	}

	protected async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("wonder-mermaid-editor");

		const header = root.createDiv({ cls: "wonder-mermaid-header" });
		this.statusEl = header.createDiv({ cls: "wonder-mermaid-status" });
		const insertBtn = header.createEl("button", {
			cls: "wonder-mermaid-insert",
			text: "Insert into note",
		});
		insertBtn.addEventListener("click", () => void this.insertIntoActiveNote());

		this.textarea = root.createEl("textarea", {
			cls: "wonder-mermaid-source",
			attr: { spellcheck: "false", placeholder: "flowchart TD\n  A --> B" },
		});
		if (this.pendingValue !== null) {
			this.textarea.value = this.pendingValue;
			this.pendingValue = null;
		}
		this.textarea.addEventListener("input", () => this.scheduleWrite());

		this.buildPalette(root);
		this.updateStatus();
	}

	protected async onClose(): Promise<void> {
		if (this.writeTimer) clearTimeout(this.writeTimer);
	}

	// Seed the editor, optionally binding it to a note block. Safe to call before
	// onOpen has built the DOM (the value is stashed and applied on open).
	setDiagram(source: string, binding: DiagramBinding | null = null): void {
		this.binding = binding;
		if (this.textarea) {
			this.textarea.value = source;
			this.updateStatus();
		} else {
			this.pendingValue = source;
		}
	}

	private updateStatus(): void {
		if (!this.statusEl) return;
		this.statusEl.setText(
			this.binding
				? `Editing in ${this.binding.file.basename}`
				: "Scratchpad — not linked to a note",
		);
	}

	private scheduleWrite(): void {
		if (this.writeTimer) clearTimeout(this.writeTimer);
		// Only bound sessions stream to a note; a scratchpad waits for "Insert".
		if (!this.binding) return;
		this.writeTimer = setTimeout(() => void this.writeBack(), 400);
	}

	// Rewrite the bound block with the current source so the note re-renders.
	// Write the edited source back to the bound block. Two things keep the note
	// from jumping to the top while typing:
	//  1. When the note is open, edit it in place via the editor (a localized
	//     replaceRange), not a full vault rewrite — the latter is seen as an
	//     external change and reloads the view.
	//  2. Capture the view's scroll before the write and restore it afterwards
	//     (across a couple of frames), since the diagram re-render can still nudge
	//     the viewport.
	private async writeBack(): Promise<void> {
		if (!this.binding) return;
		const { file, anchorLine } = this.binding;
		const source = this.textarea.value.replace(/\s+$/, "");
		const view = this.markdownViewForFile(file);
		const restoreScroll = this.scrollKeeper(view);

		if (view && this.replaceBodyInEditor(view.editor, anchorLine, source)) {
			restoreScroll();
			return;
		}

		// Fallback (note not open in an editor, or an unusual/unclosed block).
		await this.app.vault.process(file, (data) => {
			const block = findMermaidBlockAt(data, anchorLine);
			if (!block) return data; // block moved/removed; leave the note untouched
			return replaceBlockBody(data, block, source);
		});
		restoreScroll();
	}

	// The markdown view for a file currently open in a leaf, if any.
	private markdownViewForFile(file: TFile): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === file.path) {
				return view;
			}
		}
		return null;
	}

	// Snapshot a view's scroll position and return a function that restores it,
	// re-applying across the next couple of frames so an async re-render can't
	// leave the note scrolled to the top.
	private scrollKeeper(view: MarkdownView | null): () => void {
		const scroller = view?.contentEl.querySelector<HTMLElement>(
			".cm-scroller, .markdown-preview-view",
		);
		if (!scroller) return () => {};
		const { scrollTop, scrollLeft } = scroller;
		return () => {
			const restore = () => {
				scroller.scrollTop = scrollTop;
				scroller.scrollLeft = scrollLeft;
			};
			restore();
			requestAnimationFrame(restore);
			requestAnimationFrame(() => requestAnimationFrame(restore));
		};
	}

	// Replace just the body of the bound block via the editor, leaving the fences
	// (and the rest of the doc) untouched. Returns false for blocks we won't touch
	// surgically (e.g. an unclosed fence), so the caller can fall back.
	private replaceBodyInEditor(
		editor: Editor,
		anchorLine: number,
		source: string,
	): boolean {
		const block = findMermaidBlockAt(editor.getValue(), anchorLine);
		if (!block) return false;
		const closed =
			block.endLine > block.startLine &&
			CLOSING_FENCE.test(editor.getLine(block.endLine));
		if (!closed) return false;
		const from = { line: block.startLine + 1, ch: 0 };
		const to = { line: block.endLine, ch: 0 };
		editor.replaceRange(source === "" ? "" : `${source}\n`, from, to);
		return true;
	}

	private async insertIntoActiveNote(): Promise<void> {
		const source = this.textarea.value.replace(/\s+$/, "");
		if (!source) {
			new Notice("Wonder: nothing to insert.");
			return;
		}
		const file = this.app.workspace.getActiveFile();
		const editor =
			this.app.workspace.getActiveViewOfType(MarkdownView)?.editor ?? null;
		if (!file || !editor) {
			new Notice("Wonder: open a note to insert the diagram into.");
			return;
		}
		editor.replaceSelection(`\`\`\`mermaid\n${source}\n\`\`\`\n`);
		new Notice(`Wonder: inserted Mermaid block into "${file.basename}".`);
	}

	// The snippet palette: collapsible categories of insertable snippets, plus a
	// "scaffold" action per category that drops a full diagram skeleton.
	private buildPalette(root: HTMLElement): void {
		const palette = root.createDiv({ cls: "wonder-mermaid-palette" });
		for (const category of SNIPPET_CATEGORIES) {
			const group = palette.createDiv({ cls: "wonder-mermaid-cat" });
			const head = group.createDiv({ cls: "wonder-mermaid-cat-head" });
			const caret = head.createSpan({ cls: "wonder-mermaid-caret" });
			setIcon(caret, "chevron-right");
			head.createSpan({ text: category.name });

			const items = group.createDiv({ cls: "wonder-mermaid-cat-items" });
			items.hide();
			head.addEventListener("click", () => {
				const open = items.isShown();
				items.toggle(!open);
				setIcon(caret, open ? "chevron-right" : "chevron-down");
			});

			const scaffold = items.createEl("button", {
				cls: "wonder-mermaid-snippet wonder-mermaid-scaffold",
				text: `Insert ${category.name} skeleton`,
			});
			scaffold.addEventListener("click", () =>
				this.insertSnippet(`${category.scaffold}\n`),
			);
			for (const item of category.items) {
				const btn = items.createEl("button", {
					cls: "wonder-mermaid-snippet",
					text: item.label,
				});
				btn.addEventListener("click", () =>
					this.insertSnippet(`${item.snippet}\n`),
				);
			}
		}
	}

	// Insert text at the textarea's cursor, then stream to the note.
	private insertSnippet(text: string): void {
		const ta = this.textarea;
		const start = ta.selectionStart;
		const end = ta.selectionEnd;
		ta.setRangeText(text, start, end, "end");
		ta.focus();
		this.scheduleWrite();
	}
}
