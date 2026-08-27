import { TFile } from "obsidian";
import {
	classifyInbox,
	externalTargetPath,
	inboxTargetPath,
	isInFolder,
} from "../../core/inbox/target-path";
import type { ExternalFileMoverPort } from "../../ports/external-file-mover";
import type { FileMoverPort } from "../../ports/file-mover";
import type { Notifier } from "../../ports/notifier";
import type { SettingsStore } from "../../ports/settings-store";
import type { WonderSettings } from "../../settings";

// Application service: move notes into the configured inbox, from the command
// palette or the file explorer's right-click menu. The folder is created on
// demand and name clashes are suffixed rather than overwritten.
//
// The inbox is either vault-relative, in which case Obsidian rewrites inbound
// links, or an absolute filesystem path — possibly another vault — in which
// case the note leaves this vault and inbound links are left dangling.
export class MoveToInboxService {
	constructor(
		private mover: FileMoverPort,
		private notifier: Notifier,
		private settings: SettingsStore<WonderSettings>,
		private external: ExternalFileMoverPort,
	) {}

	async run(files: TFile[]): Promise<number> {
		const target = classifyInbox(this.settings.get().inboxFolder);
		return target.kind === "external"
			? this.runExternal(files, target.folder)
			: this.runInVault(files, target.folder);
	}

	private async runInVault(files: TFile[], folder: string): Promise<number> {
		const pending = files.filter((file) => !isInFolder(file.path, folder));
		const label = folder === "" ? "the vault root" : folder;

		if (pending.length === 0) {
			this.notifier.info(`Wonder: already in ${label}.`);
			return 0;
		}

		await this.mover.ensureFolder(folder);
		return this.moveEach(pending, label, (file) =>
			this.mover.move(
				file,
				inboxTargetPath(folder, file.name, (path) => this.mover.exists(path)),
			),
		);
	}

	private async runExternal(files: TFile[], folder: string): Promise<number> {
		if (!this.external.isAvailable()) {
			this.notifier.info(
				"Wonder: an absolute inbox path needs the desktop app. Set a vault-relative folder instead.",
			);
			return 0;
		}
		if (files.length === 0) return 0;

		let dir: string;
		try {
			dir = this.external.resolve(folder);
			await this.external.ensureFolder(dir);
		} catch (error) {
			this.notifier.info(`Wonder: cannot open ${folder} — ${reason(error)}.`);
			return 0;
		}

		return this.moveEach(
			files,
			dir,
			(file) =>
				this.external.move(
					file,
					externalTargetPath(dir, file.name, (path) =>
						this.external.exists(path),
					),
				),
			// The note is no longer in this vault, so nothing Obsidian knows about
			// can be repointed at it.
			" Links to them were not updated.",
		);
	}

	private async moveEach(
		pending: TFile[],
		label: string,
		move: (file: TFile) => Promise<void>,
		note = "",
	): Promise<number> {
		let moved = 0;
		const failed: string[] = [];
		for (const file of pending) {
			try {
				await move(file);
				moved += 1;
			} catch (error) {
				failed.push(`${file.name} (${reason(error)})`);
			}
		}

		this.notifier.info(
			failed.length === 0
				? `Wonder: moved ${moved} ${moved === 1 ? "note" : "notes"} to ${label}.${moved > 0 ? note : ""}`
				: `Wonder: moved ${moved} of ${pending.length}; failed: ${failed.join(", ")}.`,
		);
		return moved;
	}
}

function reason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
