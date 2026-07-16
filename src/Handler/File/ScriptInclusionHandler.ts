import fs from "node:fs";
import path from "node:path";
import type { Handler } from "../Handler.js";
import type { Change, CopyToOutput, ItemChild, ProjectFile, ProjectModel } from "../../Project/Interface.js";

/**
 * JavaScript inclusion rules (HRM.UI.csproj), scoped to a WHITELIST of roots:
 *  - scriptRoots is a whitelist. The handler only ever looks at .js files that
 *    live under one of those roots; nothing else in the project is scanned or
 *    modified.
 *  - Add any whitelisted .js not yet referenced in the csproj.
 *  - When foo.js and foo.min.js share a folder, nest foo.min.js under foo.js.
 *  - Copy-state on build: foo.js -> "None", foo.min.js -> "Always".
 *
 * scriptRoots may be absolute or relative; relative roots resolve against the
 * project directory. Each file's csproj Include is the path relative to the
 * .csproj directory. Idempotent.
 */
export const ScriptInclusionHandler: Handler = (() => {
  const SKIP_DIRS = new Set(["node_modules", "obj", "bin", ".vs", ".git"]);

  /** Normalize a configured root to an absolute path (handles \\ or / separators). */
  function resolveRoot(root: string, rootDir: string): string {
    const norm = root.replace(/\\/g, path.sep).replace(/\//g, path.sep);
    return path.isAbsolute(norm) ? norm : path.resolve(rootDir, norm);
  }

  /** Recursively list *.js under an absolute root, as csproj-relative forward-slash paths. */
  function listJs(rootAbs: string, csprojDir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        const child = path.join(abs, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          walk(child);
        } else if (entry.name.toLowerCase().endsWith(".js")) {
          out.push(path.relative(csprojDir, child).split(path.sep).join("/"));
        }
      }
    };
    walk(rootAbs);
    return out;
  }

  const baseName = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);
  const isMin = (rel: string) => /\.min\.js$/i.test(rel);
  const baseOf = (rel: string) => rel.replace(/\.min\.js$/i, ".js");
  const toInclude = (rel: string) => rel.replace(/\//g, "\\");

  function desired(rel: string, allJs: Set<string>): { dependentUpon?: string; copyToOutput: CopyToOutput } {
    if (isMin(rel)) {
      const base = baseOf(rel);
      if (allJs.has(base)) return { dependentUpon: baseName(base), copyToOutput: "Always" };
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
      const csprojDir = path.dirname(model.csproj.path);

      // Whitelisted .js on disk (relPaths). This set defines the entire scope
      // of the handler — both additions AND fixes to existing items.
      const whitelist = new Set<string>();
      for (const root of model.config.scriptRoots) {
        const abs = resolveRoot(root, rootDir);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
          changes.push({
            handler: "js-inclusion",
            kind: "modify",
            target: root,
            detail: `scriptRoot "${root}" does not exist — skipped`,
          });
          continue;
        }
        for (const rel of listJs(abs, csprojDir)) whitelist.add(rel);
      }

      const referenced = new Map<string, ProjectFile>();
      for (const f of model.csproj.files) {
        if (f.kind === "js") referenced.set(f.relPath, f);
      }

      const allJs = new Set<string>([...whitelist, ...referenced.keys()]);

      // 1. Add whitelisted .js not yet referenced.
      for (const rel of whitelist) {
        if (referenced.has(rel)) continue;
        const d = desired(rel, allJs);
        const children: ItemChild[] = [];
        if (d.dependentUpon) children.push({ tag: "DependentUpon", text: d.dependentUpon });
        children.push({ tag: "CopyToOutputDirectory", text: d.copyToOutput === "None" ? "Never" : d.copyToOutput });

        model.csproj.edits.push({ op: "add-item", tag: "Content", include: toInclude(rel), children });
        model.csproj.files.push({
          absPath: path.resolve(csprojDir, rel.replace(/\//g, path.sep)),
          relPath: rel,
          kind: "js",
          isMinified: isMin(rel),
          dependentUpon: d.dependentUpon ? baseOf(rel) : undefined,
          copyToOutput: d.copyToOutput,
        });
        referenced.set(rel, model.csproj.files[model.csproj.files.length - 1]!);
        changes.push({ handler: "js-inclusion", kind: "add", target: rel, detail: "added to project" });
      }

      // 2. Enforce nesting + copy-state ONLY on referenced items that are
      //    within the whitelist (existing items outside the roots are ignored).
      for (const [rel, file] of referenced) {
        if (!whitelist.has(rel)) continue;
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
