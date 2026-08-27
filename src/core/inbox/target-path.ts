// Pure path arithmetic for moving a note into the inbox. Framework-free: the
// caller supplies an `exists` predicate over the paths it can see.
//
// The configured inbox is either vault-relative ("Areas/Inbox") or an absolute
// filesystem path ("/Users/me/Other Vault/Inbox", "~/Inbox", "C:\Inbox"), which
// may point into a different vault entirely. `classifyInbox` decides which.

// A configured inbox folder, trimmed of surrounding whitespace and slashes.
// An empty result means the vault root.
export function normalizeFolder(folder: string): string {
	return folder.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

// Does this setting name a place outside the vault? A leading slash, a `~`, a
// Windows drive letter or a UNC prefix all mean the filesystem, not the vault.
export function isAbsoluteInboxPath(folder: string): boolean {
	return /^(\/|\\\\|~($|[\\/])|[A-Za-z]:[\\/])/.test(folder.trim());
}

export type InboxTarget =
	| { kind: "vault"; folder: string }
	| { kind: "external"; folder: string };

export function classifyInbox(folder: string): InboxTarget {
	return isAbsoluteInboxPath(folder)
		? { kind: "external", folder: normalizeExternalFolder(folder) }
		: { kind: "vault", folder: normalizeFolder(folder) };
}

// An absolute inbox path, trimmed of whitespace and trailing separators. Roots
// ("/", "C:\") keep their separator, since stripping it changes what they mean.
export function normalizeExternalFolder(folder: string): string {
	const trimmed = folder.trim().replace(/[\\/]+$/, "");
	if (trimmed === "") return "/";
	if (/^[A-Za-z]:$/.test(trimmed)) return `${trimmed}\\`;
	return trimmed;
}

// The separator a path is already written with, so a Windows setting keeps its
// backslashes. Mixed or slash-only paths use "/", which Node accepts anywhere.
function separatorOf(dir: string): string {
	return dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
}

// Is the file already sitting directly in the inbox folder?
export function isInFolder(filePath: string, folder: string): boolean {
	const parent = filePath.slice(0, filePath.lastIndexOf("/") + 1);
	const normalized = normalizeFolder(folder);
	return parent === (normalized === "" ? "" : `${normalized}/`);
}

// The first free path for `fileName` under `join`, suffixed " 1", " 2", … when
// a note of that name is already there, so a move never overwrites.
function freePath(
	join: (name: string) => string,
	fileName: string,
	exists: (path: string) => boolean,
): string {
	const dot = fileName.lastIndexOf(".");
	const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
	const suffix = dot > 0 ? fileName.slice(dot) : "";

	let candidate = join(fileName);
	for (let n = 1; exists(candidate); n += 1) {
		candidate = join(`${stem} ${n}${suffix}`);
	}
	return candidate;
}

// The vault-relative destination for `fileName` inside `folder`.
export function inboxTargetPath(
	folder: string,
	fileName: string,
	exists: (path: string) => boolean,
): string {
	const normalized = normalizeFolder(folder);
	return freePath(
		(name) => (normalized === "" ? name : `${normalized}/${name}`),
		fileName,
		exists,
	);
}

// The absolute destination for `fileName` inside an already-resolved `dir`.
export function externalTargetPath(
	dir: string,
	fileName: string,
	exists: (path: string) => boolean,
): string {
	const sep = separatorOf(dir);
	const base = dir.replace(/[\\/]+$/, "");
	return freePath((name) => `${base}${sep}${name}`, fileName, exists);
}
