import { describe, it, expect } from "vitest";
import {
	describeClearOutcome,
	triageLocks,
	STALE_AFTER_MS,
	type LockFile,
} from "./locks";

function lock(label: string, mtimeMs: number): LockFile {
	return { path: `/vault/.git/${label}`, label, mtimeMs };
}

describe("triageLocks", () => {
	const now = 1_000_000;

	it("treats a lock older than the threshold as stale", () => {
		const old = lock("index.lock", now - STALE_AFTER_MS - 1);
		expect(triageLocks([old], now)).toEqual({ stale: [old], fresh: [] });
	});

	it("leaves a lock that was just written", () => {
		const recent = lock("index.lock", now - 1_000);
		expect(triageLocks([recent], now)).toEqual({ stale: [], fresh: [recent] });
	});

	it("treats a future mtime as fresh rather than deleting it", () => {
		const skewed = lock("HEAD.lock", now + 60_000);
		expect(triageLocks([skewed], now).stale).toEqual([]);
	});

	it("splits a mixed set", () => {
		const stale = lock("index.lock", now - 60 * 60 * 1000);
		const fresh = lock("refs/heads/main.lock", now - 5);
		const triage = triageLocks([stale, fresh], now);
		expect(triage.stale).toEqual([stale]);
		expect(triage.fresh).toEqual([fresh]);
	});
});

describe("describeClearOutcome", () => {
	it("reports when there was nothing to do", () => {
		expect(describeClearOutcome({ removed: [], skipped: [], failed: [] })).toBe(
			"No git lock files found",
		);
	});

	it("names the locks it removed", () => {
		expect(
			describeClearOutcome({
				removed: ["index.lock", "refs/heads/main.lock"],
				skipped: [],
				failed: [],
			}),
		).toBe("Cleared index.lock, refs/heads/main.lock");
	});

	it("explains skipped and failed locks", () => {
		const message = describeClearOutcome({
			removed: [],
			skipped: ["index.lock"],
			failed: [{ label: "config.lock", reason: "EACCES" }],
		});
		expect(message).toContain("Left index.lock");
		expect(message).toContain("Could not remove config.lock: EACCES");
	});
});
