import type { MermaidAPI } from "../core/mermaid/config";

// Driven port: owns Mermaid for the plugin — resolving a configured instance,
// swapping the global `window.mermaid`, and restoring it on unload.
export interface MermaidEnginePort {
	// A ready-to-render Mermaid for the current settings.
	getInstance(): Promise<MermaidAPI>;
	// Install the downloaded Mermaid as the global (or restore the built-in).
	syncGlobal(): Promise<void>;
	// Hand the global back to Obsidian and drop cached instances (onunload).
	reset(): void;
}
