import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectLoader } from "../src/Project/Loader";
import { ReferenceFixHandler } from "../src/Handler/File/ReferenceFixHandler";

/**
 * Build a temp project dir:
 *  - proj/App.csproj with the given ItemGroup body
 *  - lib/ folder with the given dll file names created
 *  - optional intact referenced .csproj created on disk
 */
function makeProject(opts: {
  items: string;
  dlls?: string[];
  intactRefs?: string[]; // relative .csproj paths (from proj dir) to create
  config?: object;
}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dpm-ref-"));
  const projDir = path.join(dir, "proj");
  fs.mkdirSync(projDir, { recursive: true });
  const csproj = `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003" ToolsVersion="15.0">
  <ItemGroup>
${opts.items}
  </ItemGroup>
</Project>
`;
  fs.writeFileSync(path.join(projDir, "App.csproj"), csproj);

  const libDir = path.join(dir, "lib");
  fs.mkdirSync(libDir, { recursive: true });
  for (const d of opts.dlls ?? []) fs.writeFileSync(path.join(libDir, d), "MZ");

  for (const rel of opts.intactRefs ?? []) {
    const abs = path.join(projDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "<Project/>");
  }

  const cfg = opts.config ?? {
    scriptRoots: [], lessRoots: [],
    libraryPaths: [path.join(dir, "lib")],
    libraryNameMap: {},
  };
  fs.writeFileSync(path.join(projDir, "dpm.config.json"), JSON.stringify(cfg));
  return projDir;
}

function runHandler(projDir: string) {
  const model = ProjectLoader.load(projDir);
  const changes = ReferenceFixHandler.run(model);
  ProjectLoader.commit(model);
  return { changes, csproj: fs.readFileSync(path.join(projDir, "App.csproj"), "utf8") };
}

const BROKEN_REF =
  '    <ProjectReference Include="..\\\\Missing\\\\Foo.csproj">\n' +
  "      <Name>Foo</Name>\n" +
  "    </ProjectReference>";

test("replaces a broken ProjectReference with a Reference + HintPath", () => {
  const dir = makeProject({ items: BROKEN_REF, dlls: ["Foo.dll"] });
  const { changes, csproj } = runHandler(dir);
  expect(changes.some((c) => c.detail.includes("replaced broken ProjectReference"))).toBe(true);
  expect(csproj).toContain('<Reference Include="Foo">');
  expect(csproj).toContain("<HintPath>");
  expect(csproj).not.toContain("<ProjectReference");
});

test("warns and leaves untouched when the DLL is not found", () => {
  const dir = makeProject({ items: BROKEN_REF, dlls: [] });
  const { changes, csproj } = runHandler(dir);
  expect(changes.some((c) => c.detail.includes("not found in libraryPaths"))).toBe(true);
  expect(csproj).toContain("<ProjectReference");
});

test("skips an intact ProjectReference (target exists on disk)", () => {
  const dir = makeProject({
    items:
      '    <ProjectReference Include="..\\\\Real\\\\Bar.csproj">\n      <Name>Bar</Name>\n    </ProjectReference>',
    dlls: ["Bar.dll"],
    intactRefs: ["../Real/Bar.csproj"],
  });
  const { changes, csproj } = runHandler(dir);
  expect(changes.length).toBe(0);
  expect(csproj).toContain("<ProjectReference");
});

test("uses nameMap to resolve the DLL name", () => {
  const dir = makeProject({
    items: BROKEN_REF,
    dlls: ["FooLib.dll"],
    config: { scriptRoots: [], lessRoots: [], libraryPaths: [], libraryNameMap: { Foo: "FooLib" } },
  });
  // libraryPaths empty here would skip; set it via a second config write
  const projDir = dir;
  const libDir = path.join(path.dirname(projDir), "lib");
  fs.writeFileSync(path.join(projDir, "dpm.config.json"), JSON.stringify({
    scriptRoots: [], lessRoots: [], libraryPaths: [libDir], libraryNameMap: { Foo: "FooLib" },
  }));
  const { csproj } = runHandler(projDir);
  expect(csproj).toContain('<Reference Include="Foo">');
});

test("is idempotent (second run makes no changes)", () => {
  const dir = makeProject({ items: BROKEN_REF, dlls: ["Foo.dll"] });
  runHandler(dir);
  const second = runHandler(dir);
  expect(second.changes.length).toBe(0);
});
