import type { GitPort } from "../../ports/git";
import { LOG_FORMAT } from "../../core/git/log";

type ExecFileAsync = (
	cmd: string,
	args: string[],
	opts: { cwd?: string; maxBuffer: number },
) => Promise<{ stdout: string }>;

// Lazily resolve node's promisified execFile. Done on first use (desktop only,
// behind isAvailable) so this module never touches node builtins on mobile,
// where `require("child_process")` would throw at load time.
let execFileAsync: ExecFileAsync | null = null;
function getExecFile(): ExecFileAsync {
	if (!execFileAsync) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const childProcess = require("child_process");
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const util = require("util");
		execFileAsync = util.promisify(childProcess.execFile) as ExecFileAsync;
	}
	return execFileAsync;
}

// Large repos can produce big diffs; allow up to 64 MiB of git stdout.
const MAX_BUFFER = 64 * 1024 * 1024;

// Shells out to the real git CLI against the vault's filesystem path. `root` is
// null when there is no filesystem path (mobile / non-FileSystemAdapter), which
// makes the adapter report unavailable rather than ever invoking git.
export class GitCli implements GitPort {
	constructor(private root: string | null) {}

	isAvailable(): boolean {
		return this.root !== null;
	}

	async isRepo(): Promise<boolean> {
		if (!this.root) return false;
		try {
			const out = await this.run(["rev-parse", "--is-inside-work-tree"]);
			return out.trim() === "true";
		} catch {
			return false;
		}
	}

	log({ path, max = 50 }: { path?: string; max?: number }): Promise<string> {
		const args = [
			"log",
			"--no-color",
			"--date=short",
			`--pretty=format:${LOG_FORMAT}`,
			"-n",
			String(max),
		];
		// --follow tracks a single file across renames; only valid with a pathspec.
		if (path) args.push("--follow", "--", path);
		return this.run(args);
	}

	diff({ commit, path }: { commit: string; path: string }): Promise<string> {
		// `git show` with an empty format prints just the patch; it works for the
		// root commit too (no parent), showing the file as all-additions.
		return this.run([
			"show",
			"--no-color",
			"--format=",
			"-M",
			commit,
			"--",
			path,
		]);
	}

	private async run(args: string[]): Promise<string> {
		if (!this.root) throw new Error("git is unavailable on this platform");
		const { stdout } = await getExecFile()("git", ["-C", this.root, ...args], {
			maxBuffer: MAX_BUFFER,
		});
		return stdout;
	}
}
