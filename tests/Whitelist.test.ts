import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectLoader } from "../src/Project/Loader";
import { ScriptInclusionHandler } from "../src/Handler/File/ScriptInclusionHandler";

/**
 * Project layout:
 *   proj/App.csproj  (references BOTH an in-whitelist and an out-of-whitelist .js,
 *                     each with WRONG copy-state)
 *   proj/Scripts/_Library/keep.js       (whitelisted)
 *   proj/Other/stray.js                 (NOT whitelisted, on disk)
 * scriptRoots = ["Scripts/_Library"]
 */
function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dpm-wl-"));
  fs.mkdirSync(path.join(dir, "Scripts", "_Library"), { recursive: true });
  fs.mkdirSync(path.join(dir, "Other"), { recursive: true });
  fs.writeFileSync(path.join(dir, "Scripts", "_Library", "keep.js"), "//");
  fs.writeFileSync(path.join(dir, "Other", "stray.js"), "//");
  // csproj references both, both with WRONG copy-state (Always instead of None)
  fs.writeFileSync(
    path.join(dir, "App.csproj"),
    `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <ItemGroup>
    <Content Include="Scripts\\_Library\\keep.js">
      <CopyToOutputDirectory>Always</CopyToOutputDirectory>
    </Content>
    <Content Include="Other\\stray.js">
      <CopyToOutputDirectory>Always</CopyToOutputDirectory>
    </Content>
  </ItemGroup>
</Project>
`,
  );
  fs.writeFileSync(
    path.join(dir, "dpm.config.json"),
    JSON.stringify({ scriptRoots: ["Scripts\\_Library"], lessRoots: [], libraryPaths: [], libraryNameMap: {} }),
  );
  return dir;
}

test("only whitelisted files are fixed; out-of-root items untouched", () => {
  const dir = makeProject();
  const model = ProjectLoader.load(dir);
  const changes = ScriptInclusionHandler.run(model);
  ProjectLoader.commit(model);

  // keep.js (in whitelist) gets fixed to None; stray.js (out) is NOT touched
  const targets = changes.map((c) => c.target);
  expect(targets).toContain("Scripts/_Library/keep.js");
  expect(targets.some((t) => t.includes("stray.js"))).toBe(false);

  const reloaded = ProjectLoader.load(dir);
  const keep = reloaded.csproj.files.find((f) => f.relPath === "Scripts/_Library/keep.js");
  const stray = reloaded.csproj.files.find((f) => f.relPath === "Other/stray.js");
  expect(keep?.copyToOutput).toBe("None");   // fixed
  expect(stray?.copyToOutput).toBe("Always"); // left as-is
});

test("stray .js on disk outside roots is never added", () => {
  const dir = makeProject();
  // remove stray from csproj so it's only on disk
  const csprojPath = path.join(dir, "App.csproj");
  fs.writeFileSync(
    csprojPath,
    `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <ItemGroup>
    <Content Include="Program.cs" />
  </ItemGroup>
</Project>
`,
  );
  const model = ProjectLoader.load(dir);
  const changes = ScriptInclusionHandler.run(model);
  expect(changes.some((c) => c.target.includes("stray.js"))).toBe(false);
  expect(changes.some((c) => c.target === "Scripts/_Library/keep.js")).toBe(true);
});
