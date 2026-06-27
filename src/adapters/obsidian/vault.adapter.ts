import { App, TFile } from "obsidian";
import type { VaultPort } from "../../ports/vault";

// Obsidian implementation of VaultPort.
export class ObsidianVault implements VaultPort {
	constructor(private app: App) {}

	read(file: TFile): Promise<string> {
		return this.app.vault.read(file);
	}

	process(file: TFile, fn: (data: string) => string): Promise<string> {
		return this.app.vault.process(file, fn);
	}

	getFileByPath(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}
}
