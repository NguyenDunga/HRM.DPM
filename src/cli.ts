/**
 * DPM CLI entry point.
 *
 * Usage: dpm <project-dir> [--dry-run]
 *
 * Loads a .NET project, runs the fix pipeline, prints the changes, and (unless
 * --dry-run) commits them back to disk.
 */
import { Pipeline } from "./Handler/Handler.js";
import { ProjectLoader } from "./Project/Loader.js";
import { ScriptInclusionHandler } from "./Handler/File/ScriptInclusionHandler.js";
import { LessInclusionHandler } from "./Handler/File/LessInclusionHandler.js";
import { BundleConfigHandler } from "./Handler/File/BundleConfigHandler.js";
import { CompilerConfigHandler } from "./Handler/File/CompilerConfigHandler.js";

function parseArgs(argv: string[]): { projectDir: string; dryRun: boolean } {
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const projectDir = args.find((a) => !a.startsWith("--"));
  if (!projectDir) {
    console.error("Usage: dpm <project-dir> [--dry-run]");
    process.exit(1);
  }
  return { projectDir, dryRun };
}

function main(): void {
  const { projectDir, dryRun } = parseArgs(process.argv);

  const handlers = [
    ScriptInclusionHandler,
    LessInclusionHandler,
    BundleConfigHandler,
    CompilerConfigHandler,
  ];

  const model = ProjectLoader.load(projectDir);
  const changes = Pipeline.run(handlers, model);

  for (const c of changes) {
    console.log(`[${c.handler}] ${c.kind} ${c.target} — ${c.detail}`);
  }
  console.log(`${changes.length} change(s)${dryRun ? " (dry run)" : ""}`);

  if (!dryRun && changes.length > 0) ProjectLoader.commit(model);
}

main();
