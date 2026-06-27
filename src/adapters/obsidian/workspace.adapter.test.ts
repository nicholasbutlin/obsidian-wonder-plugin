import { describe, it, expect } from "vitest";
import { App } from "obsidian";
import { ObsidianWorkspace } from "./workspace.adapter";

// A stand-in for an open Kanban board leaf, recording setViewData calls and the
// view's synced data (Kanban reparses the board from view.data).
class FakeKanbanLeaf {
	view: {
		file: { path: string };
		data: string;
		setViewData: (data: string, clear: boolean) => void;
	};
	setViewDataCalls = 0;

	constructor(path: string) {
		this.view = {
			file: { path },
			data: "",
			setViewData: (data) => {
				this.view.data = data;
				this.setViewDataCalls++;
			},
		};
	}
}

function makeWorkspace(leaves: FakeKanbanLeaf[]): ObsidianWorkspace {
	const app = {
		workspace: { getLeavesOfType: () => leaves },
	} as unknown as App;
	return new ObsidianWorkspace(app);
}

describe("ObsidianWorkspace.refreshKanbanBoards", () => {
	it("syncs and re-renders an open Kanban board showing the file", () => {
		const leaf = new FakeKanbanLeaf("ToDo Auto.md");

		makeWorkspace([leaf]).refreshKanbanBoards(
			"ToDo Auto.md",
			"## ToDo\n- [ ] ship it 📅 2026-06-20\n",
		);

		expect(leaf.setViewDataCalls).toBe(1);
		expect(leaf.view.data).toContain("📅 2026-06-20");
		expect(leaf.view.data).not.toContain("@{");
	});

	it("does not touch a Kanban board showing a different file", () => {
		const other = new FakeKanbanLeaf("ToDo General.md");

		makeWorkspace([other]).refreshKanbanBoards("ToDo Auto.md", "anything");

		expect(other.setViewDataCalls).toBe(0);
	});
});
