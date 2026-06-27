import type { FileChange, FileStatus } from "./model";

// Parse `git diff-tree --name-status` output into file changes. Each line is a
// tab-separated status code and one or two paths:
//   M\tpath              (modified)
//   A\tpath              (added)
//   D\tpath              (deleted)
//   R100\told\tnew       (renamed, with a similarity score we discard)
//   C075\tsrc\tdest      (copied)
export function parseNameStatus(stdout: string): FileChange[] {
	const changes: FileChange[] = [];
	for (const line of stdout.split("\n")) {
		if (!line.trim()) continue;
		const parts = line.split("\t");
		const code = parts[0]?.[0] as FileStatus | undefined;
		if (!code) continue;
		if ((code === "R" || code === "C") && parts.length >= 3) {
			changes.push({ status: code, oldPath: parts[1], path: parts[2] });
		} else if (parts.length >= 2) {
			changes.push({ status: code, path: parts[1] });
		}
	}
	return changes;
}
