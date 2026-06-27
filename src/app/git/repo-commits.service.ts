import { parseGitLog } from "../../core/git/log";
import { parseNameStatus } from "../../core/git/name-status";
import { parseUnifiedDiff } from "../../core/git/diff";
import type { Commit, FileChange, FileDiff } from "../../core/git/model";
import type { GitPort } from "../../ports/git";

// Application service: the repository's commit history, the files each commit
// changed, and the diff for a chosen file within a commit.
export class GitRepoCommitsService {
	constructor(private git: GitPort) {}

	async commits(max?: number): Promise<Commit[]> {
		return parseGitLog(await this.git.log({ max }));
	}

	async changedFiles(commit: string): Promise<FileChange[]> {
		return parseNameStatus(await this.git.nameStatus(commit));
	}

	async diff(commit: string, path: string): Promise<FileDiff> {
		return parseUnifiedDiff(await this.git.diff({ commit, path }));
	}
}
