import { TFile } from "obsidian";
import { normalizeKanbanDates } from "../../core/dates/normalize";
import type { VaultPort } from "../../ports/vault";
import type { WorkspacePort } from "../../ports/workspace";

// Application service: reconcile a board file's Kanban picker dates to the
// canonical 📅 form and refresh any open board showing it.
export class DateNormalizeService {
	constructor(
		private vault: VaultPort,
		private workspace: WorkspacePort,
	) {}

	async run(file: TFile): Promise<void> {
		const content = await this.vault.read(file);
		const next = normalizeKanbanDates(content);
		// The no-op-write guard is also the loop guard: a normalized board has no
		// brace dates and every 📅 on its main line, so the re-triggered `modify`
		// event recomputes an identical string and exits here without writing.
		if (next === content) return;
		await this.vault.process(file, () => next);
		this.workspace.refreshKanbanBoards(file.path, next);
	}
}
