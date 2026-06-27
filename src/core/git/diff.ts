import type { DiffCell, DiffHunk, FileDiff } from "./model";

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

// Parse a unified `git diff`/`git show` patch for a single file into hunks of
// side-by-side rows. Consecutive deletions and additions within a hunk are
// paired column-for-column: a delete with a matching add becomes one "change"
// row, surplus deletes/adds become "del"/"add" rows.
export function parseUnifiedDiff(stdout: string): FileDiff {
	if (/^Binary files .* differ$/m.test(stdout) || /^GIT binary patch$/m.test(stdout)) {
		return { binary: true, hunks: [] };
	}

	const lines = stdout.split("\n");
	const hunks: DiffHunk[] = [];

	let current: DiffHunk | null = null;
	let oldNo = 0;
	let newNo = 0;
	let dels: DiffCell[] = [];
	let adds: DiffCell[] = [];

	// Pair buffered deletions and additions into rows, then clear the buffers.
	const flush = () => {
		if (!current) return;
		const n = Math.max(dels.length, adds.length);
		for (let i = 0; i < n; i++) {
			const left = dels[i] ?? null;
			const right = adds[i] ?? null;
			current.rows.push({
				left,
				right,
				kind: left && right ? "change" : left ? "del" : "add",
			});
		}
		dels = [];
		adds = [];
	};

	for (const line of lines) {
		const header = HUNK_HEADER.exec(line);
		if (header) {
			flush();
			current = { header: header[3].trim(), rows: [] };
			hunks.push(current);
			oldNo = parseInt(header[1], 10);
			newNo = parseInt(header[2], 10);
			continue;
		}
		if (!current) continue; // header noise before the first hunk

		const marker = line[0];
		if (marker === "+") {
			adds.push({ text: line.slice(1), lineNo: newNo++ });
		} else if (marker === "-") {
			dels.push({ text: line.slice(1), lineNo: oldNo++ });
		} else if (marker === " ") {
			flush();
			current.rows.push({
				left: { text: line.slice(1), lineNo: oldNo++ },
				right: { text: line.slice(1), lineNo: newNo++ },
				kind: "context",
			});
		} else if (marker === "\\") {
			// "\ No newline at end of file" — not a content line.
			continue;
		} else {
			// A blank line inside a hunk is encoded as " "; anything else (e.g. a
			// following "diff --git") ends the current hunk.
			flush();
			current = null;
		}
	}
	flush();

	return { binary: false, hunks };
}
