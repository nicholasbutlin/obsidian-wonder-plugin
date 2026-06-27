import { TFile } from "obsidian";
import {
	captureActions,
	hasActions,
	hasTodoHeading,
	insertUnderTodoHeading,
	type CapturedAction,
} from "../../core/actions/capture";
import { kanbanPath, type WonderSettings } from "../../settings";
import type { VaultPort } from "../../ports/vault";
import type { Notifier } from "../../ports/notifier";
import type { SettingsStore } from "../../ports/settings-store";

// Application service around the pure action-capture domain: reads the note and
// board, applies the transform atomically, and files the captured tasks. Depends
// only on ports, so it is exercised in tests with in-memory fakes.
export class ActionCaptureService {
	constructor(
		private vault: VaultPort,
		private notifier: Notifier,
		private settings: SettingsStore<WonderSettings>,
	) {}

	async run(file: TFile): Promise<void> {
		// Cheap guard so we don't touch notes that have nothing to do.
		const content = await this.vault.read(file);
		if (!hasActions(content)) return;

		const { kanbanFile } = this.settings.get();
		const kanban = this.vault.getFileByPath(kanbanPath(kanbanFile));
		if (!kanban) return;

		// Guard before mutating the note: without a "## ToDo" heading we cannot file
		// the actions, and rewriting the note anyway would leave it linking to board
		// work that never gets created.
		const kanbanContent = await this.vault.read(kanban);
		if (!hasTodoHeading(kanbanContent)) {
			this.notifier.info(
				`Wonder: "${kanbanFile}" has no "## ToDo" heading; skipped action processing.`,
			);
			return;
		}

		// process reads, transforms, and writes atomically, so we capture from the
		// data it hands us rather than a stale read.
		let captured: CapturedAction[] = [];
		await this.vault.process(file, (data) => {
			const result = captureActions(data, {
				kanbanFile,
				noteBasename: file.basename,
			});
			captured = result.captured;
			return result.rewritten;
		});

		if (captured.length === 0) return;

		for (const action of captured) {
			this.notifier.info(`Adding auto action: ${action.text}`);
		}

		await this.vault.process(kanban, (data) =>
			insertUnderTodoHeading(
				data,
				captured.map((action) => action.entry),
			),
		);
	}
}
