import { App, Notice, TFile } from "obsidian";
import WonderPlugin from "./main";
import { kanbanPath } from "./settings";
import {
	captureActions,
	hasActions,
	hasTodoHeading,
	insertUnderTodoHeading,
	type CapturedAction,
} from "./core/actions/capture";

// Obsidian adapter around the pure action-capture domain: reads the note and
// board, applies the transform atomically, and files the captured tasks.
export class ActionProcessor {
	plugin: WonderPlugin;
	app: App;

	constructor(plugin: WonderPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
	}

	async processActionMarkers(file: TFile) {
		// Cheap guard so we don't touch notes that have nothing to do.
		const content = await this.app.vault.read(file);
		if (!hasActions(content)) return;

		const { kanbanFile } = this.plugin.settings;
		const kanban = this.app.vault.getAbstractFileByPath(kanbanPath(kanbanFile));
		if (!(kanban instanceof TFile)) return;

		// Guard before mutating the note: without a "## ToDo" heading we cannot
		// file the actions, and rewriting the note anyway would leave it linking
		// to board work that never gets created.
		const kanbanContent = await this.app.vault.read(kanban);
		if (!hasTodoHeading(kanbanContent)) {
			new Notice(
				`Wonder: "${kanbanFile}" has no "## ToDo" heading; skipped action processing.`,
			);
			return;
		}

		// vault.process reads, transforms, and writes atomically, so we capture
		// from the data it hands us rather than a stale read.
		let captured: CapturedAction[] = [];
		await this.app.vault.process(file, (data) => {
			const result = captureActions(data, {
				kanbanFile,
				noteBasename: file.basename,
			});
			captured = result.captured;
			return result.rewritten;
		});

		if (captured.length === 0) return;

		for (const action of captured) {
			new Notice(`Adding auto action: ${action.text}`);
		}

		await this.app.vault.process(kanban, (data) =>
			insertUnderTodoHeading(
				data,
				captured.map((action) => action.entry),
			),
		);
	}
}
