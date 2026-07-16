import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SolutionLoader } from "../src/Solution/Loader";
import { Pipeline } from "../src/Handler/Handler";
import { ScriptInclusionHandler } from "../src/Handler/File/ScriptInclusionHandler";

const CSPROJ = `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <ItemGroup>
    <Content Include="Program.cs" />
  </ItemGroup>
</Project>
`;

/** Build a solution dir with the given projects, each getting Scripts/app.js. */
function makeSolution(opts: { projectRoots: string[]; projects: string[] }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dpm-sln-"));
  for (const proj of opts.projects) {
    const pdir = path.join(dir, proj, "Scripts");
    fs.mkdirSync(pdir, { recursive: true });
    fs.writeFileSync(path.join(dir, proj, `${proj}.csproj`), CSPROJ);
    fs.writeFileSync(path.join(pdir, "app.js"), "//");
  }
  fs.writeFileSync(
    path.join(dir, "dpm.config.json"),
    JSON.stringify({
      projectRoots: opts.projectRoots.map((p) => ({ Path: p })),
      scriptRoots: ["Scripts"],
      lessRoots: [],
      libraryPaths: [],
      libraryNameMap: {},
    }),
  );
  return dir;
}

test("loads every projectRoot as a project", () => {
  const dir = makeSolution({ projectRoots: ["Web", "Api"], projects: ["Web", "Api"] });
  const sln = SolutionLoader.load(dir);
  expect(sln.projects.map((p) => p.root).sort()).toEqual(["Api", "Web"]);
});

test("runs the pipeline across all projects and commits each csproj", () => {
  const dir = makeSolution({ projectRoots: ["Web", "Api"], projects: ["Web", "Api"] });
  const sln = SolutionLoader.load(dir);
  for (const p of sln.projects) Pipeline.run([ScriptInclusionHandler], p.model);
  SolutionLoader.commit(sln);

  for (const proj of ["Web", "Api"]) {
    const csproj = fs.readFileSync(path.join(dir, proj, `${proj}.csproj`), "utf8");
    expect(csproj).toContain('Include="Scripts\\app.js"');
  }
});

test("skips a projectRoot with no .csproj", () => {
  const dir = makeSolution({ projectRoots: ["Web", "Ghost"], projects: ["Web"] });
  fs.mkdirSync(path.join(dir, "Ghost"), { recursive: true }); // dir exists, no csproj
  const sln = SolutionLoader.load(dir);
  expect(sln.projects.map((p) => p.root)).toEqual(["Web"]);
  expect(sln.skipped.some((s) => s.root === "Ghost")).toBe(true);
});

test("single-project solution via projectRoots ['.']", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dpm-sln1-"));
  fs.mkdirSync(path.join(dir, "Scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "App.csproj"), CSPROJ);
  fs.writeFileSync(path.join(dir, "Scripts", "app.js"), "//");
  fs.writeFileSync(
    path.join(dir, "dpm.config.json"),
    JSON.stringify({ projectRoots: [{ Path: "." }], scriptRoots: ["Scripts"], lessRoots: [], libraryPaths: [], libraryNameMap: {} }),
  );
  const sln = SolutionLoader.load(dir);
  expect(sln.projects.length).toBe(1);
  Pipeline.run([ScriptInclusionHandler], sln.projects[0]!.model);
  SolutionLoader.commit(sln);
  expect(fs.readFileSync(path.join(dir, "App.csproj"), "utf8")).toContain('Include="Scripts\\app.js"');
});

test("projects share the solution config", () => {
  const dir = makeSolution({ projectRoots: ["Web"], projects: ["Web"] });
  const sln = SolutionLoader.load(dir);
  expect(sln.projects[0]!.model.config.scriptRoots).toEqual(["Scripts"]);
});
