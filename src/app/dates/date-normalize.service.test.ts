import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { DateNormalizeService } from "./date-normalize.service";
import type { VaultPort } from "../../ports/vault";
import type { WorkspacePort } from "../../ports/workspace";

// In-memory VaultPort with a write counter so we can assert the no-op guard.
class FakeVault implements VaultPort {
	private contents = new Map<TFile, string>();
	processCalls = 0;

	addFile(path: string, content: string): TFile {
		const file = new TFile();
		file.path = path;
		this.contents.set(file, content);
		return file;
	}

	async read(file: TFile): Promise<string> {
		return this.contents.get(file) ?? "";
	}

	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		this.processCalls++;
		const next = fn(this.contents.get(file) ?? "");
		this.contents.set(file, next);
		return next;
	}

	getFileByPath(): TFile | null {
		return null;
	}
}

// Records refreshKanbanBoards calls so we can assert when a refresh is requested.
class FakeWorkspace implements WorkspacePort {
	calls: { path: string; content: string }[] = [];
	refreshKanbanBoards(filePath: string, content: string): void {
		this.calls.push({ path: filePath, content });
	}
}

function makeService(vault: FakeVault, workspace = new FakeWorkspace()) {
	return { service: new DateNormalizeService(vault, workspace), workspace };
}

describe("DateNormalizeService.run", () => {
	it("rewrites brace dates on a board file", async () => {
		const vault = new FakeVault();
		const board = vault.addFile(
			"ToDo Auto.md",
			"## ToDo\n- [ ] ship it @{2026-06-20}\n",
		);

		await makeService(vault).service.run(board);

		expect(await vault.read(board)).toBe(
			"## ToDo\n- [ ] ship it 📅 2026-06-20\n",
		);
	});

	it("does not write when there is nothing to convert", async () => {
		const vault = new FakeVault();
		const board = vault.addFile(
			"ToDo Auto.md",
			"## ToDo\n- [ ] already 📅 2026-06-20 @[[2026-03-27]]\n",
		);

		await makeService(vault).service.run(board);

		expect(vault.processCalls).toBe(0);
	});

	it("leaves the %% kanban:settings %% block untouched", async () => {
		const vault = new FakeVault();
		const settings =
			'%% kanban:settings\n```\n{"kanban-plugin":"board"}\n```\n%%\n';
		const board = vault.addFile(
			"ToDo Auto.md",
			`## ToDo\n- [ ] ship it @{2026-06-20}\n\n${settings}`,
		);

		await makeService(vault).service.run(board);

		expect(await vault.read(board)).toContain(settings);
	});

	it("requests a board refresh with the reconciled content after a change", async () => {
		const vault = new FakeVault();
		const board = vault.addFile(
			"ToDo Auto.md",
			"## ToDo\n- [ ] ship it @{2026-06-20}\n",
		);

		const { service, workspace } = makeService(vault);
		await service.run(board);

		expect(workspace.calls).toHaveLength(1);
		expect(workspace.calls[0].path).toBe("ToDo Auto.md");
		expect(workspace.calls[0].content).toContain("📅 2026-06-20");
		expect(workspace.calls[0].content).not.toContain("@{");
	});

	it("does not refresh when there was no change to write", async () => {
		const vault = new FakeVault();
		const board = vault.addFile(
			"ToDo Auto.md",
			"## ToDo\n- [ ] already 📅 2026-06-20\n",
		);

		const { service, workspace } = makeService(vault);
		await service.run(board);

		expect(workspace.calls).toHaveLength(0);
	});
});
