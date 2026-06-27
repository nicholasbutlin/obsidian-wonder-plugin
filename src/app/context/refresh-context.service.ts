import {
	buildContextBlock,
	upsertContextSection,
} from "../../core/context/section";
import type { VaultPort } from "../../ports/vault";
import type { WorkspacePort } from "../../ports/workspace";
import type { Notifier } from "../../ports/notifier";
import type { SettingsStore } from "../../ports/settings-store";
import type { WonderSettings } from "../../settings";

// Application service: insert or refresh the marked Context section at the bottom
// of the active note, leaving everything above it untouched.
export class RefreshContextService {
	constructor(
		private vault: VaultPort,
		private workspace: WorkspacePort,
		private notifier: Notifier,
		private settings: SettingsStore<WonderSettings>,
	) {}

	async run(): Promise<void> {
		const file = this.workspace.getActiveFile();
		if (!file) {
			this.notifier.info("Wonder: open a note to refresh its Context section.");
			return;
		}
		const { contextHeading, contextQuery } = this.settings.get();
		const block = buildContextBlock(contextHeading, contextQuery);
		await this.vault.process(file, (data) => upsertContextSection(data, block));
	}
}
