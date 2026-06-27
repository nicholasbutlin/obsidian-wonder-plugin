// Pure domain types for git history and diffs. No I/O — the git CLI adapter
// produces raw stdout strings, and the parsers in this folder turn them into
// these structures.

export interface Commit {
	hash: string; // full SHA
	shortHash: string; // abbreviated SHA
	author: string;
	date: string; // YYYY-MM-DD
	subject: string;
}

export interface DiffCell {
	text: string; // line content, without the +/-/space prefix
	lineNo: number; // 1-based line number on that side
}

export type DiffRowKind = "context" | "add" | "del" | "change";

export interface DiffRow {
	left: DiffCell | null; // old side; null when the row only adds
	right: DiffCell | null; // new side; null when the row only deletes
	kind: DiffRowKind;
}

export interface DiffHunk {
	header: string; // the "@@ ... @@" section heading (after the ranges)
	rows: DiffRow[];
}

export interface FileDiff {
	binary: boolean; // true for binary files (no textual hunks)
	hunks: DiffHunk[];
}
