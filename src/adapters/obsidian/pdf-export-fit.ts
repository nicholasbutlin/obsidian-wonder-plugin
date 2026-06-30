import { setIcon } from "obsidian";
import type { SettingsStore } from "../../ports/settings-store";
import type { WonderSettings } from "../../settings";

const BODY_CLASS = "wonder-pdf-export-fit";
const RIBBON_CLASS = "wonder-pdf-export-fit-ribbon";
const MERMAID_CLASS = "wonder-pdf-export-fit-mermaid";
const MERMAID_SVG_CLASS = "wonder-pdf-export-fit-mermaid-svg";
const PAGE_STYLE_ID = "wonder-pdf-export-fit-page-style";
const FIT_DEBOUNCE_MS = 80;

const MERMAID_CONTAINER_SELECTOR = [
	".markdown-rendered .mermaid",
	".markdown-rendered .block-language-mermaid",
	".markdown-preview-view .mermaid",
	".markdown-preview-view .block-language-mermaid",
].join(",");

const MERMAID_SVG_SELECTOR = [
	".markdown-rendered .mermaid svg",
	".markdown-rendered .block-language-mermaid svg",
	".markdown-preview-view .mermaid svg",
	".markdown-preview-view .block-language-mermaid svg",
].join(",");

export class PdfExportFit {
	private ribbonEl: HTMLElement | null = null;
	private fitTimer: ReturnType<typeof setTimeout> | null = null;
	private observer: MutationObserver | null = null;
	private pageStyleEl: HTMLStyleElement | null = null;

	constructor(private settings: SettingsStore<WonderSettings>) {}

	icon(): string {
		return this.enabled ? "file-check" : "file-x";
	}

	label(): string {
		return this.enabled ? "Disable PDF export fit" : "Enable PDF export fit";
	}

	setRibbon(el: HTMLElement): void {
		this.ribbonEl = el;
		el.addClass(RIBBON_CLASS);
		this.updateRibbon();
	}

	installPageStyle(): void {
		if (!this.pageStyleEl) {
			this.pageStyleEl = document.createElement("style");
			this.pageStyleEl.id = PAGE_STYLE_ID;
			document.head.appendChild(this.pageStyleEl);
		}

		if (!this.enabled) {
			this.pageStyleEl.textContent = "";
			return;
		}

		const margin = clampNumber(this.current.pdfExportFitPageMarginMm, 0, 25, 5);
		this.pageStyleEl.textContent = [
			"@media print {",
			`  @page { margin: ${margin}mm; }`,
			"}",
		].join("\n");
	}

	applyState(): void {
		document.body.classList.toggle(BODY_CLASS, this.enabled);
		document.body.style.setProperty(
			"--wonder-pdf-export-fit-mermaid-max-height",
			`${this.current.pdfExportFitMaxMermaidHeightMm}mm`,
		);
		this.updateRibbon();
	}

	async toggle(): Promise<void> {
		await this.setEnabled(!this.enabled);
	}

	async setEnabled(value: boolean): Promise<void> {
		await this.settings.update((s) => {
			s.pdfExportFitEnabled = value;
		});
		this.syncDomState();
	}

	async setPageMarginMm(value: unknown): Promise<void> {
		await this.settings.update((s) => {
			s.pdfExportFitPageMarginMm = clampNumber(value, 0, 25, 5);
		});
		this.syncDomState();
	}

	async setMaxMermaidHeightMm(value: unknown): Promise<void> {
		await this.settings.update((s) => {
			s.pdfExportFitMaxMermaidHeightMm = clampNumber(value, 80, 270, 242);
		});
		this.syncDomState();
	}

	startObserver(): void {
		if (this.observer) return;
		this.observer = new MutationObserver(() => this.scheduleFit());
		this.observer.observe(document.body, { childList: true, subtree: true });
	}

	scheduleFit(): void {
		if (this.fitTimer) clearTimeout(this.fitTimer);
		this.fitTimer = setTimeout(
			() => this.fitRenderedDiagrams(),
			FIT_DEBOUNCE_MS,
		);
	}

	fitRenderedDiagrams(): void {
		if (!this.enabled) return;

		document
			.querySelectorAll<HTMLElement>(MERMAID_CONTAINER_SELECTOR)
			.forEach((el) => el.classList.add(MERMAID_CLASS));

		document
			.querySelectorAll<SVGSVGElement>(MERMAID_SVG_SELECTOR)
			.forEach((svg) => {
				const size = intrinsicSvgSize(svg);
				if (!size.width || !size.height) return;

				const containerWidth = nearestContentWidth(svg);
				const maxHeightPx = mmToCssPx(
					this.current.pdfExportFitMaxMermaidHeightMm,
				);
				const widthScale = containerWidth ? containerWidth / size.width : 1;
				const heightScale = maxHeightPx ? maxHeightPx / size.height : 1;
				const scale = Math.min(1, widthScale, heightScale);
				const fittedWidth = Math.max(1, Math.floor(size.width * scale));

				svg.classList.add(MERMAID_SVG_CLASS);
				svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
				svg.setAttribute("data-wonder-pdf-export-fit", "true");
				svg.style.setProperty(
					"--wonder-pdf-export-fit-svg-width",
					`${fittedWidth}px`,
				);
			});
	}

	cleanup(): void {
		if (this.fitTimer) clearTimeout(this.fitTimer);
		this.observer?.disconnect();
		this.observer = null;
		document.body.classList.remove(BODY_CLASS);
		document.body.style.removeProperty(
			"--wonder-pdf-export-fit-mermaid-max-height",
		);
		document
			.querySelectorAll("." + MERMAID_CLASS)
			.forEach((el) => el.classList.remove(MERMAID_CLASS));
		document
			.querySelectorAll<SVGSVGElement>("." + MERMAID_SVG_CLASS)
			.forEach((svg) => {
				svg.classList.remove(MERMAID_SVG_CLASS);
				svg.style.removeProperty("--wonder-pdf-export-fit-svg-width");
				svg.removeAttribute("data-wonder-pdf-export-fit");
			});
		this.pageStyleEl?.remove();
		this.pageStyleEl = null;
	}

	private get current(): WonderSettings {
		return this.settings.get();
	}

	private get enabled(): boolean {
		return this.current.pdfExportFitEnabled;
	}

	private syncDomState(): void {
		this.installPageStyle();
		this.applyState();
		this.fitRenderedDiagrams();
	}

	private updateRibbon(): void {
		if (!this.ribbonEl) return;
		setIcon(this.ribbonEl, this.icon());
		this.ribbonEl.setAttribute("aria-label", this.label());
	}
}

function intrinsicSvgSize(svg: SVGSVGElement): {
	width: number;
	height: number;
} {
	const viewBox = svg.getAttribute("viewBox");
	if (viewBox) {
		const parts = viewBox
			.trim()
			.split(/[\s,]+/)
			.map((part) => Number(part));
		if (parts.length === 4 && parts.every((part) => Number.isFinite(part))) {
			return { width: Math.abs(parts[2]), height: Math.abs(parts[3]) };
		}
	}

	const attrWidth = numericSvgLength(svg.getAttribute("width"));
	const attrHeight = numericSvgLength(svg.getAttribute("height"));
	if (attrWidth && attrHeight) {
		return { width: attrWidth, height: attrHeight };
	}

	try {
		const bbox = svg.getBBox();
		if (bbox.width && bbox.height) {
			return { width: bbox.width, height: bbox.height };
		}
	} catch (_error) {
		// getBBox can fail while the element is detached or hidden.
	}

	const rect = svg.getBoundingClientRect();
	return { width: rect.width || 0, height: rect.height || 0 };
}

function numericSvgLength(value: string | null): number | null {
	if (!value || value.includes("%")) return null;
	const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(?:px)?$/);
	return match ? Number(match[1]) : null;
}

function nearestContentWidth(el: Element): number | null {
	const container = el.closest(
		".markdown-preview-section, .markdown-preview-view, .markdown-rendered",
	);
	if (container instanceof HTMLElement && container.clientWidth) {
		return container.clientWidth;
	}
	if (el.parentElement?.clientWidth) return el.parentElement.clientWidth;
	return null;
}

function mmToCssPx(mm: number): number | null {
	const n = Number(mm);
	if (!Number.isFinite(n) || n <= 0) return null;
	return (n * 96) / 25.4;
}

function clampNumber(
	value: unknown,
	min: number,
	max: number,
	fallback: number,
): number {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}
