#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const TARGET = process.argv[2];
const BUMP_TYPES = new Set(["patch", "minor"]);
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const MUPT_VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-mupt\.(\d+))?$/;

if (!TARGET || (!BUMP_TYPES.has(TARGET) && !VERSION_RE.test(TARGET))) {
	console.error("Usage: node scripts/version-npm-packages.mjs <patch|minor|x.y.z[-prerelease]>");
	process.exit(1);
}

const packagePaths = {
	ai: "packages/ai/package.json",
	agent: "packages/agent/package.json",
	codingAgent: "packages/coding-agent/package.json",
};

function readPackageJson(path) {
	return JSON.parse(readFileSync(path, "utf-8"));
}

function writePackageJson(path, data) {
	writeFileSync(path, `${JSON.stringify(data, null, "\t")}\n`);
}

function getCurrentVersion(packages) {
	const versions = new Set(Object.values(packages).map((pkg) => pkg.version));
	if (versions.size !== 1) {
		console.error("Expected Mupt packages to share one version:");
		for (const pkg of Object.values(packages)) {
			console.error(`  ${pkg.name}: ${pkg.version}`);
		}
		process.exit(1);
	}
	return packages.ai.version;
}

function bumpVersion(version, bumpType) {
	const match = MUPT_VERSION_RE.exec(version);
	if (!match) {
		throw new Error(`Unsupported version format for ${bumpType} bump: ${version}`);
	}

	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	const muptRevision = match[4] ? Number(match[4]) : null;

	if (bumpType === "patch") {
		if (muptRevision !== null) {
			return `${major}.${minor}.${patch}-mupt.${muptRevision + 1}`;
		}
		return `${major}.${minor}.${patch + 1}`;
	}

	if (muptRevision !== null) {
		return `${major}.${minor + 1}.0-mupt.1`;
	}
	return `${major}.${minor + 1}.0`;
}

const packages = {
	ai: readPackageJson(packagePaths.ai),
	agent: readPackageJson(packagePaths.agent),
	codingAgent: readPackageJson(packagePaths.codingAgent),
};

const nextVersion = BUMP_TYPES.has(TARGET) ? bumpVersion(getCurrentVersion(packages), TARGET) : TARGET;

packages.ai.name = "@mupt-ai/pi-ai";
packages.agent.name = "@mupt-ai/pi-agent-core";
packages.codingAgent.name = "@mupt-ai/pi-coding-agent";

packages.ai.version = nextVersion;
packages.agent.version = nextVersion;
packages.codingAgent.version = nextVersion;

packages.agent.dependencies["@mupt-ai/pi-ai"] = `^${nextVersion}`;
delete packages.agent.dependencies["@earendil-ai/pi-ai"];
delete packages.agent.dependencies["@earendil-works/pi-ai"];

packages.codingAgent.dependencies["@mupt-ai/pi-agent-core"] = `^${nextVersion}`;
packages.codingAgent.dependencies["@mupt-ai/pi-ai"] = `^${nextVersion}`;
delete packages.codingAgent.dependencies["@earendil-ai/pi-agent-core"];
delete packages.codingAgent.dependencies["@earendil-ai/pi-ai"];
delete packages.codingAgent.dependencies["@earendil-works/pi-agent-core"];
delete packages.codingAgent.dependencies["@earendil-works/pi-ai"];

writePackageJson(packagePaths.ai, packages.ai);
writePackageJson(packagePaths.agent, packages.agent);
writePackageJson(packagePaths.codingAgent, packages.codingAgent);

console.log(`Updated Mupt npm packages to ${nextVersion}`);
for (const pkg of Object.values(packages)) {
	console.log(`  ${pkg.name}: ${pkg.version}`);
}
