import { TFile } from "obsidian";

// Driven port: the metadata-cache facts the application core needs.
export interface MetadataPort {
	// True when the file's frontmatter marks it as a Kanban board.
	isKanbanBoard(file: TFile): boolean;
}
