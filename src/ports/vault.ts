import { TFile } from "obsidian";

// Driven port: the slice of Obsidian's vault the application core depends on.
// Implemented by adapters/obsidian/vault.adapter; faked in tests. Methods are
// added here as use-cases need them, not speculatively.
export interface VaultPort {
	read(file: TFile): Promise<string>;
	// Atomic read-transform-write; returns the written content.
	process(file: TFile, fn: (data: string) => string): Promise<string>;
	// The markdown/other file at this vault-relative path, or null if it is not a
	// file (missing, or a folder).
	getFileByPath(path: string): TFile | null;
}
