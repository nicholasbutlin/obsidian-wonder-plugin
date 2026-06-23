import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import WonderPlugin from "./main";
import { createMermaidId, getMermaid } from "./mermaid-loader";
import {
	findFirstMermaidBlock,
	findMermaidBlockAt,
	replaceBlockBody,
} from "./mermaid-block";

export const MERMAID_VIEW_TYPE = "wonder-mermaid-editor";

// Where an editing session's source lives in the vault, so "Write back" knows
// which block in which file to update. Captured at load time against the file's
// then-current text; re-resolved at save time so concurrent edits don't clobber.
interface DiagramSource {
	file: TFile;
	// The line the block was found at, used to re-locate it at save time.
	anchorLine: number;
}

// A side-panel live editor: type Mermaid on the left, see it rendered on the
// right. Can be opened blank (a scratchpad) or seeded from a `mermaid` block in
// the active note, in which case edits can be written back to that block.
export class MermaidEditorView extends ItemView {
	private plugin: WonderPlugin;
	private textarea!: HTMLTextAreaElement;
	private preview!: HTMLElement;
	private source: DiagramSource | null = null;
	private renderTimer: ReturnType<typeof setTimeout> | null = null;
	// Monotonic token so a slow render that resolves after a newer edit is
	// discarded instead of overwriting the fresher preview.
	private renderSeq = 0;

	constructor(leaf: WorkspaceLeaf, plugin: WonderPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return MERMAID_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Mermaid editor";
	}

	getIcon(): string {
		return "git-fork";
	}

	protected async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("wonder-mermaid-editor");

		const toolbar = root.createDiv({ cls: "wonder-mermaid-toolbar" });
		const writeBtn = toolbar.createEl("button", {
			cls: "wonder-mermaid-writeback",
		});
		setIcon(writeBtn.createSpan(), "save");
		writeBtn.createSpan({ text: "Write to note" });
		writeBtn.addEventListener("click", () => void this.writeBack());

		const body = root.createDiv({ cls: "wonder-mermaid-body" });
		this.textarea = body.createEl("textarea", {
			cls: "wonder-mermaid-source",
			attr: { spellcheck: "false", placeholder: "graph TD\n  A --> B" },
		});
		this.preview = body.createDiv({ cls: "wonder-mermaid-preview" });

		this.textarea.addEventListener("input", () => this.scheduleRender());
		this.scheduleRender();
	}

	protected async onClose(): Promise<void> {
		if (this.renderTimer) clearTimeout(this.renderTimer);
	}

	// Seed the editor from arbitrary source, optionally bound to a note block so
	// edits can be written back.
	setDiagram(source: string, binding: DiagramSource | null = null): void {
		this.source = binding;
		if (this.textarea) {
			this.textarea.value = source;
			this.scheduleRender();
		} else {
			// onOpen hasn't run yet; stash the value so it lands once the DOM exists.
			this.pendingValue = source;
		}
	}

	private pendingValue: string | null = null;

	private scheduleRender(): void {
		if (this.pendingValue !== null && this.textarea) {
			this.textarea.value = this.pendingValue;
			this.pendingValue = null;
		}
		if (this.renderTimer) clearTimeout(this.renderTimer);
		this.renderTimer = setTimeout(() => void this.render(), 300);
	}

	private async render(): Promise<void> {
		const source = this.textarea.value.trim();
		const seq = ++this.renderSeq;
		if (!source) {
			this.preview.empty();
			return;
		}
		try {
			const mermaid = await getMermaid(
				this.plugin.mermaidDiskCache,
				this.plugin.settings.mermaidUseObsidianTheme,
				this.plugin.settings.mermaidUseElk,
				this.plugin.settings.mermaidUseHandDrawn,
			);
			const { svg } = await mermaid.render(
				createMermaidId("wonder-mermaid"),
				source,
			);
			if (seq !== this.renderSeq) return; // superseded by a newer edit
			if (!svg?.trim()) throw new Error("Mermaid returned an empty diagram.");
			// Parse as HTML, not XML: Mermaid's DOMPurify pass emits <br> (not
			// <br/>) inside <foreignObject>, which is invalid XML.
			const doc = new DOMParser().parseFromString(
				`<body>${svg}</body>`,
				"text/html",
			);
			const svgEl = doc.querySelector("svg");
			if (!svgEl) throw new Error("No SVG element in Mermaid output.");
			this.preview.replaceChildren(document.adoptNode(svgEl));
		} catch (err) {
			if (seq !== this.renderSeq) return;
			this.preview.empty();
			const pre = this.preview.createEl("pre", {
				cls: "wonder-mermaid-error",
			});
			pre.textContent = `Error rendering Mermaid diagram:\n${
				err instanceof Error ? err.message : String(err)
			}`;
		}
	}

	// Persist the current source back to the originating note block, or — when the
	// editor isn't bound to one — insert it as a new block in the active note.
	private async writeBack(): Promise<void> {
		const source = this.textarea.value.replace(/\s+$/, "");
		if (this.source) {
			const { file, anchorLine } = this.source;
			let located = false;
			await this.plugin.app.vault.process(file, (data) => {
				const block =
					findMermaidBlockAt(data, anchorLine) ??
					findFirstMermaidBlock(data);
				if (!block) return data;
				located = true;
				return replaceBlockBody(data, block, source);
			});
			new Notice(
				located
					? `Wonder: updated Mermaid block in "${file.basename}".`
					: `Wonder: couldn't find the original block in "${file.basename}".`,
			);
			return;
		}
		await this.insertIntoActiveNote(source);
	}

	private async insertIntoActiveNote(source: string): Promise<void> {
		const view = this.plugin.app.workspace.getActiveFile();
		const editor = this.plugin.activeMarkdownEditor();
		if (!view || !editor) {
			new Notice("Wonder: open a note to insert the diagram into.");
			return;
		}
		editor.replaceSelection(`\`\`\`mermaid\n${source}\n\`\`\`\n`);
		new Notice(`Wonder: inserted Mermaid block into "${view.basename}".`);
	}
}
