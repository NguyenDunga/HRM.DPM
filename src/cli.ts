#!/usr/bin/env node
/**
 * DPM CLI entry point.
 *
 * Usage: dpm <solution-dir> [config-path] [--dry-run]
 *
 * Loads a solution (a directory whose dpm.config.json lists projectRoots; a
 * single project is a solution with projectRoots = ["."]), runs the fix
 * pipeline over each project, prints the changes, and commits unless --dry-run.
 */
import { Pipeline } from "./Handler/Handler.js";
import { SolutionLoader } from "./Solution/Loader.js";
import { ScriptInclusionHandler } from "./Handler/File/ScriptInclusionHandler.js";
import { LessInclusionHandler } from "./Handler/File/LessInclusionHandler.js";
import { BundleConfigHandler } from "./Handler/File/BundleConfigHandler.js";
import { CompilerConfigHandler } from "./Handler/File/CompilerConfigHandler.js";
import { ReferenceFixHandler } from "./Handler/File/ReferenceFixHandler.js";

function parseArgs(argv: string[]): { solutionDir: string; configPath?: string; dryRun: boolean } {
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((a) => !a.startsWith("--"));
  const solutionDir = positional[0];
  const configPath = positional[1];
  if (!solutionDir) {
    console.error("Usage: dpm <solution-dir> [config-path] [--dry-run]");
    process.exit(1);
  }
  return { solutionDir, configPath, dryRun };
}

function main(): void {
  const { solutionDir, configPath, dryRun } = parseArgs(process.argv);

  const handlers = [
    ScriptInclusionHandler,
    LessInclusionHandler,
    BundleConfigHandler,
    CompilerConfigHandler,
    ReferenceFixHandler,
  ];

  const solution = SolutionLoader.load(solutionDir, configPath);

  for (const s of solution.skipped) {
    console.log(`[solution] skip ${s.root} - ${s.reason}`);
  }

  let total = 0;
  for (const project of solution.projects) {
    const changes = Pipeline.run(handlers, project.model);
    total += changes.length;
    if (changes.length > 0) console.log(`# ${project.root}`);
    for (const c of changes) {
      console.log(`[${c.handler}] ${c.kind} ${c.target} - ${c.detail}`);
    }
  }

  console.log(`${total} change(s) across ${solution.projects.length} project(s)${dryRun ? " (dry run)" : ""}`);

  if (!dryRun && total > 0) SolutionLoader.commit(solution);
}

main();
