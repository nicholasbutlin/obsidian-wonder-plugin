// Driven port: keyed debounce. The adapter owns the timer table and self-
// registers teardown so pending work is cancelled on unload.
export interface Scheduler {
	// (Re)start the timer for `key`; only the last call within `ms` runs `fn`.
	debounce(key: string, fn: () => void, ms: number): void;
	clearAll(): void;
}
