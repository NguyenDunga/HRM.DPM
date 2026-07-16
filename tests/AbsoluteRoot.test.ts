import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectLoader } from "../src/Project/Loader";
import { ScriptInclusionHandler } from "../src/Handler/File/ScriptInclusionHandler";
import { LessInclusionHandler } from "../src/Handler/File/LessInclusionHandler";

/**
 * Layout:
 *   tmp/proj/App.csproj (+ dpm.config.json)
 *   tmp/shared/Scripts/_Library/foo.js   (absolute root, OUTSIDE proj)
 */
function makeWorkspace(config: object): { projDir: string; libDir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dpm-abs-"));
  const projDir = path.join(dir, "proj");
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(
    path.join(projDir, "App.csproj"),
    `<?xml version="1.0" encoding="utf-8"?>\n<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">\n  <ItemGroup>\n    <Content Include="Program.cs" />\n  </ItemGroup>\n</Project>\n`,
  );
  fs.writeFileSync(path.join(projDir, "dpm.config.json"), JSON.stringify(config));
  const libDir = path.join(dir, "shared", "Scripts", "_Library");
  fs.mkdirSync(libDir, { recursive: true });
  return { projDir, libDir };
}

test("absolute scriptRoot outside project -> Include uses ..\\ relative path", () => {
  const { projDir, libDir } = makeWorkspace({
    scriptRoots: [], lessRoots: [], libraryPaths: [], libraryNameMap: {},
  });
  fs.writeFileSync(path.join(libDir, "foo.js"), "//");
  // point scriptRoots at the absolute lib dir
  fs.writeFileSync(path.join(projDir, "dpm.config.json"), JSON.stringify({
    scriptRoots: [libDir], lessRoots: [], libraryPaths: [], libraryNameMap: {},
  }));

  const model = ProjectLoader.load(projDir);
  const changes = ScriptInclusionHandler.run(model);
  ProjectLoader.commit(model);

  const added = changes.find((c) => c.kind === "add");
  expect(added).toBeTruthy();
  const csproj = fs.readFileSync(path.join(projDir, "App.csproj"), "utf8");
  // Include should be relative to the csproj (starts with ..\ and ends in foo.js)
  expect(/Include="\.\.[\\/].*foo\.js"/.test(csproj)).toBe(true);
});

test("scan is confined to configured roots (files elsewhere ignored)", () => {
  const { projDir } = makeWorkspace({
    scriptRoots: ["Scripts"], lessRoots: [], libraryPaths: [], libraryNameMap: {},
  });
  // a .js OUTSIDE any root (in project root itself) must be ignored
  fs.writeFileSync(path.join(projDir, "stray.js"), "//");
  // and the configured Scripts root doesn't exist
  const model = ProjectLoader.load(projDir);
  const changes = ScriptInclusionHandler.run(model);
  // no additions; only a "does not exist" warning for the missing root
  expect(changes.some((c) => c.kind === "add")).toBe(false);
});

test("absolute lessRoot outside project adds the chain with ..\\ Includes", () => {
  const { projDir, libDir } = makeWorkspace({
    scriptRoots: [], lessRoots: [], libraryPaths: [], libraryNameMap: {},
  });
  fs.writeFileSync(path.join(libDir, "site.less"), "/* */");
  fs.writeFileSync(path.join(projDir, "dpm.config.json"), JSON.stringify({
    scriptRoots: [], lessRoots: [libDir], libraryPaths: [], libraryNameMap: {},
  }));

  const model = ProjectLoader.load(projDir);
  const changes = LessInclusionHandler.run(model);
  ProjectLoader.commit(model);

  expect(changes.filter((c) => c.kind === "add").length).toBe(3); // less/css/min.css
  const csproj = fs.readFileSync(path.join(projDir, "App.csproj"), "utf8");
  expect(/site\.min\.css/.test(csproj)).toBe(true);
});
