import { TFile } from "obsidian";

// Driven port: moving a file out of the vault to an absolute filesystem path —
// typically the inbox folder of another vault. Desktop only; `isAvailable`
// reports whether node's fs and the vault's real path are both reachable.
export interface ExternalFileMoverPort {
	isAvailable(): boolean;
	// Expand `~` and make the configured path absolute.
	resolve(path: string): string;
	// Does anything already occupy this absolute path?
	exists(path: string): boolean;
	// Create the folder and any missing parents; a no-op if it already exists.
	ensureFolder(path: string): Promise<void>;
	// Copy the file out, then remove it from the vault. Inbound links are not
	// rewritten: the note leaves the vault, so there is nothing to point at.
	move(file: TFile, targetPath: string): Promise<void>;
}
