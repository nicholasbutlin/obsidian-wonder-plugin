import type { LockFile } from "../core/git/locks";

// Driven port: the git lock files sitting in the repository's git dir, and the
// ability to delete one. Separate from GitPort because clearing a lock is a
// filesystem operation, not a git invocation — git itself cannot remove a lock
// it did not create.
export interface GitLocksPort {
	// Lock files currently present in the git dir (including under refs/).
	// Empty when git is unavailable or the vault is not a repository.
	list(): Promise<LockFile[]>;
	// Delete one lock file. Rejects if the file cannot be removed.
	remove(path: string): Promise<void>;
}
