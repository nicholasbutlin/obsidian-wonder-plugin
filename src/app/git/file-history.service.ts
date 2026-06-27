import { parseGitLog } from "../../core/git/log";
import { parseUnifiedDiff } from "../../core/git/diff";
import type { Commit, FileDiff } from "../../core/git/model";
import type { GitPort } from "../../ports/git";

// Application service: the commit timeline for a single file, and the diff that
// each commit introduced to it.
export class GitFileHistoryService {
	constructor(private git: GitPort) {}

	async history(path: string, max?: number): Promise<Commit[]> {
		return parseGitLog(await this.git.log({ path, max }));
	}

	async diff(commit: string, path: string): Promise<FileDiff> {
		return parseUnifiedDiff(await this.git.diff({ commit, path }));
	}
}
