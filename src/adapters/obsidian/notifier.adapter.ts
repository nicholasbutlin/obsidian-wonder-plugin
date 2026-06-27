import { Notice } from "obsidian";
import type { Notifier } from "../../ports/notifier";

export class ObsidianNotifier implements Notifier {
	info(message: string): void {
		new Notice(message);
	}
}
