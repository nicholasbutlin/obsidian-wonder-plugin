import { readFileSync, writeFileSync } from "fs";

// Version comes from semantic-release (argv) or `npm version` (env var).
const targetVersion = process.argv[2] || process.env.npm_package_version;

if (!targetVersion) {
	throw new Error(
		"No target version: pass it as an argument or run via `npm version`."
	);
}

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
