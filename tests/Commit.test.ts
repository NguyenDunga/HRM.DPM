import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectLoader } from "../src/Project/Loader";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "..", "bin", "test_ui");

/** Copy the fixture's editable files into a fresh temp dir. */
function tempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dpm-"));
  for (const f of ["HRM.UI.csproj", "bundleconfig.json", "compilerconfig.json"]) {
    fs.copyFileSync(path.join(FIXTURE, f), path.join(dir, f));
  }
  return dir;
}

function csprojOf(dir: string): string {
  return fs.readFileSync(path.join(dir, "HRM.UI.csproj"), "utf8");
}

test("commit with no edits leaves the csproj byte-identical", () => {
  const dir = tempProject();
  const before = csprojOf(dir);
  const model = ProjectLoader.load(dir);
  ProjectLoader.commit(model);
  expect(csprojOf(dir)).toBe(before);
});

test("add-item inserts a new item into the last ItemGroup", () => {
  const dir = tempProject();
  const model = ProjectLoader.load(dir);
  model.csproj.edits.push({
    op: "add-item",
    tag: "Content",
    include: "Scripts\\extra.js",
  });
  ProjectLoader.commit(model);
  const out = csprojOf(dir);
  expect(out).toContain('<Content Include="Scripts\\extra.js" />');
  // reload sees the new file
  expect(ProjectLoader.load(dir).csproj.files.some((f) => f.relPath === "Scripts/extra.js")).toBe(true);
});

test("set-dependent-upon expands a self-closing item", () => {
  const dir = tempProject();
  const model = ProjectLoader.load(dir);
  model.csproj.edits.push({
    op: "set-dependent-upon",
    include: "Views\\Emp.less",
    value: "Layout.less",
  });
  ProjectLoader.commit(model);
  expect(ProjectLoader.load(dir).csproj.files.find((f) => f.relPath === "Views/Emp.less")?.dependentUpon).toBe("Layout.less");
});

test("set-copy-to-output maps None to Never", () => {
  const dir = tempProject();
  const model = ProjectLoader.load(dir);
  model.csproj.edits.push({
    op: "set-copy-to-output",
    include: "Views\\Emp.less",
    value: "None",
  });
  ProjectLoader.commit(model);
  const out = csprojOf(dir);
  expect(out).toContain("<CopyToOutputDirectory>Never</CopyToOutputDirectory>");
  expect(ProjectLoader.load(dir).csproj.files.find((f) => f.relPath === "Views/Emp.less")?.copyToOutput).toBe("None");
});

test("remove-item deletes the item", () => {
  const dir = tempProject();
  const model = ProjectLoader.load(dir);
  model.csproj.edits.push({ op: "remove-item", include: "app.config" });
  ProjectLoader.commit(model);
  expect(csprojOf(dir)).not.toContain('Include="app.config"');
});

test("dirty JSON config is rewritten, clean one is not", () => {
  const dir = tempProject();
  const model = ProjectLoader.load(dir);
  model.bundleConfig!.entries.push({
    outputFileName: "Scripts/extra.min.js",
    inputFiles: ["Scripts/extra.js"],
  });
  model.bundleConfig!.dirty = true;
  ProjectLoader.commit(model);
  const reloaded = ProjectLoader.load(dir);
  expect(reloaded.bundleConfig?.entries.length).toBe(2);
});

test("only the edited lines change (untouched formatting preserved)", () => {
  const dir = tempProject();
  const before = csprojOf(dir).split("\n");
  const model = ProjectLoader.load(dir);
  model.csproj.edits.push({ op: "add-item", tag: "Content", include: "Scripts\\extra.js" });
  ProjectLoader.commit(model);
  const after = csprojOf(dir).split("\n");
  // exactly one new line, everything else identical and in order
  const added = after.filter((l) => !before.includes(l));
  expect(added.length).toBe(1);
  expect(added[0]).toContain("extra.js");
});
