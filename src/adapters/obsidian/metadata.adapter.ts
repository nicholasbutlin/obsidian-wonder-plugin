import { App, TFile } from "obsidian";
import type { MetadataPort } from "../../ports/metadata";

export class ObsidianMetadata implements MetadataPort {
	constructor(private app: App) {}

	isKanbanBoard(file: TFile): boolean {
		return (
			this.app.metadataCache.getFileCache(file)?.frontmatter?.[
				"kanban-plugin"
			] === "board"
		);
	}
}
