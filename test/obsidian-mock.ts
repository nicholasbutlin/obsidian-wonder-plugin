// Minimal mock of the parts of the `obsidian` module the plugin imports.
// Vitest aliases `obsidian` to this file (see vitest.config.ts).

export class TAbstractFile {
	path = "";
}

export class TFile extends TAbstractFile {
	basename = "";
}

export class Notice {
	constructor(public message: string) {}
}

export class App {
	metadataCache = {
		getFileCache(_file: TFile): unknown {
			return null;
		},
	};
}
export class Editor {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class ItemView {}
export class WorkspaceLeaf {}
export class MarkdownView {}
export class TextFileView {}
export class TFolder extends TAbstractFile {}

export function setIcon(_parent: unknown, _icon: string): void {}

export async function loadMermaid(): Promise<unknown> {
	throw new Error("loadMermaid is not available in tests");
}

export function requestUrl(_request: unknown): Promise<{ text: string }> {
	throw new Error("requestUrl is not available in tests");
}
