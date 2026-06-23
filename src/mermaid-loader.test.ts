import { describe, expect, it } from "vitest";
import {
	cdnBaseUrl,
	createMermaidId,
	getMermaidConfig,
	rewriteChunkImports,
	rewriteRootImports,
} from "./mermaid-loader";

describe("cdnBaseUrl", () => {
	it("uses the unversioned path for 'latest'", () => {
		expect(cdnBaseUrl("latest")).toBe(
			"https://cdn.jsdelivr.net/npm/mermaid/dist/",
		);
	});

	it("pins an explicit version", () => {
		expect(cdnBaseUrl("11.15.0")).toBe(
			"https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/",
		);
	});
});

describe("rewriteChunkImports", () => {
	const base = "https://cdn.jsdelivr.net/npm/mermaid/dist/";

	it("rewrites relative chunk imports to absolute CDN URLs", () => {
		const src = `import {a} from "./chunks/x.mjs";\nimport('./y.mjs')`;
		const out = rewriteChunkImports(src, base);
		expect(out).toContain(`"${base}chunks/x.mjs"`);
		expect(out).toContain(`'${base}y.mjs'`);
	});

	it("leaves absolute imports untouched", () => {
		const src = `import x from "https://example.com/x.mjs";`;
		expect(rewriteChunkImports(src, base)).toBe(src);
	});
});

describe("rewriteRootImports", () => {
	it("rewrites root-relative /npm/ imports to absolute jsDelivr URLs", () => {
		const src = `import('/npm/@mermaid-js/layout-elk@0.2.1/dist/chunks/render-X.mjs/+esm')`;
		expect(rewriteRootImports(src)).toBe(
			`import('https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0.2.1/dist/chunks/render-X.mjs/+esm')`,
		);
	});

	it("leaves already-absolute imports untouched", () => {
		const src = `import x from "https://cdn.jsdelivr.net/npm/x/+esm";`;
		expect(rewriteRootImports(src)).toBe(src);
	});
});

describe("getMermaidConfig", () => {
	it("includes the ELK layout only when enabled", () => {
		expect(getMermaidConfig(true, true, false).layout).toBe("elk");
		expect(getMermaidConfig(true, false, false).layout).toBeUndefined();
	});

	it("includes the hand-drawn look only when enabled", () => {
		expect(getMermaidConfig(true, true, true).look).toBe("handDrawn");
		expect(getMermaidConfig(true, true, false).look).toBeUndefined();
	});

	it("sets an explicit theme only when not following Obsidian", () => {
		expect(getMermaidConfig(true, false, false).theme).toBeUndefined();
		expect(getMermaidConfig(false, false, false).theme).toBe("default");
	});
});

describe("createMermaidId", () => {
	it("prefixes a unique id", () => {
		const id = createMermaidId("wonder");
		expect(id.startsWith("wonder-")).toBe(true);
		expect(id).not.toBe(createMermaidId("wonder"));
	});
});
