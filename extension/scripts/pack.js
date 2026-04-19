#!/usr/bin/env node
/* eslint-disable */
// Package the extension into a zip suitable for
// about:debugging → Load Temporary Add-on or about:addons manual install.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const extDir = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf-8"));
const outDir = path.join(extDir, "web-ext-artifacts");
fs.mkdirSync(outDir, { recursive: true });

const outName = `browser-control-cli-${manifest.version}.zip`;
const outPath = path.join(outDir, outName);
if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

const included = [
  "manifest.json",
  "options.html",
  "assets",
  "dist/background.js",
  "dist/options.js",
];

for (const rel of included) {
  const abs = path.join(extDir, rel);
  if (!fs.existsSync(abs)) {
    console.error(`missing: ${rel}`);
    process.exit(1);
  }
}

execSync(`zip -r ${JSON.stringify(outPath)} ${included.map((p) => JSON.stringify(p)).join(" ")}`, {
  cwd: extDir,
  stdio: "inherit",
});

console.log(`\nextension package: ${outPath}`);
