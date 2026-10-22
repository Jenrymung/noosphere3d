import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NOTICES_PLACEHOLDER } from "./notices-placeholder.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outPath = join(root, "THIRD-PARTY-NOTICES.md");
const dev = process.argv.includes("--dev");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === "win32",
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

function generate() {
  const scratch = mkdtempSync(join(tmpdir(), "noosphere3d-notices-"));
  try {
    const npmJson = join(scratch, "npm.json");
    run("npx", ["--yes", "license-checker-rseidelsohn@4.4.2", "--production", "--json", "--out", npmJson]);
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

    const cargoStdout = run("cargo", ["license", "--json", "--avoid-dev-deps", "--manifest-path", join(root, "src-tauri", "Cargo.toml")]);
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

    return [
      "# Third-party notices",
      "",
      "Generated for Noosphere 3D from npm production dependencies and Rust crates.",
      "The licence column is the string each package declares. A missing or unusual licence is recorded as text and does not fail this generation.",
      "This file does not accept, reject, or interpret those licences.",
      "The app embeds this file at build time. About → View all licences opens it in the Reader, offline.",
      "CI also uploads it as `noosphere3d-third-party-notices`.",
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
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function keepExistingInventory(error) {
  if (!existsSync(outPath)) return false;
  const existing = readFileSync(outPath, "utf8");
  if (!existing.includes("## npm production dependencies (") || !existing.includes("## Rust crates (")) return false;
  console.warn(`third-party notices: generation failed (${error instanceof Error ? error.message : error}). Keeping the existing inventory.`);
  return true;
}

try {
  const body = generate();
  writeFileSync(outPath, body);
  console.log(`wrote ${outPath}`);
} catch (error) {
  if (!dev) throw error;
  if (keepExistingInventory(error)) process.exit(0);
  writeFileSync(outPath, NOTICES_PLACEHOLDER);
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`third-party notices: generation failed (${message}). Wrote a placeholder; notices are generated at build time.`);
}
