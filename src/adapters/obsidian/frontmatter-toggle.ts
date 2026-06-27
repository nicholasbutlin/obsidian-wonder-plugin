import { App, MarkdownView, setIcon } from "obsidian";
import type { SettingsStore } from "../../ports/settings-store";
import type { WonderSettings } from "../../settings";

// Toggling frontmatter visibility is CSS-driven: a `show-frontmatter` class on
// <body> flips three rules in styles.css that hide the Properties block and the
// raw YAML lines. A per-note override stays possible via `cssclasses:
// show-frontmatter` (the CSS also checks the view container), so the class name
// is a user-facing contract and must not change.
const BODY_CLASS = "show-frontmatter";
const INLINE_BTN_CLASS = "wonder-frontmatter-toggle";
const REFRESH_DEBOUNCE_MS = 50;

// Obsidian controller for the frontmatter toggle: owns the body class, the
// ribbon icon, and the inline button injected under each note title. Folded in
// from the standalone Frontmatter Toggle plugin.
export class FrontmatterToggle {
	private ribbonEl: HTMLElement | null = null;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private app: App,
		private settings: SettingsStore<WonderSettings>,
	) {}

	private get shown(): boolean {
		return this.settings.get().showFrontmatter;
	}

	icon(): string {
		return this.shown ? "eye" : "eye-off";
	}

	label(): string {
		return this.shown ? "Hide frontmatter" : "Show frontmatter";
	}

	// Reflect the persisted state on <body>. Call once on load.
	applyState(): void {
		document.body.classList.toggle(BODY_CLASS, this.shown);
	}

	// Adopt the ribbon element the plugin created, so its icon/label can track
	// the state.
	setRibbon(el: HTMLElement): void {
		this.ribbonEl = el;
		el.addClass("wonder-frontmatter-toggle-ribbon");
		this.updateRibbon();
	}

	async toggle(): Promise<void> {
		await this.settings.update((s) => {
			s.showFrontmatter = !s.showFrontmatter;
		});
		this.applyState();
		this.updateRibbon();
		this.updateAllInlineButtons();
	}

	// Debounced re-injection after view changes; cheap enough to also run on a
	// safety-net interval (Obsidian rebuilds note DOM on mode switches).
	scheduleRefresh(): void {
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this.refreshTimer = setTimeout(
			() => this.refreshInlineButtons(),
			REFRESH_DEBOUNCE_MS,
		);
	}

	refreshInlineButtons(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView) this.injectInto(view);
		}
	}

	cleanup(): void {
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		document.body.classList.remove(BODY_CLASS);
		document
			.querySelectorAll("." + INLINE_BTN_CLASS)
			.forEach((el) => el.remove());
	}

	private updateRibbon(): void {
		if (!this.ribbonEl) return;
		setIcon(this.ribbonEl, this.icon());
		this.ribbonEl.setAttribute("aria-label", this.label());
	}

	private injectInto(view: MarkdownView): void {
		view.containerEl
			.querySelectorAll<HTMLElement>(".inline-title")
			.forEach((titleEl) => {
				const parent = titleEl.parentElement;
				if (!parent) return;
				// Don't rely on nextElementSibling: Obsidian renders the Properties
				// block right after the title and re-creates it whenever metadata
				// changes, which displaces our button. Trusting adjacency made every
				// refresh tick inject a fresh button, stacking duplicates. Instead,
				// find any existing button in the title's container, reuse the first,
				// and drop the rest.
				const existing = Array.from(parent.children).filter(
					(el): el is HTMLElement =>
						el instanceof HTMLElement &&
						el.classList.contains(INLINE_BTN_CLASS),
				);
				if (existing.length > 0) {
					const [keep, ...extras] = existing;
					extras.forEach((el) => el.remove());
					if (titleEl.nextElementSibling !== keep) titleEl.after(keep);
					this.updateButton(keep);
					return;
				}
				titleEl.after(this.makeButton());
			});
	}

	private makeButton(): HTMLElement {
		const btn = document.createElement("button");
		btn.className = INLINE_BTN_CLASS;
		btn.type = "button";
		this.buildButtonChildren(btn);
		this.updateButton(btn);
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			void this.toggle();
		});
		return btn;
	}

	private buildButtonChildren(btn: HTMLElement): void {
		const icon = btn.createSpan({ cls: `${INLINE_BTN_CLASS}__icon` });
		setIcon(icon, this.icon());
		btn.createSpan({ cls: `${INLINE_BTN_CLASS}__label`, text: this.label() });
	}

	private updateButton(btn: HTMLElement): void {
		let icon = btn.querySelector<HTMLElement>(`.${INLINE_BTN_CLASS}__icon`);
		let label = btn.querySelector<HTMLElement>(`.${INLINE_BTN_CLASS}__label`);
		// Defensive: rebuild children if an older injection lacked them.
		if (!icon || !label) {
			btn.textContent = "";
			this.buildButtonChildren(btn);
			icon = btn.querySelector<HTMLElement>(`.${INLINE_BTN_CLASS}__icon`);
			label = btn.querySelector<HTMLElement>(`.${INLINE_BTN_CLASS}__label`);
		}
		if (icon) setIcon(icon, this.icon());
		if (label) label.textContent = this.label();
		btn.setAttribute("aria-pressed", String(this.shown));
	}

	private updateAllInlineButtons(): void {
		document
			.querySelectorAll<HTMLElement>("." + INLINE_BTN_CLASS)
			.forEach((btn) => this.updateButton(btn));
	}
}
