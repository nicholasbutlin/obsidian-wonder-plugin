import { TAbstractFile, TFile } from "obsidian";
import type { Scheduler } from "../ports/scheduler";
import type { MetadataPort } from "../ports/metadata";
import type { SettingsStore } from "../ports/settings-store";
import type { WonderSettings } from "../settings";
import type { ActionCaptureService } from "./actions/action-capture.service";
import type { DateNormalizeService } from "./dates/date-normalize.service";

// Routes a modified file, once it settles, to the right handler: Kanban board
// files get their picker dates normalized; every other note is scanned for
// @action markers. Owns the set of known boards used to pick the debounce delay.
export class ScanRouterService {
	private knownBoards = new Set<string>();

	constructor(
		private scheduler: Scheduler,
		private metadata: MetadataPort,
		private settings: SettingsStore<WonderSettings>,
		private actionCapture: ActionCaptureService,
		private dateNormalize: DateNormalizeService,
	) {}

	// Debounce a modified file's scan so a burst of edits triggers one run once the
	// file settles. The board-vs-note routing is decided when the timer fires, NOT
	// here: a Kanban save invalidates the metadata cache, so at event time
	// isKanbanBoard can briefly report false and a board would be mis-routed to the
	// action scan. By the time the debounce fires the cache has settled.
	scheduleScan(file: TAbstractFile): void {
		if (!(file instanceof TFile)) return;
		this.scheduler.debounce(
			file.path,
			() => this.scan(file),
			this.debounceSecondsFor(file) * 1000,
		);
	}

	// Seed the known-boards set at load so the first edit to a board picks the fast
	// interval even before it has been scanned.
	indexBoards(files: TFile[]): void {
		for (const file of files) {
			if (this.metadata.isKanbanBoard(file)) this.knownBoards.add(file.path);
		}
	}

	// Date reconcile is debounced briefly so a board settles fast; action capture
	// waits longer so it doesn't fire mid-typing. The board check here is best-
	// effort (it only picks the interval); the authoritative routing happens in
	// scan() once the cache has settled.
	private debounceSecondsFor(file: TFile): number {
		const isBoard =
			this.knownBoards.has(file.path) || this.metadata.isKanbanBoard(file);
		const settings = this.settings.get();
		return isBoard
			? settings.dateDebounceSeconds
			: settings.actionDebounceSeconds;
	}

	private scan(file: TFile): void {
		if (this.metadata.isKanbanBoard(file)) {
			this.knownBoards.add(file.path);
			if (this.settings.get().normalizeKanbanDates) {
				void this.dateNormalize.run(file);
			}
		} else {
			this.knownBoards.delete(file.path);
			void this.actionCapture.run(file);
		}
	}
}
