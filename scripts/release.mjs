#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TARGET = process.argv[2];
const BUMP_TYPES = new Set(["patch", "minor"]);
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const VERSION_FILES = [
	"packages/ai/package.json",
	"packages/agent/package.json",
	"packages/coding-agent/package.json",
	"package-lock.json",
];

if (!TARGET || (!BUMP_TYPES.has(TARGET) && !VERSION_RE.test(TARGET))) {
	console.error("Usage: node scripts/release.mjs <patch|minor|x.y.z[-prerelease]>");
	process.exit(1);
}

function shellQuote(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function run(command, options = {}) {
	console.log(`$ ${command}`);
	try {
		return execSync(command, {
			encoding: "utf-8",
			stdio: options.silent ? "pipe" : "inherit",
			...options,
		});
	} catch (error) {
		if (!options.ignoreError) {
			console.error(`Command failed: ${command}`);
			process.exit(1);
		}
		return null;
	}
}

function getPackageVersion() {
	return JSON.parse(readFileSync("packages/ai/package.json", "utf-8")).version;
}

function getStatus() {
	return run("git status --porcelain", { silent: true })?.trim() ?? "";
}

console.log("\n=== Mupt release from main ===\n");

const branch = run("git branch --show-current", { silent: true }).trim();
if (branch !== "main") {
	console.error(`Error: releases must run from main, currently on ${branch || "detached HEAD"}.`);
	process.exit(1);
}

const initialStatus = getStatus();
if (initialStatus) {
	console.error("Error: working tree is not clean. Commit or discard changes first.");
	console.error(initialStatus);
	process.exit(1);
}

run(`node scripts/version-npm-packages.mjs ${shellQuote(TARGET)}`);
run("npm install --package-lock-only --ignore-scripts");

const version = getPackageVersion();
const tag = `v${version}`;

const releaseStatus = getStatus();
if (releaseStatus) {
	run(`git add -- ${VERSION_FILES.map(shellQuote).join(" ")}`);
	run(`git commit -m ${shellQuote(`chore: release mupt ${tag}`)}`);
} else {
	console.log(`No version file changes; tagging current main as ${tag}.`);
}

const localTagExists = run(`git rev-parse -q --verify refs/tags/${shellQuote(tag)}`, {
	silent: true,
	ignoreError: true,
});
if (localTagExists) {
	console.error(`Error: local tag ${tag} already exists.`);
	process.exit(1);
}

run(`git tag ${shellQuote(tag)}`);
run("git push origin main");
run(`git push origin ${shellQuote(tag)}`);

console.log(`\n=== Tagged ${tag}; GitHub Actions will publish Mupt npm packages from main ===`);
