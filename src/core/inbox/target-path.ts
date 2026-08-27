// Pure path arithmetic for moving a note into the inbox folder. Framework-free:
// the caller supplies an `exists` predicate over vault-relative paths.

// A configured inbox folder, trimmed of surrounding whitespace and slashes.
// An empty result means the vault root.
export function normalizeFolder(folder: string): string {
	return folder.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

// Is the file already sitting directly in the inbox folder?
export function isInFolder(filePath: string, folder: string): boolean {
	const parent = filePath.slice(0, filePath.lastIndexOf("/") + 1);
	const normalized = normalizeFolder(folder);
	return parent === (normalized === "" ? "" : `${normalized}/`);
}

// The destination for `fileName` inside `folder`, suffixed " 1", " 2", … when a
// note of that name is already there, so a move never overwrites.
export function inboxTargetPath(
	folder: string,
	fileName: string,
	exists: (path: string) => boolean,
): string {
	const normalized = normalizeFolder(folder);
	const dot = fileName.lastIndexOf(".");
	const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
	const suffix = dot > 0 ? fileName.slice(dot) : "";
	const at = (name: string) =>
		normalized === "" ? name : `${normalized}/${name}`;

	let candidate = at(fileName);
	for (let n = 1; exists(candidate); n += 1) {
		candidate = at(`${stem} ${n}${suffix}`);
	}
	return candidate;
}
