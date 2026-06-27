import { describe, it, expect } from "vitest";
import { GitFileHistoryService } from "./file-history.service";
import { GitRepoCommitsService } from "./repo-commits.service";
import { LOG_FIELD, LOG_RECORD } from "../../core/git/log";
import type { GitPort } from "../../ports/git";

function logRecord(hash: string, subject: string): string {
	return [hash, hash.slice(0, 4), "Nick", "2026-06-20", subject].join(LOG_FIELD) + LOG_RECORD;
}

// A GitPort that returns canned stdout and records the arguments it was called
// with, so we can assert the services wire the right git calls to the parsers.
class FakeGit implements GitPort {
	logCalls: { path?: string; max?: number }[] = [];
	diffCalls: { commit: string; path: string }[] = [];
	nameStatusCalls: string[] = [];

	isAvailable(): boolean {
		return true;
	}
	async isRepo(): Promise<boolean> {
		return true;
	}
	async log(opts: { path?: string; max?: number }): Promise<string> {
		this.logCalls.push(opts);
		return logRecord("abc123", "first") + "\n" + logRecord("def456", "second");
	}
	async nameStatus(commit: string): Promise<string> {
		this.nameStatusCalls.push(commit);
		return "A\tnew.md\nM\tedited.md\n";
	}
	async diff(opts: { commit: string; path: string }): Promise<string> {
		this.diffCalls.push(opts);
		return ["@@ -1,1 +1,1 @@", "-old", "+new"].join("\n");
	}
}

describe("GitFileHistoryService", () => {
	it("requests a --follow log for the file and parses commits", async () => {
		const git = new FakeGit();
		const commits = await new GitFileHistoryService(git).history("Note.md", 25);

		expect(git.logCalls).toEqual([{ path: "Note.md", max: 25 }]);
		expect(commits.map((c) => c.subject)).toEqual(["first", "second"]);
	});

	it("parses a file's diff at a commit into side-by-side rows", async () => {
		const git = new FakeGit();
		const diff = await new GitFileHistoryService(git).diff("abc123", "Note.md");

		expect(git.diffCalls).toEqual([{ commit: "abc123", path: "Note.md" }]);
		expect(diff.hunks[0].rows[0]).toEqual({
			left: { text: "old", lineNo: 1 },
			right: { text: "new", lineNo: 1 },
			kind: "change",
		});
	});
});

describe("GitRepoCommitsService", () => {
	it("lists repo commits", async () => {
		const git = new FakeGit();
		const commits = await new GitRepoCommitsService(git).commits();
		expect(git.logCalls).toEqual([{ path: undefined, max: undefined }]);
		expect(commits).toHaveLength(2);
	});

	it("lists the files changed in a commit", async () => {
		const git = new FakeGit();
		const files = await new GitRepoCommitsService(git).changedFiles("abc123");
		expect(git.nameStatusCalls).toEqual(["abc123"]);
		expect(files).toEqual([
			{ status: "A", path: "new.md" },
			{ status: "M", path: "edited.md" },
		]);
	});
});
