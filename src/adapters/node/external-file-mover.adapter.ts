import { App, FileSystemAdapter, Platform, TFile } from "obsidian";
import type { ExternalFileMoverPort } from "../../ports/external-file-mover";

type FsPromises = {
	mkdir(path: string, opts: { recursive: true }): Promise<string | undefined>;
	writeFile(path: string, data: Uint8Array): Promise<void>;
};
type FsSync = { existsSync(path: string): boolean };

// Lazily resolve node's builtins, mirroring the git adapters: never touch them
// at module load time, so this file stays importable on mobile.
let fs: (FsSync & { promises: FsPromises }) | null = null;
function getFs(): FsSync & { promises: FsPromises } {
	if (!fs) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		fs = require("fs") as FsSync & { promises: FsPromises };
	}
	return fs;
}

function resolvePath(path: string): string {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const nodePath = require("path") as { resolve(...parts: string[]): string };
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const os = require("os") as { homedir(): string };
	const expanded =
		path === "~" || path.startsWith("~/") || path.startsWith("~\\")
			? os.homedir() + path.slice(1)
			: path;
	return nodePath.resolve(expanded);
}

// Moves notes to an absolute path outside the vault by copying the bytes out
// and deleting the original. Obsidian's fileManager cannot do this: it only
// knows about paths inside the vault.
export class NodeExternalFileMover implements ExternalFileMoverPort {
	constructor(private app: App) {}

	isAvailable(): boolean {
		return (
			Platform.isDesktopApp &&
			this.app.vault.adapter instanceof FileSystemAdapter
		);
	}

	resolve(path: string): string {
		return resolvePath(path);
	}

	exists(path: string): boolean {
		return getFs().existsSync(path);
	}

	async ensureFolder(path: string): Promise<void> {
		await getFs().promises.mkdir(path, { recursive: true });
	}

	async move(file: TFile, targetPath: string): Promise<void> {
		const bytes = await this.app.vault.readBinary(file);
		await getFs().promises.writeFile(targetPath, new Uint8Array(bytes));
		// Only once the copy is safely on disk does the original go.
		await this.app.vault.delete(file);
	}
}
