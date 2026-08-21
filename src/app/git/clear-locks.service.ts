import {
	describeClearOutcome,
	triageLocks,
	type ClearOutcome,
} from "../../core/git/locks";
import type { GitLocksPort } from "../../ports/git-locks";
import type { Notifier } from "../../ports/notifier";

// Application service: clear the stale `*.lock` files that stop Obsidian Git
// (and every other git client) from working after a git process died without
// cleaning up. Locks that were touched moments ago are left alone.
export class GitClearLocksService {
	constructor(
		private locks: GitLocksPort,
		private notifier: Notifier,
		private now: () => number = () => Date.now(),
	) {}

	async run(): Promise<ClearOutcome> {
		const outcome: ClearOutcome = { removed: [], skipped: [], failed: [] };
		const { stale, fresh } = triageLocks(await this.locks.list(), this.now());
		outcome.skipped = fresh.map((lock) => lock.label);

		for (const lock of stale) {
			try {
				await this.locks.remove(lock.path);
				outcome.removed.push(lock.label);
			} catch (error) {
				outcome.failed.push({
					label: lock.label,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
		}

		this.notifier.info(describeClearOutcome(outcome));
		return outcome;
	}
}
