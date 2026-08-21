import type { GitLocksPort } from "../../ports/git-locks";
import { GIT_DIR_LOCK_NAMES, type LockFile } from "../../core/git/locks";

type Stats = { mtimeMs: number };
type Dirent = { name: string; isDirectory(): boolean; isFile(): boolean };
type FsPromises = {
	stat(path: string): Promise<Stats>;
	readdir(path: string, opts: { withFileTypes: true }): Promise<Dirent[]>;
	unlink(path: string): Promise<void>;
};

// Lazily resolve node's fs/path, mirroring GitCli: never touch node builtins at
// module load time, so this file stays importable on mobile.
let fsPromises: FsPromises | null = null;
function getFs(): FsPromises {
	if (!fsPromises) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		fsPromises = require("fs").promises as FsPromises;
	}
	return fsPromises;
}

function join(...parts: string[]): string {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	return require("path").join(...parts) as string;
}

// Refs nest (refs/heads/feature/x.lock), but not deeply. Bound the walk so a
// surprising directory tree can never turn a command into a full-disk scan.
const MAX_REFS_DEPTH = 6;

// Finds git's lock files on disk. `gitDir` resolves the repository's git dir
// (async because it comes from `git rev-parse`), returning null when there is
// no repository to look at.
export class GitLocksFs implements GitLocksPort {
	constructor(private gitDir: () => Promise<string | null>) {}

	async list(): Promise<LockFile[]> {
		const dir = await this.gitDir();
		if (!dir) return [];
		const fs = getFs();
		const locks: LockFile[] = [];

		for (const name of GIT_DIR_LOCK_NAMES) {
			const path = join(dir, name);
			try {
				const stats = await fs.stat(path);
				locks.push({ path, label: name, mtimeMs: stats.mtimeMs });
			} catch {
				// Absent (the normal case) or unreadable: nothing to clear.
			}
		}

		await this.collectRefLocks(join(dir, "refs"), "refs", 0, locks);
		return locks;
	}

	async remove(path: string): Promise<void> {
		await getFs().unlink(path);
	}

	private async collectRefLocks(
		dir: string,
		label: string,
		depth: number,
		out: LockFile[],
	): Promise<void> {
		if (depth > MAX_REFS_DEPTH) return;
		const fs = getFs();
		let entries: Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return; // No refs/ directory, or not readable.
		}
		for (const entry of entries) {
			const path = join(dir, entry.name);
			const entryLabel = `${label}/${entry.name}`;
			if (entry.isDirectory()) {
				await this.collectRefLocks(path, entryLabel, depth + 1, out);
			} else if (entry.isFile() && entry.name.endsWith(".lock")) {
				try {
					const stats = await fs.stat(path);
					out.push({ path, label: entryLabel, mtimeMs: stats.mtimeMs });
				} catch {
					// Vanished between readdir and stat — git cleaned up itself.
				}
			}
		}
	}
}
