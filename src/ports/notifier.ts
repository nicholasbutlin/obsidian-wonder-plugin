// Driven port: user-facing transient messages. Wraps Obsidian's Notice.
export interface Notifier {
	info(message: string): void;
}
