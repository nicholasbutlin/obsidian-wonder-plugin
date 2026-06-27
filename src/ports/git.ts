// Driven port: read-only access to the repository's history. Implemented by the
// node git CLI adapter; desktop-only. All methods return raw git stdout — the
// pure parsers in core/git turn that into domain objects.
export interface GitPort {
	// True when git can be invoked at all (desktop + a filesystem vault path).
	// Synchronous so command/view registration can gate on it.
	isAvailable(): boolean;
	// Whether the vault path is inside a git work tree (async: runs git).
	isRepo(): Promise<boolean>;
	// `git log` for the repo, or for a single file when `path` is given.
	log(opts: { path?: string; max?: number }): Promise<string>;
	// The unified diff a commit introduced for one file (`git show`).
	diff(opts: { commit: string; path: string }): Promise<string>;
}
