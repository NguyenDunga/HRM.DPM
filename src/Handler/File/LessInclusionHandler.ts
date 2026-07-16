import fs from "node:fs";
import path from "node:path";
import type { Handler } from "../Handler.js";
import type { AssetKind, Change, CopyToOutput, ItemChild, ProjectFile, ProjectModel } from "../../Project/Model.js";

/**
 * Less inclusion rules (HRM.UI.csproj):
 *  - For each style.less under a configured lessRoot, ensure the chain
 *    style.less -> style.css -> style.min.css is referenced (css/min.css are
 *    build outputs and are added even if not yet on disk).
 *  - Nest as style.less <- style.css <- style.min.css (DependentUpon chain).
 *  - Copy-state on build: style.less & style.css -> "None",
 *    style.min.css -> "Always".
 *
 * Idempotent: re-running on an already-correct project yields no changes.
 */
export const LessInclusionHandler: Handler = (() => {
  const SKIP_DIRS = new Set(["node_modules", "obj", "bin", ".vs", ".git"]);

  /** Recursively list *.less under dir, as project-relative forward-slash paths. */
  function listLess(root: string, rootRel: string): string[] {
    const out: string[] = [];
    const walk = (abs: string, rel: string) => {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          walk(path.join(abs, entry.name), `${rel}/${entry.name}`);
        } else if (entry.name.toLowerCase().endsWith(".less")) {
          out.push(`${rel}/${entry.name}`);
        }
      }
    };
    walk(root, rootRel);
    return out;
  }

  const baseName = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);
  const toInclude = (rel: string) => rel.replace(/\//g, "\\");
  /** "Views/Emp.less" -> "Views/Emp" */
  const stem = (lessRel: string) => lessRel.replace(/\.less$/i, "");

  interface ChainLink {
    rel: string;
    kind: AssetKind;
    /** relPath of the parent in the chain, or undefined for the .less root. */
    parent?: string;
    copyToOutput: CopyToOutput;
  }

  /** The three links derived from a .less path. */
  function chainOf(lessRel: string): ChainLink[] {
    const s = stem(lessRel);
    const less = lessRel;
    const css = `${s}.css`;
    const min = `${s}.min.css`;
    return [
      { rel: less, kind: "less", copyToOutput: "None" },
      { rel: css, kind: "css", parent: less, copyToOutput: "None" },
      { rel: min, kind: "css", parent: css, copyToOutput: "Always" },
    ];
  }

  return {
    name: "less-inclusion",

    applicable: (model) => model.config.lessRoots.length > 0,

    run: (model: ProjectModel): Change[] => {
      const changes: Change[] = [];
      const { rootDir } = model;

      const diskLess: string[] = [];
      for (const root of model.config.lessRoots) {
        const abs = path.join(rootDir, root);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
          changes.push({
            handler: "less-inclusion",
            kind: "modify",
            target: root,
            detail: `lessRoot "${root}" does not exist — skipped`,
          });
          continue;
        }
        diskLess.push(...listLess(abs, root));
      }

      const byRel = new Map<string, ProjectFile>();
      for (const f of model.csproj.files) byRel.set(f.relPath, f);

      for (const lessRel of diskLess) {
        for (const link of chainOf(lessRel)) {
          const existing = byRel.get(link.rel);
          const wantDep = link.parent ? baseName(link.parent) : undefined;

          if (!existing) {
            // Add the item with correct children in one shot.
            const children: ItemChild[] = [];
            if (wantDep) children.push({ tag: "DependentUpon", text: wantDep });
            children.push({ tag: "CopyToOutputDirectory", text: link.copyToOutput === "None" ? "Never" : link.copyToOutput });
            model.csproj.edits.push({ op: "add-item", tag: "Content", include: toInclude(link.rel), children });
            const pf: ProjectFile = {
              absPath: path.resolve(rootDir, link.rel.replace(/\//g, path.sep)),
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

          // Enforce nesting + copy-state on existing items.
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
