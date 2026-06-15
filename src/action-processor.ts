import { App, Notice, TFile } from "obsidian";
import WonderPlugin from "./main";
import { kanbanPath } from "./settings";

// Action grammar lives here so the marker syntax has a single definition.
// `ACTION_GUARD` is a cheap, stateless check; `ACTION_MARKER` is the global
// matcher used to rewrite every occurrence in one pass.
const ACTION_GUARD = /@action:? /i;
const ACTION_MARKER = /@action:? (.*)/gi;

// New items are filed directly beneath the "## ToDo" heading.
const TODO_HEADER = /(##\s+ToDo\s*\n)/;

function randomBlockId(): string {
	return Math.random().toString(36).substring(2, 9);
}

export class ActionProcessor {
	plugin: WonderPlugin;
	app: App;

	// Injectable so tests can assert against deterministic anchor IDs.
	private generateBlockId: () => string;

	constructor(
		plugin: WonderPlugin,
		generateBlockId: () => string = randomBlockId,
	) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.generateBlockId = generateBlockId;
	}

	async processActionMarkers(file: TFile) {
		// Cheap guard so we don't touch notes that have nothing to do.
		const content = await this.app.vault.read(file);
		if (!ACTION_GUARD.test(content)) return;

		const { kanbanFile } = this.plugin.settings;
		const kanban = this.app.vault.getAbstractFileByPath(kanbanPath(kanbanFile));
		if (!(kanban instanceof TFile)) return;

		// Guard before mutating the note: without a "## ToDo" heading we cannot
		// file the actions, and rewriting the note anyway would leave it linking
		// to Kanban anchors that never get created.
		const kanbanContent = await this.app.vault.read(kanban);
		if (!TODO_HEADER.test(kanbanContent)) {
			new Notice(
				`Wonder: "${kanbanFile}" has no "## ToDo" heading; skipped action processing.`,
			);
			return;
		}

		const kanbanEntries: string[] = [];

		// vault.process reads, transforms, and writes atomically, so we compute
		// the rewrite from the data it hands us rather than a stale read. A
		// replacer function (not a replacement string) keeps `$` in action text
		// literal instead of triggering substitution patterns.
		await this.app.vault.process(file, (data) =>
			data.replace(ACTION_MARKER, (_match, rawText: string) => {
				const actionText = rawText.trim();
				const blockId = this.generateBlockId();

				// Anchor the Kanban item with the same block ID the ACTION link targets.
				kanbanEntries.push(`- ${actionText} ^${blockId}\n[[${file.basename}]]`);
				new Notice(`Adding auto action: ${actionText}`);

				return `**[[${kanbanFile}#^${blockId}|ACTION]]:** ${actionText}`;
			}),
		);

		if (kanbanEntries.length === 0) return;

		// Insert the new action items after the "## ToDo" header.
		await this.app.vault.process(kanban, (data) =>
			data.replace(TODO_HEADER, `$1${kanbanEntries.join("\n")}\n`),
		);
	}
}
