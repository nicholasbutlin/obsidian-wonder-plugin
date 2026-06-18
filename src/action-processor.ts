import { App, Notice, TFile } from "obsidian";
import WonderPlugin from "./main";
import { kanbanPath } from "./settings";
import {
	captureActions,
	hasActions,
	hasTodoHeading,
	insertUnderTodoHeading,
	type CapturedAction,
} from "./action-capture";

function randomBlockId(): string {
	return Math.random().toString(36).substring(2, 9);
}

function todayIso(): string {
	return window.moment().format("YYYY-MM-DD");
}

// Obsidian adapter around the pure action-capture domain: reads the note and
// board, applies the transform atomically, and files the captured tasks.
export class ActionProcessor {
	plugin: WonderPlugin;
	app: App;

	// Injectable so tests can assert against deterministic anchor IDs and date.
	private generateBlockId: () => string;
	private today: () => string;

	constructor(
		plugin: WonderPlugin,
		generateBlockId: () => string = randomBlockId,
		today: () => string = todayIso,
	) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.generateBlockId = generateBlockId;
		this.today = today;
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
		// to Kanban anchors that never get created.
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
				today: this.today,
				newBlockId: this.generateBlockId,
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
