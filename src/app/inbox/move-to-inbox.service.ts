import { TFile } from "obsidian";
import {
	inboxTargetPath,
	isInFolder,
	normalizeFolder,
} from "../../core/inbox/target-path";
import type { FileMoverPort } from "../../ports/file-mover";
import type { Notifier } from "../../ports/notifier";
import type { SettingsStore } from "../../ports/settings-store";
import type { WonderSettings } from "../../settings";

// Application service: move notes into the configured inbox folder, from the
// command palette or the file explorer's right-click menu. The folder is
// created on demand and name clashes are suffixed rather than overwritten.
export class MoveToInboxService {
	constructor(
		private mover: FileMoverPort,
		private notifier: Notifier,
		private settings: SettingsStore<WonderSettings>,
	) {}

	async run(files: TFile[]): Promise<number> {
		const folder = normalizeFolder(this.settings.get().inboxFolder);
		const pending = files.filter((file) => !isInFolder(file.path, folder));
		const label = folder === "" ? "the vault root" : folder;

		if (pending.length === 0) {
			this.notifier.info(`Wonder: already in ${label}.`);
			return 0;
		}

		await this.mover.ensureFolder(folder);

		let moved = 0;
		const failed: string[] = [];
		for (const file of pending) {
			const target = inboxTargetPath(folder, file.name, (path) =>
				this.mover.exists(path),
			);
			try {
				await this.mover.move(file, target);
				moved += 1;
			} catch (error) {
				failed.push(
					`${file.name} (${error instanceof Error ? error.message : String(error)})`,
				);
			}
		}

		this.notifier.info(
			failed.length === 0
				? `Wonder: moved ${moved} ${moved === 1 ? "note" : "notes"} to ${label}.`
				: `Wonder: moved ${moved} of ${pending.length}; failed: ${failed.join(", ")}.`,
		);
		return moved;
	}
}
