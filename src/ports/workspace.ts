import { TFile } from "obsidian";

// Driven port: the slice of Obsidian's workspace the application core depends on.
// Methods are added as use-cases need them.
export interface WorkspacePort {
	// The note currently in focus, or null if none.
	getActiveFile(): TFile | null;
	// Push reconciled content into any open Kanban board showing this file, so a
	// focused board re-renders instead of keeping the stale picker date. Best-
	// effort: a Kanban/Obsidian internal change must never break the caller.
	refreshKanbanBoards(filePath: string, content: string): void;
}
