import fs from "node:fs";
import path from "node:path";
import type { Handler } from "../Handler.js";
import type { Change, CopyToOutput, ItemChild, ProjectFile, ProjectModel } from "../../Project/Model.js";

/**
 * JavaScript inclusion rules (HRM.UI.csproj):
 *  - Add any .js under a configured scriptRoot not yet referenced in the csproj.
 *  - When foo.js and foo.min.js share a folder, nest foo.min.js under foo.js.
 *  - Copy-state on build: foo.js -> "None", foo.min.js -> "Always".
 *
 * Idempotent: re-running on an already-correct project yields no changes.
 */
export const ScriptInclusionHandler: Handler = (() => {
  const SKIP_DIRS = new Set(["node_modules", "obj", "bin", ".vs", ".git"]);

  /** Recursively list *.js under dir, as project-relative forward-slash paths. */
  function listJs(root: string, rootRel: string): string[] {
    const out: string[] = [];
    const walk = (abs: string, rel: string) => {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          walk(path.join(abs, entry.name), `${rel}/${entry.name}`);
        } else if (entry.name.toLowerCase().endsWith(".js")) {
          out.push(`${rel}/${entry.name}`);
        }
      }
    };
    walk(root, rootRel);
    return out;
  }

  const baseName = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);
  const isMin = (rel: string) => /\.min\.js$/i.test(rel);
  /** node.min.js -> node.js */
  const baseOf = (rel: string) => rel.replace(/\.min\.js$/i, ".js");
  /** forward-slash relPath -> csproj backslash Include */
  const toInclude = (rel: string) => rel.replace(/\//g, "\\");

  /** Desired nesting/copy-state for a .js file given the set of all .js relPaths. */
  function desired(rel: string, allJs: Set<string>): { dependentUpon?: string; copyToOutput: CopyToOutput } {
    if (isMin(rel)) {
      const base = baseOf(rel);
      if (allJs.has(base)) {
        return { dependentUpon: baseName(base), copyToOutput: "Always" };
      }
      return { copyToOutput: "Always" };
    }
    return { copyToOutput: "None" };
  }

  return {
    name: "js-inclusion",

    applicable: (model) => model.config.scriptRoots.length > 0,

    run: (model: ProjectModel): Change[] => {
      const changes: Change[] = [];
      const { rootDir } = model;

      // Gather every .js on disk under the configured roots.
      const diskJs: string[] = [];
      for (const root of model.config.scriptRoots) {
        const abs = path.join(rootDir, root);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
          changes.push({
            handler: "js-inclusion",
            kind: "modify",
            target: root,
            detail: `scriptRoot "${root}" does not exist — skipped`,
          });
          continue;
        }
        diskJs.push(...listJs(abs, root));
      }

      const referenced = new Map<string, ProjectFile>();
      for (const f of model.csproj.files) {
        if (f.kind === "js") referenced.set(f.relPath, f);
      }

      // Universe of .js relPaths (disk + already-referenced) for nesting decisions.
      const allJs = new Set<string>([...diskJs, ...referenced.keys()]);

      // 1. Add unreferenced .js on disk.
      for (const rel of diskJs) {
        if (referenced.has(rel)) continue;
        const d = desired(rel, allJs);
        const children: ItemChild[] = [];
        if (d.dependentUpon) children.push({ tag: "DependentUpon", text: d.dependentUpon });
        children.push({ tag: "CopyToOutputDirectory", text: d.copyToOutput === "None" ? "Never" : d.copyToOutput });

        model.csproj.edits.push({ op: "add-item", tag: "Content", include: toInclude(rel), children });
        model.csproj.files.push({
          absPath: path.resolve(rootDir, rel.replace(/\//g, path.sep)),
          relPath: rel,
          kind: "js",
          isMinified: isMin(rel),
          dependentUpon: d.dependentUpon ? baseOf(rel) : undefined,
          copyToOutput: d.copyToOutput,
        });
        referenced.set(rel, model.csproj.files[model.csproj.files.length - 1]!);
        changes.push({ handler: "js-inclusion", kind: "add", target: rel, detail: "added to project" });
      }

      // 2. Enforce nesting + copy-state on existing referenced items.
      for (const [rel, file] of referenced) {
        const d = desired(rel, allJs);
        const wantDep = d.dependentUpon;
        const haveDep = file.dependentUpon ? baseName(file.dependentUpon) : undefined;
        if (wantDep && haveDep !== wantDep) {
          model.csproj.edits.push({ op: "set-dependent-upon", include: toInclude(rel), value: wantDep });
          file.dependentUpon = baseOf(rel);
          changes.push({ handler: "js-inclusion", kind: "modify", target: rel, detail: `DependentUpon -> ${wantDep}` });
        }
        if (file.copyToOutput !== d.copyToOutput) {
          model.csproj.edits.push({ op: "set-copy-to-output", include: toInclude(rel), value: d.copyToOutput });
          file.copyToOutput = d.copyToOutput;
          changes.push({ handler: "js-inclusion", kind: "modify", target: rel, detail: `CopyToOutputDirectory -> ${d.copyToOutput}` });
        }
      }

      return changes;
    },
  };
})();
