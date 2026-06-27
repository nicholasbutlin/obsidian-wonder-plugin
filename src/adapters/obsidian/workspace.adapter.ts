import { App, TFile } from "obsidian";
import type { WorkspacePort } from "../../ports/workspace";

// A Kanban board leaf's view, as much of it as we touch. Kanban reparses the
// board from `view.data`, and `setViewData` is its TextFileView re-render hook.
type BoardView = {
	file?: { path: string };
	data?: string;
	setViewData?: (data: string, clear: boolean) => void;
};

export class ObsidianWorkspace implements WorkspacePort {
	constructor(private app: App) {}

	getActiveFile(): TFile | null {
		return this.app.workspace.getActiveFile();
	}

	// Obsidian doesn't push an external write into a focused TextFileView, so a
	// Kanban board open on this file keeps showing the stale Kanban date after we
	// reconcile. Sync the view's in-memory `data` to the reconciled content — that
	// is what Kanban reparses from on the metadata-cache change our write triggers
	// — and ask it to re-render. Best-effort and guarded; we deliberately avoid a
	// full view rebuild (it tears down Kanban's view and can blank the board).
	refreshKanbanBoards(filePath: string, content: string): void {
		const workspace = this.app.workspace;
		if (!workspace?.getLeavesOfType) return;
		for (const leaf of workspace.getLeavesOfType("kanban")) {
			const view = leaf.view as BoardView;
			if (view?.file?.path !== filePath) continue;
			try {
				view.data = content;
				view.setViewData?.(content, true);
			} catch {
				// swallow: keep the canonical date even if the re-render fails
			}
		}
	}
}
