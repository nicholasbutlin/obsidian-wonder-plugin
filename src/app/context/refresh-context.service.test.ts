import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { RefreshContextService } from "./refresh-context.service";
import type { VaultPort } from "../../ports/vault";
import type { WorkspacePort } from "../../ports/workspace";
import type { Notifier } from "../../ports/notifier";
import type { SettingsStore } from "../../ports/settings-store";
import type { WonderSettings } from "../../settings";

function makeTFile(path: string, basename: string): TFile {
	const file = new TFile();
	file.path = path;
	file.basename = basename;
	return file;
}

function makeService(activeFile: TFile | null, content: string) {
	let written = content;
	const vault: VaultPort = {
		read: async () => written,
		process: async (_f, fn) => {
			written = fn(written);
			return written;
		},
		getFileByPath: () => null,
	};
	const workspace = {
		getActiveFile: () => activeFile,
		refreshKanbanBoards: () => {},
	} as WorkspacePort;
	const notifier: Notifier = { info: () => {} };
	const settings: SettingsStore<WonderSettings> = {
		get: () =>
			({
				contextHeading: "Context",
				contextQuery: "not done",
			}) as WonderSettings,
		update: async () => {},
		save: async () => {},
	};
	const service = new RefreshContextService(
		vault,
		workspace,
		notifier,
		settings,
	);
	return { service, read: () => written };
}

describe("RefreshContextService.run", () => {
	it("inserts the Context block into the active note, leaving the top intact", async () => {
		const { service, read } = makeService(
			makeTFile("Daily.md", "Daily"),
			"# Daily\nnotes\n",
		);

		await service.run();

		const out = read();
		expect(out.startsWith("# Daily\nnotes\n")).toBe(true);
		expect(out).toContain("<!-- wonder:context:start -->");
		expect(out).toContain("## Context");
		expect(out).toContain("```tasks\nnot done\n```");
	});

	it("does nothing when there is no active note", async () => {
		const { service, read } = makeService(null, "untouched");
		await service.run();
		expect(read()).toBe("untouched");
	});
});
