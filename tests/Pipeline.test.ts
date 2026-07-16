import { test, expect } from "@playwright/test";
import { Pipeline, type Handler } from "../src/Handler/Handler";
import type { Change, ProjectModel } from "../src/Project/Interface";

function emptyModel(): ProjectModel {
  return {
    rootDir: "/tmp",
    csproj: {
      path: "/tmp/x.csproj",
      raw: "",
      eol: "\n",
      hasBom: false,
      files: [],
      projectReferences: [],
      edits: [],
    },
    config: { scriptRoots: [], lessRoots: [], libraryPaths: [], nameMap: {} },
  };
}

function stubHandler(name: string, applicable: boolean, changes: Change[]): Handler {
  return { name, applicable: () => applicable, run: () => changes };
}

test("Pipeline collects changes from applicable handlers", () => {
  const change: Change = { handler: "a", kind: "add", target: "f.js", detail: "d" };
  const out = Pipeline.run([stubHandler("a", true, [change])], emptyModel());
  expect(out).toEqual([change]);
});

test("Pipeline skips non-applicable handlers", () => {
  const change: Change = { handler: "b", kind: "add", target: "f.js", detail: "d" };
  const out = Pipeline.run([stubHandler("b", false, [change])], emptyModel());
  expect(out.length).toBe(0);
});

test("Pipeline preserves handler order", () => {
  const c1: Change = { handler: "1", kind: "add", target: "1", detail: "" };
  const c2: Change = { handler: "2", kind: "add", target: "2", detail: "" };
  const out = Pipeline.run(
    [stubHandler("1", true, [c1]), stubHandler("2", true, [c2])],
    emptyModel(),
  );
  expect(out.map((c) => c.handler)).toEqual(["1", "2"]);
});
