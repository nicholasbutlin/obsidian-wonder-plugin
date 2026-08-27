import { TFile } from "obsidian";

// Driven port: relocating files within the vault. Kept separate from VaultPort,
// which covers reading and rewriting note content.
export interface FileMoverPort {
	// Does anything (file or folder) already occupy this vault-relative path?
	exists(path: string): boolean;
	// Create the folder and any missing parents; a no-op if it already exists.
	ensureFolder(path: string): Promise<void>;
	// Move the file, updating links that point at it.
	move(file: TFile, targetPath: string): Promise<void>;
}
