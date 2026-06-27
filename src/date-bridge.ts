import { TFile } from "obsidian";
import WonderPlugin from "./main";
import { normalizeKanbanDates } from "./core/dates/normalize";

// The pure brace-date reconciliation now lives in ./core/dates/normalize and is
// re-exported here for existing importers. This module keeps only the Obsidian
// adapter that applies it to a board file and refreshes open Kanban views.
export { normalizeKanbanDates } from "./core/dates/normalize";

// A Kanban board leaf's view, as much of it as we touch. Kanban reparses the
// board from `view.data`, and `setViewData` is its TextFileView re-render hook.
type BoardView = {
	file?: { path: string };
	data?: string;
	setViewData?: (data: string, clear: boolean) => void;
};

export class DateNormalizer {
	constructor(private plugin: WonderPlugin) {}

	async normalize(file: TFile): Promise<void> {
		const content = await this.plugin.app.vault.read(file);
		const next = normalizeKanbanDates(content);
		// The no-op-write guard is also the loop guard: a normalized board has no
		// brace dates and every 📅 on its main line, so the re-triggered `modify`
		// event recomputes an identical string and exits here without writing.
		if (next === content) return;
		await this.plugin.app.vault.process(file, () => next);
		this.refreshOpenBoards(file, next);
	}

	// Obsidian doesn't push an external write into a focused TextFileView, so a
	// Kanban board open on this file keeps showing the stale Kanban date after we
	// reconcile. Sync the view's in-memory `data` to the reconciled content — that
	// is what Kanban reparses from on the metadata-cache change our write triggers
	// — and ask it to re-render. Best-effort and guarded: a Kanban/Obsidian
	// internal change must never break normalization, and we deliberately avoid a
	// full view rebuild (it tears down Kanban's view and can blank the board).
	private refreshOpenBoards(file: TFile, content: string): void {
		const workspace = this.plugin.app.workspace;
		if (!workspace?.getLeavesOfType) return;
		for (const leaf of workspace.getLeavesOfType("kanban")) {
			const view = leaf.view as BoardView;
			if (view?.file?.path !== file.path) continue;
			try {
				view.data = content;
				view.setViewData?.(content, true);
			} catch {
				// swallow: keep the canonical date even if the re-render fails
			}
		}
	}
}
