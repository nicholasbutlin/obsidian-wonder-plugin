// Pure rules for git's lock files. Git writes a `*.lock` file while it mutates
// a ref, the index or config, and removes it when done. A crashed or killed
// process (Obsidian quitting mid-sync is the usual culprit) leaves one behind,
// and every later git command fails until it is deleted. Nothing here touches
// the filesystem — the node adapter finds and removes the files.

// Lock files git creates directly inside the git dir. Locks under refs/ are
// found by scanning, since their names follow the branch/tag names.
export const GIT_DIR_LOCK_NAMES = [
	"index.lock",
	"HEAD.lock",
	"ORIG_HEAD.lock",
	"FETCH_HEAD.lock",
	"config.lock",
	"packed-refs.lock",
	"shallow.lock",
];

// A lock younger than this is assumed to belong to a git process that is still
// running (a big fetch or commit), so it is left alone. Real git operations in
// a vault finish well inside this window; stale locks are typically hours old.
export const STALE_AFTER_MS = 30_000;

export interface LockFile {
	// Absolute path to the lock file.
	path: string;
	// Path relative to the git dir, for display ("index.lock").
	label: string;
	// Last-modified time, used to judge staleness.
	mtimeMs: number;
}

export interface LockTriage {
	stale: LockFile[];
	// Locks too recent to be safely assumed abandoned.
	fresh: LockFile[];
}

// Split the locks found on disk into the ones safe to delete and the ones that
// may still be in use.
export function triageLocks(
	locks: LockFile[],
	nowMs: number,
	staleAfterMs: number = STALE_AFTER_MS,
): LockTriage {
	const stale: LockFile[] = [];
	const fresh: LockFile[] = [];
	for (const lock of locks) {
		// Clock skew (or a lock stamped in the future) counts as fresh: never
		// delete something we cannot show is old.
		if (nowMs - lock.mtimeMs >= staleAfterMs) stale.push(lock);
		else fresh.push(lock);
	}
	return { stale, fresh };
}

export interface ClearOutcome {
	removed: string[];
	skipped: string[];
	failed: { label: string; reason: string }[];
}

// One line for a Notice describing what the clear did.
export function describeClearOutcome(outcome: ClearOutcome): string {
	const parts: string[] = [];
	if (outcome.removed.length) {
		parts.push(`Cleared ${outcome.removed.join(", ")}`);
	}
	if (outcome.skipped.length) {
		parts.push(
			`Left ${outcome.skipped.join(", ")} — modified in the last few seconds, git may still be running`,
		);
	}
	for (const failure of outcome.failed) {
		parts.push(`Could not remove ${failure.label}: ${failure.reason}`);
	}
	if (!parts.length) return "No git lock files found";
	return parts.join(". ");
}
