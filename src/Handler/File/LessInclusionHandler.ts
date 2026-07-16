import fs from "node:fs";
import path from "node:path";
import type { Handler } from "../Handler.js";
import type { AssetKind, Change, CopyToOutput, ItemChild, ProjectFile, ProjectModel } from "../../Project/Interface.js";

/**
 * Less inclusion rules (HRM.UI.csproj), scoped to a WHITELIST of roots:
 *  - lessRoots is a whitelist. Only .less files under those roots are scanned;
 *    nothing else in the project is touched.
 *  - For each style.less, ensure the chain style.less -> style.css ->
 *    style.min.css is referenced (css/min.css are build outputs, added even if
 *    not yet on disk).
 *  - Nest style.less <- style.css <- style.min.css (DependentUpon chain).
 *  - Copy-state: style.less & style.css -> "None", style.min.css -> "Always".
 *
 * lessRoots may be absolute or relative; relative roots resolve against the
 * project directory. Includes are relative to the .csproj directory. Idempotent.
 */
export const LessInclusionHandler: Handler = (() => {
  const SKIP_DIRS = new Set(["node_modules", "obj", "bin", ".vs", ".git"]);

  /** Normalize a configured root to an absolute path (handles \\ or / separators). */
  function resolveRoot(root: string, rootDir: string): string {
    const norm = root.replace(/\\/g, path.sep).replace(/\//g, path.sep);
    return path.isAbsolute(norm) ? norm : path.resolve(rootDir, norm);
  }

  /** Recursively list *.less under an absolute root, as csproj-relative forward-slash paths. */
  function listLess(rootAbs: string, csprojDir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        const child = path.join(abs, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          walk(child);
        } else if (entry.name.toLowerCase().endsWith(".less")) {
          out.push(path.relative(csprojDir, child).split(path.sep).join("/"));
        }
      }
    };
    walk(rootAbs);
    return out;
  }

  const baseName = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);
  const toInclude = (rel: string) => rel.replace(/\//g, "\\");
  const stem = (lessRel: string) => lessRel.replace(/\.less$/i, "");

  interface ChainLink {
    rel: string;
    kind: AssetKind;
    parent?: string;
    copyToOutput: CopyToOutput;
  }

  function chainOf(lessRel: string): ChainLink[] {
    const s = stem(lessRel);
    return [
      { rel: lessRel, kind: "less", copyToOutput: "None" },
      { rel: `${s}.css`, kind: "css", parent: lessRel, copyToOutput: "None" },
      { rel: `${s}.min.css`, kind: "css", parent: `${s}.css`, copyToOutput: "Always" },
    ];
  }

  return {
    name: "less-inclusion",

    applicable: (model) => model.config.lessRoots.length > 0,

    run: (model: ProjectModel): Change[] => {
      const changes: Change[] = [];
      const { rootDir } = model;
      const csprojDir = path.dirname(model.csproj.path);

      const diskLess: string[] = [];
      for (const root of model.config.lessRoots) {
        const abs = resolveRoot(root, rootDir);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
          changes.push({
            handler: "less-inclusion",
            kind: "modify",
            target: root,
            detail: `lessRoot "${root}" does not exist — skipped`,
          });
          continue;
        }
        diskLess.push(...listLess(abs, csprojDir));
      }

      const byRel = new Map<string, ProjectFile>();
      for (const f of model.csproj.files) byRel.set(f.relPath, f);

      for (const lessRel of diskLess) {
        for (const link of chainOf(lessRel)) {
          const existing = byRel.get(link.rel);
          const wantDep = link.parent ? baseName(link.parent) : undefined;

          if (!existing) {
            const children: ItemChild[] = [];
            if (wantDep) children.push({ tag: "DependentUpon", text: wantDep });
            children.push({ tag: "CopyToOutputDirectory", text: link.copyToOutput === "None" ? "Never" : link.copyToOutput });
            model.csproj.edits.push({ op: "add-item", tag: "Content", include: toInclude(link.rel), children });
            const pf: ProjectFile = {
              absPath: path.resolve(csprojDir, link.rel.replace(/\//g, path.sep)),
              relPath: link.rel,
              kind: link.kind,
              isMinified: /\.min\.css$/i.test(link.rel),
              dependentUpon: link.parent,
              copyToOutput: link.copyToOutput,
            };
            model.csproj.files.push(pf);
            byRel.set(link.rel, pf);
            changes.push({ handler: "less-inclusion", kind: "add", target: link.rel, detail: "added to project" });
            continue;
          }

          const haveDep = existing.dependentUpon ? baseName(existing.dependentUpon) : undefined;
          if (wantDep && haveDep !== wantDep) {
            model.csproj.edits.push({ op: "set-dependent-upon", include: toInclude(link.rel), value: wantDep });
            existing.dependentUpon = link.parent;
            changes.push({ handler: "less-inclusion", kind: "modify", target: link.rel, detail: `DependentUpon -> ${wantDep}` });
          }
          if (existing.copyToOutput !== link.copyToOutput) {
            model.csproj.edits.push({ op: "set-copy-to-output", include: toInclude(link.rel), value: link.copyToOutput });
            existing.copyToOutput = link.copyToOutput;
            changes.push({ handler: "less-inclusion", kind: "modify", target: link.rel, detail: `CopyToOutputDirectory -> ${link.copyToOutput}` });
          }
        }
      }

      return changes;
    },
  };
})();
