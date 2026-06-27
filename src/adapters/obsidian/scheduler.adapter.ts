import { Plugin } from "obsidian";
import type { Scheduler } from "../../ports/scheduler";

// Keyed debounce backed by setTimeout. Owns the timer table and registers its
// own teardown with the plugin, so pending timers are cleared on unload.
export class ObsidianScheduler implements Scheduler {
	private timers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(plugin: Plugin) {
		plugin.register(() => this.clearAll());
	}

	debounce(key: string, fn: () => void, ms: number): void {
		const pending = this.timers.get(key);
		if (pending) clearTimeout(pending);
		this.timers.set(
			key,
			setTimeout(() => {
				this.timers.delete(key);
				fn();
			}, ms),
		);
	}

	clearAll(): void {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
	}
}
