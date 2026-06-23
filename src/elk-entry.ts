// Bundled separately into `elk.js` (see esbuild.config.mjs), shipped alongside
// the plugin and loaded from disk on demand when ELK layout is enabled. ELK
// (elkjs) is ~1.5MB, so keeping it out of main.js keeps the core small. The
// default export is the layout-loader array passed to
// mermaid.registerLayoutLoaders().
import elkLayouts from "@mermaid-js/layout-elk";

export default elkLayouts;
