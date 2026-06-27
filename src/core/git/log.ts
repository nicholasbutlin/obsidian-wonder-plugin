import type { Commit } from "./model";

// The git pretty-format the CLI adapter requests. Fields are separated by the
// ASCII unit separator (0x1f) and records by the record separator (0x1e), so
// neither commit subjects nor author names can collide with the delimiters.
export const LOG_FIELD = "\x1f";
export const LOG_RECORD = "\x1e";
export const LOG_FORMAT = "%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1e";

// Parse `git log` output produced with LOG_FORMAT into commits.
export function parseGitLog(stdout: string): Commit[] {
	return stdout
		.split(LOG_RECORD)
		.map((record) => record.replace(/^\s+/, "")) // drop the inter-record newline
		.filter((record) => record.length > 0)
		.map((record) => {
			const parts = record.split(LOG_FIELD);
			return {
				hash: parts[0] ?? "",
				shortHash: parts[1] ?? "",
				author: parts[2] ?? "",
				date: parts[3] ?? "",
				// A subject can't contain LOG_FIELD, but join defensively anyway.
				subject: parts.slice(4).join(LOG_FIELD),
			};
		});
}
