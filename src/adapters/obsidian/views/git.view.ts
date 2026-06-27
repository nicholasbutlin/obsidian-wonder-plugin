import { ItemView, WorkspaceLeaf, TFile, setIcon } from "obsidian";
import type { GitFileHistoryService } from "../../../app/git/file-history.service";
import type { GitRepoCommitsService } from "../../../app/git/repo-commits.service";
import type { GitPort } from "../../../ports/git";
import type {
	Commit,
	FileChange,
	FileDiff,
	FileStatus,
} from "../../../core/git/model";

export const GIT_VIEW_TYPE = "wonder-git";

type Tab = "file" | "commits";

const STATUS_LABEL: Record<FileStatus, string> = {
	A: "added",
	M: "modified",
	D: "deleted",
	R: "renamed",
	C: "copied",
	T: "type changed",
};

// Side panel with two tabs: a timeline of the active note's commits (each with a
// side-by-side diff), and a repo-wide commit browser (commit → changed files →
// side-by-side diff).
export class GitView extends ItemView {
	private tab: Tab = "file";
	private tabBar!: HTMLElement;
	private bodyEl!: HTMLElement;
	private lastFilePath: string | null = null;
	private repoCheck: Promise<boolean> | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private fileHistory: GitFileHistoryService,
		private repoCommits: GitRepoCommitsService,
		private git: GitPort,
	) {
		super(leaf);
	}

	getViewType(): string {
		return GIT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Wonder Git";
	}

	getIcon(): string {
		return "history";
	}

	protected async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("wonder-git");

		this.tabBar = root.createDiv({ cls: "wonder-git-tabs" });
		this.makeTab("file", "File history");
		this.makeTab("commits", "Commits");
		this.bodyEl = root.createDiv({ cls: "wonder-git-body" });

		// Re-render the file tab when the focused note changes.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				if (this.tab !== "file") return;
				const path = this.app.workspace.getActiveFile()?.path ?? null;
				if (path !== this.lastFilePath) void this.render();
			}),
		);

		await this.render();
	}

	// Reveal the file tab for a specific note (used when opened from a menu).
	async showFile(file: TFile): Promise<void> {
		this.tab = "file";
		this.lastFilePath = null; // force a re-render even if it matches
		await this.render();
		void file;
	}

	private makeTab(tab: Tab, label: string): void {
		const btn = this.tabBar.createEl("button", {
			cls: "wonder-git-tab",
			text: label,
		});
		btn.dataset.tab = tab;
		btn.addEventListener("click", () => {
			if (this.tab === tab) return;
			this.tab = tab;
			void this.render();
		});
	}

	private syncTabs(): void {
		this.tabBar
			.querySelectorAll<HTMLElement>(".wonder-git-tab")
			.forEach((el) =>
				el.toggleClass("is-active", el.dataset.tab === this.tab),
			);
	}

	private async render(): Promise<void> {
		this.syncTabs();
		this.bodyEl.empty();
		if (!(await this.ensureRepo(this.bodyEl))) return;
		if (this.tab === "file") await this.renderFileTab();
		else await this.renderCommitsTab();
	}

	// Show the right empty state when git can't be used; returns false then.
	private async ensureRepo(container: HTMLElement): Promise<boolean> {
		if (!this.git.isAvailable()) {
			this.empty(container, "Git history requires the desktop app.");
			return false;
		}
		if (!this.repoCheck) this.repoCheck = this.git.isRepo();
		if (!(await this.repoCheck)) {
			this.empty(container, "This vault is not a git repository.");
			return false;
		}
		return true;
	}

	private async renderFileTab(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		this.lastFilePath = file?.path ?? null;
		if (!file) {
			this.empty(this.bodyEl, "Open a note to see its history.");
			return;
		}

		this.bodyEl.createDiv({ cls: "wonder-git-path", text: file.path });
		const listEl = this.bodyEl.createDiv({ cls: "wonder-git-commits" });
		const detailEl = this.bodyEl.createDiv({ cls: "wonder-git-detail" });

		const commits = await this.tryRun(() =>
			this.fileHistory.history(file.path),
		);
		if (!commits) {
			this.empty(detailEl, "Couldn't read this file's history.");
			return;
		}
		if (commits.length === 0) {
			this.empty(this.bodyEl, "No commits touch this file yet.");
			return;
		}

		const select = (commit: Commit, row: HTMLElement) => {
			listEl
				.querySelectorAll(".wonder-git-commit")
				.forEach((el) => el.removeClass("is-selected"));
			row.addClass("is-selected");
			void this.showDiff(detailEl, () =>
				this.fileHistory.diff(commit.hash, file.path),
			);
		};
		commits.forEach((commit, i) => {
			const row = this.commitRow(listEl, commit);
			row.addEventListener("click", () => select(commit, row));
			if (i === 0) select(commit, row); // preselect the latest
		});
	}

	private async renderCommitsTab(): Promise<void> {
		const listEl = this.bodyEl.createDiv({ cls: "wonder-git-commits" });
		const detailEl = this.bodyEl.createDiv({ cls: "wonder-git-detail" });

		const commits = await this.tryRun(() => this.repoCommits.commits());
		if (!commits) {
			this.empty(detailEl, "Couldn't read the repository history.");
			return;
		}
		if (commits.length === 0) {
			this.empty(this.bodyEl, "No commits yet.");
			return;
		}

		const select = (commit: Commit, row: HTMLElement) => {
			listEl
				.querySelectorAll(".wonder-git-commit")
				.forEach((el) => el.removeClass("is-selected"));
			row.addClass("is-selected");
			void this.renderCommitFiles(detailEl, commit);
		};
		commits.forEach((commit) => {
			const row = this.commitRow(listEl, commit);
			row.addEventListener("click", () => select(commit, row));
		});
	}

	private async renderCommitFiles(
		container: HTMLElement,
		commit: Commit,
	): Promise<void> {
		container.empty();
		const files = await this.tryRun(() =>
			this.repoCommits.changedFiles(commit.hash),
		);
		if (!files) {
			this.empty(container, "Couldn't read this commit.");
			return;
		}
		if (files.length === 0) {
			this.empty(container, "No file changes in this commit.");
			return;
		}

		const filesEl = container.createDiv({ cls: "wonder-git-files" });
		const diffEl = container.createDiv({ cls: "wonder-git-detail" });
		const select = (change: FileChange, row: HTMLElement) => {
			filesEl
				.querySelectorAll(".wonder-git-file")
				.forEach((el) => el.removeClass("is-selected"));
			row.addClass("is-selected");
			void this.showDiff(diffEl, () =>
				this.repoCommits.diff(commit.hash, change.path),
			);
		};
		files.forEach((change, i) => {
			const row = this.fileRow(filesEl, change);
			row.addEventListener("click", () => select(change, row));
			if (i === 0) select(change, row);
		});
	}

	private commitRow(container: HTMLElement, commit: Commit): HTMLElement {
		const row = container.createDiv({ cls: "wonder-git-commit" });
		row.createSpan({ cls: "wonder-git-subject", text: commit.subject });
		const meta = row.createDiv({ cls: "wonder-git-meta" });
		meta.createSpan({ cls: "wonder-git-hash", text: commit.shortHash });
		meta.createSpan({ cls: "wonder-git-date", text: commit.date });
		meta.createSpan({ cls: "wonder-git-author", text: commit.author });
		return row;
	}

	private fileRow(container: HTMLElement, change: FileChange): HTMLElement {
		const row = container.createDiv({ cls: "wonder-git-file" });
		const badge = row.createSpan({
			cls: `wonder-git-status is-${change.status}`,
			text: change.status,
		});
		badge.setAttr("aria-label", STATUS_LABEL[change.status] ?? change.status);
		const label =
			change.status === "R" && change.oldPath
				? `${change.oldPath} → ${change.path}`
				: change.path;
		row.createSpan({ cls: "wonder-git-filepath", text: label });
		return row;
	}

	// Run a diff loader into the container, showing a spinner-ish placeholder and
	// rendering the result side-by-side.
	private async showDiff(
		container: HTMLElement,
		load: () => Promise<FileDiff>,
	): Promise<void> {
		container.empty();
		container.createDiv({ cls: "wonder-git-loading", text: "Loading diff…" });
		const diff = await this.tryRun(load);
		container.empty();
		if (!diff) {
			this.empty(container, "Couldn't load this diff.");
			return;
		}
		this.renderDiff(container, diff);
	}

	private renderDiff(container: HTMLElement, diff: FileDiff): void {
		if (diff.binary) {
			this.empty(container, "Binary file — no text diff.");
			return;
		}
		if (diff.hunks.length === 0) {
			this.empty(container, "No changes in this file for this commit.");
			return;
		}
		const grid = container.createDiv({ cls: "wonder-git-diff" });
		for (const hunk of diff.hunks) {
			const head = grid.createDiv({ cls: "wonder-git-hunk" });
			head.setText(hunk.header || "@@");
			for (const row of hunk.rows) {
				const leftSide = row.left;
				const rightSide = row.right;
				const leftDel = row.kind === "del" || row.kind === "change";
				const rightAdd = row.kind === "add" || row.kind === "change";

				grid.createDiv({
					cls: "wonder-git-num",
					text: leftSide ? String(leftSide.lineNo) : "",
				});
				grid.createDiv({
					cls: `wonder-git-code${leftDel ? " is-del" : ""}${leftSide ? "" : " is-empty"}`,
					text: leftSide ? leftSide.text : "",
				});
				grid.createDiv({
					cls: "wonder-git-num",
					text: rightSide ? String(rightSide.lineNo) : "",
				});
				grid.createDiv({
					cls: `wonder-git-code${rightAdd ? " is-add" : ""}${rightSide ? "" : " is-empty"}`,
					text: rightSide ? rightSide.text : "",
				});
			}
		}
	}

	// Await a loader, returning null (and logging) on failure so callers can show
	// a friendly empty state instead of throwing into the view.
	private async tryRun<T>(fn: () => Promise<T>): Promise<T | null> {
		try {
			return await fn();
		} catch (err) {
			console.warn("[Wonder] git command failed.", err);
			return null;
		}
	}

	private empty(container: HTMLElement, message: string): void {
		const el = container.createDiv({ cls: "wonder-git-empty" });
		setIcon(el.createSpan({ cls: "wonder-git-empty-icon" }), "git-branch");
		el.createSpan({ text: message });
	}
}
