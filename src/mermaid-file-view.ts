import { TextFileView, WorkspaceLeaf, setIcon } from "obsidian";
import WonderPlugin from "./main";
import { createMermaidId } from "./mermaid-loader";

export const MERMAID_FILE_VIEW_TYPE = "wonder-mermaid-file";
export const MERMAID_FILE_EXTENSIONS = ["mermaid", "mmd"];

// A first-class editor for standalone `.mermaid`/`.mmd` files: a source pane and
// a rendered preview, toggled via a header action. Renders through the Wonder
// Mermaid loader (the downloaded CDN version, or built-in). Inspired by the
// Mermaid View plugin.
export class MermaidFileView extends TextFileView {
	private plugin: WonderPlugin;
	private sourceEl!: HTMLTextAreaElement;
	private previewEl!: HTMLElement;
	private mode: "preview" | "source" = "preview";
	private renderTimer: ReturnType<typeof setTimeout> | null = null;
	private renderSeq = 0;

	constructor(leaf: WorkspaceLeaf, plugin: WonderPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return MERMAID_FILE_VIEW_TYPE;
	}

	getIcon(): string {
		return "git-fork";
	}

	getViewData(): string {
		return this.data;
	}

	setViewData(data: string, _clear: boolean): void {
		this.data = data;
		if (this.sourceEl) this.sourceEl.value = data;
		if (this.mode === "preview") this.scheduleRender();
	}

	clear(): void {
		this.data = "";
		if (this.sourceEl) this.sourceEl.value = "";
		this.previewEl?.empty();
	}

	protected async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("wonder-mermaid-file");

		this.sourceEl = root.createEl("textarea", {
			cls: "wonder-mermaid-source",
			attr: { spellcheck: "false" },
		});
		this.sourceEl.value = this.data;
		this.sourceEl.addEventListener("input", () => {
			this.data = this.sourceEl.value;
			this.requestSave();
		});

		this.previewEl = root.createDiv({ cls: "wonder-mermaid-preview" });

		this.addAction("eye", "Toggle source / preview", () => this.toggleMode());
		this.setMode("preview");
	}

	protected async onClose(): Promise<void> {
		if (this.renderTimer) clearTimeout(this.renderTimer);
	}

	private toggleMode(): void {
		this.setMode(this.mode === "preview" ? "source" : "preview");
	}

	private setMode(mode: "preview" | "source"): void {
		this.mode = mode;
		this.sourceEl.toggle(mode === "source");
		this.previewEl.toggle(mode === "preview");
		const action = this.containerEl.querySelector<HTMLElement>(
			'.view-action[aria-label^="Toggle"]',
		);
		if (action) {
			action.empty();
			setIcon(action, mode === "preview" ? "code" : "eye");
		}
		if (mode === "preview") this.scheduleRender();
		else this.sourceEl.focus();
	}

	private scheduleRender(): void {
		if (this.renderTimer) clearTimeout(this.renderTimer);
		this.renderTimer = setTimeout(() => void this.render(), 300);
	}

	private async render(): Promise<void> {
		const source = (this.data ?? "").trim();
		const seq = ++this.renderSeq;
		this.previewEl.empty();
		if (!source) {
			this.previewEl.createDiv({
				cls: "wonder-mermaid-empty",
				text: "Empty diagram — switch to source mode to add content.",
			});
			return;
		}
		try {
			const mermaid = await this.plugin.getMermaidInstance();
			const { svg } = await mermaid.render(createMermaidId("wonder-mmd"), source);
			if (seq !== this.renderSeq) return;
			const doc = new DOMParser().parseFromString(
				`<body>${svg}</body>`,
				"text/html",
			);
			const svgEl = doc.querySelector("svg");
			if (!svgEl) throw new Error("No SVG element in Mermaid output.");
			this.previewEl.replaceChildren(document.adoptNode(svgEl));
		} catch (err) {
			if (seq !== this.renderSeq) return;
			this.previewEl.empty();
			const pre = this.previewEl.createEl("pre", {
				cls: "wonder-mermaid-error",
			});
			pre.textContent = `Error rendering Mermaid diagram:\n${
				err instanceof Error ? err.message : String(err)
			}`;
		}
	}
}
