import { describe, it, expect } from "vitest";
import { parseGitLog, LOG_FIELD, LOG_RECORD } from "./log";

// Build a log record the way git would emit it under LOG_FORMAT.
function record(
	hash: string,
	short: string,
	author: string,
	date: string,
	subject: string,
): string {
	return [hash, short, author, date, subject].join(LOG_FIELD) + LOG_RECORD;
}

describe("parseGitLog", () => {
	it("parses a single commit", () => {
		const out = record("abc123", "abc1", "Nick", "2026-06-20", "Fix the bug");
		expect(parseGitLog(out)).toEqual([
			{
				hash: "abc123",
				shortHash: "abc1",
				author: "Nick",
				date: "2026-06-20",
				subject: "Fix the bug",
			},
		]);
	});

	it("parses multiple commits joined by newlines", () => {
		const out =
			record("h1", "s1", "A", "2026-06-20", "first") +
			"\n" +
			record("h2", "s2", "B", "2026-06-19", "second");
		const commits = parseGitLog(out);
		expect(commits).toHaveLength(2);
		expect(commits[0].subject).toBe("first");
		expect(commits[1].hash).toBe("h2");
		expect(commits[1].date).toBe("2026-06-19");
	});

	it("keeps a subject that contains spaces and punctuation", () => {
		const out = record("h", "s", "A", "2026-06-20", "feat: add X, Y & Z!");
		expect(parseGitLog(out)[0].subject).toBe("feat: add X, Y & Z!");
	});

	it("returns an empty array for empty output", () => {
		expect(parseGitLog("")).toEqual([]);
		expect(parseGitLog("\n")).toEqual([]);
	});
});
