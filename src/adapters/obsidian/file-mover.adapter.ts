import { App, TFile } from "obsidian";
import type { FileMoverPort } from "../../ports/file-mover";

// Obsidian implementation of FileMoverPort. Moves go through fileManager so
// Obsidian rewrites inbound links, rather than vault.rename which does not.
export class ObsidianFileMover implements FileMoverPort {
	constructor(private app: App) {}

	exists(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(path) !== null;
	}

	async ensureFolder(path: string): Promise<void> {
		if (path === "" || this.exists(path)) return;
		await this.app.vault.createFolder(path);
	}

	async move(file: TFile, targetPath: string): Promise<void> {
		await this.app.fileManager.renameFile(file, targetPath);
	}
}
