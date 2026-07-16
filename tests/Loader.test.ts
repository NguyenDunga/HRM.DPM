import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectLoader } from "../src/Project/Loader";
import type { ProjectFile } from "../src/Project/Interface";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "..", "bin", "test_ui");

function fileBy(files: ProjectFile[], relPath: string): ProjectFile {
  const f = files.find((x) => x.relPath === relPath);
  if (!f) throw new Error(`missing ${relPath}`);
  return f;
}

test("load finds the csproj", () => {
  const model = ProjectLoader.load(FIXTURE);
  expect(model.csproj.path.endsWith("HRM.UI.csproj")).toBe(true);
});

test("load extracts the core file items", () => {
  const { files } = ProjectLoader.load(FIXTURE).csproj;
  const rels = new Set(files.map((f) => f.relPath));
  for (const expected of [
    "Scripts/node.js",
    "Scripts/node.min.js",
    "Views/Emp.less",
    "Views/Emp.css",
    "Views/Emp.min.css",
    "app.config",
  ]) {
    expect(rels.has(expected)).toBe(true);
  }
});

test("classifies asset kinds and minification", () => {
  const { files } = ProjectLoader.load(FIXTURE).csproj;
  expect(fileBy(files, "Scripts/node.js").kind).toBe("js");
  expect(fileBy(files, "Scripts/node.min.js").isMinified).toBe(true);
  expect(fileBy(files, "Views/Emp.less").kind).toBe("less");
  expect(fileBy(files, "Views/Emp.min.css").isMinified).toBe(true);
});

test("reads DependentUpon nesting", () => {
  const { files } = ProjectLoader.load(FIXTURE).csproj;
  expect(fileBy(files, "Scripts/node.min.js").dependentUpon).toBe("node.js");
  expect(fileBy(files, "Views/Emp.css").dependentUpon).toBe("Emp.less");
  expect(fileBy(files, "Views/Emp.min.css").dependentUpon).toBe("Emp.css");
});

test("normalizes CopyToOutputDirectory", () => {
  const { files } = ProjectLoader.load(FIXTURE).csproj;
  expect(fileBy(files, "Scripts/node.js").copyToOutput).toBe("None");
  expect(fileBy(files, "Scripts/node.min.js").copyToOutput).toBe("Always");
});

test("loads bundle and compiler configs (BOM tolerant)", () => {
  const model = ProjectLoader.load(FIXTURE);
  expect(model.bundleConfig?.entries.length).toBe(1);
  expect(model.bundleConfig?.entries[0]?.outputFileName).toBe("Scripts/node.min.js");
  expect(model.compilerConfig?.entries.length).toBe(1);
  expect(model.compilerConfig?.entries[0]?.inputFile).toBe("Views/Emp.less");
});
