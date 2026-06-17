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
