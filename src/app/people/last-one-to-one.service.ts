import { TFile } from "obsidian";
import {
	isPersonPage,
	newestEntryDate,
	readProperty,
	setProperty,
} from "../../core/people/last-one-to-one";
import type { VaultPort } from "../../ports/vault";
import type { Notifier } from "../../ports/notifier";
import type { SettingsStore } from "../../ports/settings-store";
import type { WonderSettings } from "../../settings";

// Application service: keep each person page's "last one-to-one" property equal
// to the newest dated entry heading in the note. Runs on save for the edited
// page, and across the folder on demand.
export class LastOneToOneService {
	constructor(
		private vault: VaultPort,
		private notifier: Notifier,
		private settings: SettingsStore<WonderSettings>,
	) {}

	// Returns true when the property was written. A page with no dated entry is
	// left alone rather than given an invented date.
	async run(file: TFile): Promise<boolean> {
		const { syncLastOneToOne, lastOneToOneProperty } = this.settings.get();
		if (!syncLastOneToOne || !this.inScope(file)) return false;

		const content = await this.vault.read(file);
		if (!isPersonPage(content)) return false;
		const date = newestEntryDate(content);
		if (!date) return false;
		// Cheap guard: skip the write when nothing changed, so a no-op run does not
		// churn `updated` stamps or Sync. The authoritative value is recomputed
		// inside process(), which reads the file again under its own lock.
		if (readProperty(content, lastOneToOneProperty) === date) return false;

		const written = await this.vault.process(file, (data) => {
			const current = newestEntryDate(data);
			return current ? setProperty(data, lastOneToOneProperty, current) : data;
		});
		return written !== content;
	}

	async runAll(files: TFile[]): Promise<number> {
		let updated = 0;
		for (const file of files) {
			if (await this.run(file)) updated += 1;
		}
		this.notifier.info(
			updated === 0
				? "Wonder: person pages already up to date."
				: `Wonder: updated ${updated} person ${updated === 1 ? "page" : "pages"}.`,
		);
		return updated;
	}

	// Person pages only: inside the configured folder, and not one of the
	// `_`-prefixed reference pages that sit alongside them.
	private inScope(file: TFile): boolean {
		if (file.extension !== "md") return false;
		if (file.basename.startsWith("_")) return false;
		const folder = this.settings.get().peopleFolder.replace(/\/+$/, "");
		return folder === "" || file.path.startsWith(`${folder}/`);
	}
}
