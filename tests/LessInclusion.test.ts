import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectLoader } from "../src/Project/Loader";
import { LessInclusionHandler } from "../src/Handler/File/LessInclusionHandler";

function makeProject(opts: { items: string; files: string[]; config?: object }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dpm-less-"));
  const csproj = `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <ItemGroup>
${opts.items}
  </ItemGroup>
</Project>
`;
  fs.writeFileSync(path.join(dir, "App.csproj"), csproj);
  for (const rel of opts.files) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "/* f */");
  }
  if (opts.config) fs.writeFileSync(path.join(dir, "dpm.config.json"), JSON.stringify(opts.config));
  return dir;
}

function runHandler(dir: string) {
  const model = ProjectLoader.load(dir);
  const changes = LessInclusionHandler.run(model);
  ProjectLoader.commit(model);
  return { changes };
}

function fileMap(dir: string) {
  const m = new Map<string, { dependentUpon?: string; copyToOutput?: string }>();
  for (const f of ProjectLoader.load(dir).csproj.files) {
    m.set(f.relPath, { dependentUpon: f.dependentUpon, copyToOutput: f.copyToOutput });
  }
  return m;
}

test("adds the full css/min.css chain from a lone .less", () => {
  const dir = makeProject({
    items: '    <Content Include="Views\\Emp.less" />',
    files: ["Views/Emp.less"],
    config: { scriptRoots: ["Scripts"], lessRoots: ["Views"] },
  });
  runHandler(dir);
  const m = fileMap(dir);
  expect(m.has("Views/Emp.css")).toBe(true);
  expect(m.has("Views/Emp.min.css")).toBe(true);
});

test("nests the chain less <- css <- min.css", () => {
  const dir = makeProject({
    items: '    <Content Include="Views\\Emp.less" />',
    files: ["Views/Emp.less"],
    config: { scriptRoots: ["Scripts"], lessRoots: ["Views"] },
  });
  runHandler(dir);
  const m = fileMap(dir);
  expect(m.get("Views/Emp.css")?.dependentUpon).toBe("Emp.less");
  expect(m.get("Views/Emp.min.css")?.dependentUpon).toBe("Emp.css");
});

test("sets copy-state less/css=None, min.css=Always", () => {
  const dir = makeProject({
    items: '    <Content Include="Views\\Emp.less" />',
    files: ["Views/Emp.less"],
    config: { scriptRoots: ["Scripts"], lessRoots: ["Views"] },
  });
  runHandler(dir);
  const m = fileMap(dir);
  expect(m.get("Views/Emp.less")?.copyToOutput).toBe("None");
  expect(m.get("Views/Emp.css")?.copyToOutput).toBe("None");
  expect(m.get("Views/Emp.min.css")?.copyToOutput).toBe("Always");
});

test("no-op on an already-correct chain", () => {
  const dir = makeProject({
    items:
      '    <Content Include="Views\\Emp.less">\n      <CopyToOutputDirectory>Never</CopyToOutputDirectory>\n    </Content>\n' +
      '    <Content Include="Views\\Emp.css">\n      <DependentUpon>Emp.less</DependentUpon>\n      <CopyToOutputDirectory>Never</CopyToOutputDirectory>\n    </Content>\n' +
      '    <Content Include="Views\\Emp.min.css">\n      <DependentUpon>Emp.css</DependentUpon>\n      <CopyToOutputDirectory>Always</CopyToOutputDirectory>\n    </Content>',
    files: ["Views/Emp.less"],
    config: { scriptRoots: ["Scripts"], lessRoots: ["Views"] },
  });
  const { changes } = runHandler(dir);
  expect(changes.length).toBe(0);
});

test("fixes wrong nesting/copy-state on an existing chain", () => {
  const dir = makeProject({
    items:
      '    <Content Include="Views\\Emp.less">\n      <CopyToOutputDirectory>Always</CopyToOutputDirectory>\n    </Content>\n' +
      '    <Content Include="Views\\Emp.css" />\n' +
      '    <Content Include="Views\\Emp.min.css" />',
    files: ["Views/Emp.less"],
    config: { scriptRoots: ["Scripts"], lessRoots: ["Views"] },
  });
  const { changes } = runHandler(dir);
  expect(changes.length).toBeGreaterThan(0);
  const m = fileMap(dir);
  expect(m.get("Views/Emp.less")?.copyToOutput).toBe("None");
  expect(m.get("Views/Emp.css")?.dependentUpon).toBe("Emp.less");
  expect(m.get("Views/Emp.min.css")?.dependentUpon).toBe("Emp.css");
  expect(m.get("Views/Emp.min.css")?.copyToOutput).toBe("Always");
});

test("warns and continues when a lessRoot is missing", () => {
  const dir = makeProject({
    items: '    <Content Include="Program.cs" />',
    files: [],
    config: { scriptRoots: ["Scripts"], lessRoots: ["Nope"] },
  });
  const { changes } = runHandler(dir);
  expect(changes.some((c) => c.detail.includes("does not exist"))).toBe(true);
});

test("is idempotent (second run makes no changes)", () => {
  const dir = makeProject({
    items: '    <Content Include="Views\\Emp.less" />',
    files: ["Views/Emp.less"],
    config: { scriptRoots: ["Scripts"], lessRoots: ["Views"] },
  });
  runHandler(dir);
  const second = runHandler(dir);
  expect(second.changes.length).toBe(0);
});
