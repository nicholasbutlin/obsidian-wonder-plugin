import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import WonderPlugin from "./main";

function makeTFile(path: string, basename: string): TFile {
	const file = new TFile();
	file.path = path;
	file.basename = basename;
	return file;
}

describe("WonderPlugin.refreshContext", () => {
	function makeContextPlugin(activeFile: TFile | null, content: string) {
		const plugin = new (WonderPlugin as never as { new (): WonderPlugin })();
		let written = content;
		(plugin as unknown as { settings: unknown }).settings = {
			contextHeading: "Context",
			contextQuery: "not done",
		};
		(plugin as unknown as { app: unknown }).app = {
			workspace: { getActiveFile: () => activeFile },
			vault: {
				process: async (_f: TFile, fn: (d: string) => string) => {
					written = fn(written);
					return written;
				},
			},
		};
		return { plugin, read: () => written };
	}

	it("inserts the Context block into the active note, leaving the top intact", async () => {
		const { plugin, read } = makeContextPlugin(
			makeTFile("Daily.md", "Daily"),
			"# Daily\nnotes\n",
		);

		await plugin.refreshContext();

		const out = read();
		expect(out.startsWith("# Daily\nnotes\n")).toBe(true);
		expect(out).toContain("<!-- wonder:context:start -->");
		expect(out).toContain("## Context");
		expect(out).toContain("```tasks\nnot done\n```");
	});

	it("does nothing when there is no active note", async () => {
		const { plugin, read } = makeContextPlugin(null, "untouched");
		await plugin.refreshContext();
		expect(read()).toBe("untouched");
	});
});
