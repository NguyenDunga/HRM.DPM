import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectLoader } from "../src/Project/Loader";
import { ScriptInclusionHandler } from "../src/Handler/File/ScriptInclusionHandler";

/** Build a throwaway project dir with the given csproj items and Scripts files. */
function makeProject(opts: {
  items: string; // XML inside a single <ItemGroup>
  scripts: string[]; // relative file paths to create (e.g. "Scripts/a.js")
  config?: object;
}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dpm-js-"));
  const csproj = `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <ItemGroup>
${opts.items}
  </ItemGroup>
</Project>
`;
  fs.writeFileSync(path.join(dir, "App.csproj"), csproj);
  for (const rel of opts.scripts) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "// file");
  }
  if (opts.config) fs.writeFileSync(path.join(dir, "dpm.config.json"), JSON.stringify(opts.config));
  return dir;
}

function runHandler(dir: string) {
  const model = ProjectLoader.load(dir);
  const changes = ScriptInclusionHandler.run(model);
  ProjectLoader.commit(model);
  return { model, changes };
}

test("no-op on an already-correct project", () => {
  const dir = makeProject({
    items:
      '    <Content Include="Scripts\\node.js">\n' +
      "      <CopyToOutputDirectory>Never</CopyToOutputDirectory>\n" +
      "    </Content>\n" +
      '    <Content Include="Scripts\\node.min.js">\n' +
      "      <DependentUpon>node.js</DependentUpon>\n" +
      "      <CopyToOutputDirectory>Always</CopyToOutputDirectory>\n" +
      "    </Content>",
    scripts: ["Scripts/node.js", "Scripts/node.min.js"],
  });
  const { changes } = runHandler(dir);
  expect(changes.length).toBe(0);
});

test("adds an unreferenced .js from disk", () => {
  const dir = makeProject({
    items: '    <Content Include="Scripts\\node.js">\n      <CopyToOutputDirectory>Never</CopyToOutputDirectory>\n    </Content>',
    scripts: ["Scripts/node.js", "Scripts/app.js"],
  });
  const { changes } = runHandler(dir);
  expect(changes.some((c) => c.target === "Scripts/app.js" && c.kind === "add")).toBe(true);
  const reloaded = ProjectLoader.load(dir);
  const app = reloaded.csproj.files.find((f) => f.relPath === "Scripts/app.js");
  expect(app?.copyToOutput).toBe("None");
});

test("added .min.js nests under its base and is Always-copy", () => {
  const dir = makeProject({
    items: '    <Content Include="Scripts\\node.js">\n      <CopyToOutputDirectory>Never</CopyToOutputDirectory>\n    </Content>',
    scripts: ["Scripts/node.js", "Scripts/node.min.js"],
  });
  runHandler(dir);
  const reloaded = ProjectLoader.load(dir);
  const min = reloaded.csproj.files.find((f) => f.relPath === "Scripts/node.min.js");
  expect(min?.dependentUpon).toBe("node.js");
  expect(min?.copyToOutput).toBe("Always");
});

test("fixes wrong copy-state and missing nesting on existing items", () => {
  const dir = makeProject({
    items:
      '    <Content Include="Scripts\\node.js">\n      <CopyToOutputDirectory>Always</CopyToOutputDirectory>\n    </Content>\n' +
      '    <Content Include="Scripts\\node.min.js" />',
    scripts: ["Scripts/node.js", "Scripts/node.min.js"],
  });
  const { changes } = runHandler(dir);
  expect(changes.length).toBeGreaterThan(0);
  const reloaded = ProjectLoader.load(dir);
  const base = reloaded.csproj.files.find((f) => f.relPath === "Scripts/node.js");
  const min = reloaded.csproj.files.find((f) => f.relPath === "Scripts/node.min.js");
  expect(base?.copyToOutput).toBe("None");
  expect(min?.dependentUpon).toBe("node.js");
  expect(min?.copyToOutput).toBe("Always");
});

test("warns and continues when a scriptRoot is missing", () => {
  const dir = makeProject({
    items: '    <Content Include="Program.cs" />',
    scripts: [],
    config: { scriptRoots: ["DoesNotExist"], lessRoots: ["Views"] },
  });
  const { changes } = runHandler(dir);
  expect(changes.some((c) => c.detail.includes("does not exist"))).toBe(true);
});

test("is idempotent (second run makes no changes)", () => {
  const dir = makeProject({
    items: '    <Content Include="Scripts\\node.js" />',
    scripts: ["Scripts/node.js", "Scripts/node.min.js", "Scripts/app.js"],
  });
  runHandler(dir);
  const second = runHandler(dir);
  expect(second.changes.length).toBe(0);
});
