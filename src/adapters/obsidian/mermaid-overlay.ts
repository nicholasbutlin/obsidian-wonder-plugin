import { setIcon } from "obsidian";

// Decorates a rendered Mermaid diagram in a note with a small overlay: an "edit"
// button that opens the side-panel editor bound to this block, and pan/zoom on
// the diagram itself. Adapted from the Mermaid View plugin's pan/zoom handler.

export interface OverlayOptions {
	// Invoked when the edit button is clicked. Omit to hide the button (e.g. when
	// the source block can't be resolved).
	onEdit?: () => void;
	enableZoom: boolean;
}

const PROCESSED = "wonder-mermaid-processed";

// Attach the overlay once the diagram's SVG exists. Mermaid renders
// asynchronously, so we wait briefly for the SVG before wiring pan/zoom.
export function decorateDiagram(
	container: HTMLElement,
	opts: OverlayOptions,
): void {
	if (container.classList.contains(PROCESSED)) return;
	container.classList.add(PROCESSED);
	whenSvgReady(container, (svg) => attach(container, svg, opts));
}

function attach(
	container: HTMLElement,
	svg: SVGElement,
	opts: OverlayOptions,
): void {
	container.addClass("wonder-mermaid-decorated");

	// Toolbar is appended last so the SVG stays the container's firstChild —
	// Obsidian's Mermaid renderer reads firstChild when it re-renders a block.
	const toolbar = container.createDiv({ cls: "wonder-mermaid-overlay" });
	if (opts.onEdit) {
		const editBtn = toolbar.createEl("button", {
			cls: "wonder-mermaid-overlay-btn",
			attr: { "aria-label": "Edit Mermaid diagram" },
		});
		setIcon(editBtn, "pencil");
		editBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			opts.onEdit?.();
		});
	}

	if (opts.enableZoom) {
		const pz = new PanZoom(container, svg);
		const zoomIn = toolbar.createEl("button", {
			cls: "wonder-mermaid-overlay-btn",
			attr: { "aria-label": "Zoom in" },
		});
		setIcon(zoomIn, "plus");
		zoomIn.addEventListener("click", (e) => {
			stop(e);
			pz.zoomBy(1.2);
		});
		const zoomOut = toolbar.createEl("button", {
			cls: "wonder-mermaid-overlay-btn",
			attr: { "aria-label": "Zoom out" },
		});
		setIcon(zoomOut, "minus");
		zoomOut.addEventListener("click", (e) => {
			stop(e);
			pz.zoomBy(0.8);
		});
		const reset = toolbar.createEl("button", {
			cls: "wonder-mermaid-overlay-btn",
			attr: { "aria-label": "Reset zoom" },
		});
		setIcon(reset, "rotate-ccw");
		reset.addEventListener("click", (e) => {
			stop(e);
			pz.reset();
		});
	}
}

function stop(e: Event): void {
	e.preventDefault();
	e.stopPropagation();
}

// Resolve once the container has an <svg>, polling via a short-lived observer.
function whenSvgReady(
	container: HTMLElement,
	cb: (svg: SVGElement) => void,
	timeoutMs = 5000,
): void {
	const existing = container.querySelector("svg");
	if (existing) {
		cb(existing as SVGElement);
		return;
	}
	const observer = new MutationObserver(() => {
		const svg = container.querySelector("svg");
		if (svg) {
			observer.disconnect();
			cb(svg as SVGElement);
		}
	});
	observer.observe(container, { childList: true, subtree: true });
	window.setTimeout(() => observer.disconnect(), timeoutMs);
}

// Minimal wheel-zoom + drag-pan over a diagram. The transform is applied
// directly to the SVG in place — the DOM is never restructured, so Obsidian's
// own Mermaid rendering (which reads/replaces the container's children) is
// undisturbed.
class PanZoom {
	private scale = 1;
	private tx = 0;
	private ty = 0;
	private panning = false;
	private startX = 0;
	private startY = 0;

	constructor(
		private container: HTMLElement,
		private target: SVGElement,
	) {
		target.style.transformOrigin = "0 0";

		container.addEventListener("wheel", (e) => this.onWheel(e), {
			passive: false,
		});
		container.addEventListener("mousedown", (e) => this.onDown(e));
		container.addEventListener("mousemove", (e) => this.onMove(e));
		container.addEventListener("mouseup", () => this.end());
		container.addEventListener("mouseleave", () => this.end());
	}

	private onWheel(e: WheelEvent): void {
		// Only zoom with a modifier so normal scrolling still works in notes.
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		const rect = this.container.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;
		const factor = e.deltaY > 0 ? 0.9 : 1.1;
		this.zoomAt(px, py, factor);
	}

	private onDown(e: MouseEvent): void {
		if (e.button !== 0 || this.scale === 1) return;
		this.panning = true;
		this.startX = e.clientX - this.tx;
		this.startY = e.clientY - this.ty;
		this.container.addClass("wonder-mermaid-panning");
	}

	private onMove(e: MouseEvent): void {
		if (!this.panning) return;
		this.tx = e.clientX - this.startX;
		this.ty = e.clientY - this.startY;
		this.apply();
	}

	private end(): void {
		this.panning = false;
		this.container.removeClass("wonder-mermaid-panning");
	}

	zoomBy(factor: number): void {
		const rect = this.container.getBoundingClientRect();
		this.zoomAt(rect.width / 2, rect.height / 2, factor);
	}

	private zoomAt(px: number, py: number, factor: number): void {
		const next = Math.min(5, Math.max(0.2, this.scale * factor));
		const ratio = next / this.scale;
		this.tx = px - ratio * (px - this.tx);
		this.ty = py - ratio * (py - this.ty);
		this.scale = next;
		this.apply();
	}

	reset(): void {
		this.scale = 1;
		this.tx = 0;
		this.ty = 0;
		this.apply();
	}

	private apply(): void {
		this.target.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
	}
}
