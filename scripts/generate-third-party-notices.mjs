import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const outPath = join(root, "THIRD-PARTY-NOTICES.md");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}${result.stdout || ""}`.trim();
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}\n${detail}`);
  }
  return result.stdout ?? "";
}

function licenceText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" OR ") || "not declared";
  if (typeof value === "string" && value.trim()) return value.trim();
  return "not declared";
}

function repoText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.url === "string") return value.url;
  return "";
}

function cell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function table(rows) {
  const lines = ["| Name | Version | Licence | Repository |", "| --- | --- | --- | --- |"];
  for (const row of rows) {
    lines.push(`| ${cell(row.name)} | ${cell(row.version)} | ${cell(row.licence)} | ${cell(row.repository)} |`);
  }
  return lines.join("\n");
}

const scratch = mkdtempSync(join(tmpdir(), "noosphere3d-notices-"));
try {
  const npmJson = join(scratch, "npm.json");
  run("npx", [
    "--yes",
    "license-checker-rseidelsohn@4.4.2",
    "--production",
    "--json",
    "--out",
    npmJson,
  ]);
  const npmRaw = JSON.parse(readFileSync(npmJson, "utf8"));
  if (!npmRaw || typeof npmRaw !== "object" || Array.isArray(npmRaw)) {
    throw new Error("license-checker did not write a JSON object");
  }
  const npmRows = Object.entries(npmRaw)
    .filter(([name]) => !name.startsWith("noosphere3d@"))
    .map(([name, info]) => {
      const at = name.lastIndexOf("@");
      const packageName = at > 0 ? name.slice(0, at) : name;
      const version = at > 0 ? name.slice(at + 1) : "";
      return {
        name: packageName,
        version,
        licence: licenceText(info?.licenses),
        repository: repoText(info?.repository),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

  const cargoStdout = run("cargo", [
    "license",
    "--json",
    "--avoid-dev-deps",
    "--manifest-path",
    join(root, "src-tauri", "Cargo.toml"),
  ]);
  const cargoRaw = JSON.parse(cargoStdout);
  if (!Array.isArray(cargoRaw)) throw new Error("cargo-license did not write a JSON array");
  const cargoRows = cargoRaw
    .filter((item) => item?.name !== "noosphere3d")
    .map((item) => ({
      name: item.name ?? "",
      version: item.version ?? "",
      licence: licenceText(item.license),
      repository: repoText(item.repository),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

  const body = [
    "# Third-party notices",
    "",
    "Generated for Noosphere 3D from npm production dependencies and Rust crates.",
    "The licence column is the string each package declares. A missing or unusual licence is recorded as text and does not fail this generation.",
    "This file does not accept, reject, or interpret those licences.",
    "The About dialog keeps its short fixed list. This inventory is the CI artifact `noosphere3d-third-party-notices`.",
    "",
    `## npm production dependencies (${npmRows.length})`,
    "",
    table(npmRows),
    "",
    `## Rust crates (${cargoRows.length})`,
    "",
    table(cargoRows),
    "",
  ].join("\n");
  writeFileSync(outPath, body);
  console.log(`wrote ${outPath} (${npmRows.length} npm, ${cargoRows.length} rust)`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
