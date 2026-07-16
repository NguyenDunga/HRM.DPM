import fs from "node:fs";
import path from "node:path";
import { ProjectLoader } from "../Project/Loader.js";
import type { DpmFileConfig, ProjectModel } from "../Project/Interface.js";

/** One project within a loaded solution. */
export interface SolutionProject {
  /** projectRoot as written in the config. */
  root: string;
  /** Absolute directory of the project. */
  dir: string;
  model: ProjectModel;
}

/** A loaded solution: shared config plus each resolved project. */
export interface SolutionModel {
  solutionDir: string;
  config: DpmFileConfig;
  projects: SolutionProject[];
  /** projectRoots that could not be loaded (missing dir or no .csproj). */
  skipped: { root: string; reason: string }[];
}

/**
 * Loads a solution: a directory whose dpm.config.json lists projectRoots.
 * Each projectRoot is loaded as a ProjectModel that shares the solution config.
 * A single project is just a solution with projectRoots = ["."].
 */
export const SolutionLoader = (() => {
  function resolveRoot(root: string, solutionDir: string): string {
    const norm = root.replace(/\\/g, path.sep).replace(/\//g, path.sep);
    return path.isAbsolute(norm) ? norm : path.resolve(solutionDir, norm);
  }

  function hasCsproj(dir: string): boolean {
    return fs.existsSync(dir) &&
      fs.statSync(dir).isDirectory() &&
      fs.readdirSync(dir).some((f) => f.toLowerCase().endsWith(".csproj"));
  }

  function load(solutionDir: string, configPath?: string): SolutionModel {
    const config = ProjectLoader.readDpmConfig(configPath ?? solutionDir);
    const projects: SolutionProject[] = [];
    const skipped: { root: string; reason: string }[] = [];

    for (const entry of config.projectRoots) {
      const root = entry.Path;
      const dir = resolveRoot(root, solutionDir);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        skipped.push({ root, reason: "directory does not exist" });
        continue;
      }
      if (!hasCsproj(dir)) {
        skipped.push({ root, reason: "no .csproj found" });
        continue;
      }
      const projectConfig = ProjectLoader.effectiveConfig(entry, config);
      projects.push({ root, dir, model: ProjectLoader.load(dir, projectConfig) });
    }

    return { solutionDir, config, projects, skipped };
  }

  /** Commit every project's pending edits (unless dryRun). */
  function commit(solution: SolutionModel): void {
    for (const p of solution.projects) ProjectLoader.commit(p.model);
  }

  return { load, commit };
})();
