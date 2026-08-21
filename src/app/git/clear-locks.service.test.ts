import { describe, it, expect } from "vitest";
import { GitClearLocksService } from "./clear-locks.service";
import { STALE_AFTER_MS, type LockFile } from "../../core/git/locks";
import type { GitLocksPort } from "../../ports/git-locks";
import type { Notifier } from "../../ports/notifier";

const NOW = 1_000_000;

class FakeLocks implements GitLocksPort {
	removed: string[] = [];
	constructor(
		private locks: LockFile[],
		private failOn?: string,
	) {}
	async list(): Promise<LockFile[]> {
		return this.locks;
	}
	async remove(path: string): Promise<void> {
		if (path === this.failOn) throw new Error("EACCES");
		this.removed.push(path);
	}
}

class FakeNotifier implements Notifier {
	messages: string[] = [];
	info(message: string): void {
		this.messages.push(message);
	}
}

function lock(label: string, ageMs: number): LockFile {
	return { path: `/vault/.git/${label}`, label, mtimeMs: NOW - ageMs };
}

function service(locks: FakeLocks, notifier: FakeNotifier) {
	return new GitClearLocksService(locks, notifier, () => NOW);
}

describe("GitClearLocksService", () => {
	it("removes stale locks and reports them", async () => {
		const locks = new FakeLocks([lock("index.lock", 60 * 60 * 1000)]);
		const notifier = new FakeNotifier();

		const outcome = await service(locks, notifier).run();

		expect(locks.removed).toEqual(["/vault/.git/index.lock"]);
		expect(outcome.removed).toEqual(["index.lock"]);
		expect(notifier.messages[0]).toContain("Cleared index.lock");
	});

	it("leaves a lock a running git process may still hold", async () => {
		const locks = new FakeLocks([lock("index.lock", STALE_AFTER_MS - 1)]);
		const notifier = new FakeNotifier();

		const outcome = await service(locks, notifier).run();

		expect(locks.removed).toEqual([]);
		expect(outcome.skipped).toEqual(["index.lock"]);
	});

	it("keeps going when one lock cannot be deleted", async () => {
		const locks = new FakeLocks(
			[lock("config.lock", 60_000), lock("index.lock", 60_000)],
			"/vault/.git/config.lock",
		);
		const notifier = new FakeNotifier();

		const outcome = await service(locks, notifier).run();

		expect(outcome.removed).toEqual(["index.lock"]);
		expect(outcome.failed).toEqual([
			{ label: "config.lock", reason: "EACCES" },
		]);
	});

	it("says so when there is nothing to clear", async () => {
		const notifier = new FakeNotifier();
		await service(new FakeLocks([]), notifier).run();
		expect(notifier.messages).toEqual(["No git lock files found"]);
	});
});
