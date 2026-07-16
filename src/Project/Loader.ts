import fs from "node:fs";
import path from "node:path";
import { Xml, type XmlNode } from "./Parser.js";
import type {
  AssetKind,
  BundleEntry,
  CompilerEntry,
  CopyToOutput,
  ProjectFile,
  ProjectModel,
} from "./Model.js";

/** csproj item tags that reference a file we care about. */
const FILE_ITEM_TAGS = ["Content", "None", "TypeScriptCompile", "Compile"];

/**
 * Loads a .NET project directory into a ProjectModel and writes it back.
 *
 * load() is implemented: it locates the single *.csproj in rootDir, parses it,
 * and extracts file items. commit() is still a stub (targeted string edits, to
 * preserve formatting).
 */
export const ProjectLoader = (() => {
  function findCsproj(rootDir: string): string {
    const hits = fs
      .readdirSync(rootDir)
      .filter((f) => f.toLowerCase().endsWith(".csproj"));
    if (hits.length === 0) throw new Error(`No .csproj found in ${rootDir}`);
    if (hits.length > 1) throw new Error(`Multiple .csproj in ${rootDir}: ${hits.join(", ")}`);
    return path.join(rootDir, hits[0]!);
  }

  function classify(relPath: string): { kind: AssetKind; isMinified: boolean } {
    const lower = relPath.toLowerCase();
    const isMinified = /\.min\.(js|css)$/.test(lower);
    let kind: AssetKind = "other";
    if (lower.endsWith(".js")) kind = "js";
    else if (lower.endsWith(".less")) kind = "less";
    else if (lower.endsWith(".css")) kind = "css";
    else if (lower.endsWith(".dll")) kind = "dll";
    return { kind, isMinified };
  }

  function copyState(item: XmlNode): CopyToOutput | undefined {
    for (const child of Xml.children(item)) {
      if (Xml.tagName(child) === "CopyToOutputDirectory") {
        const v = (Xml.text(child) ?? "").trim();
        if (v === "Always") return "Always";
        if (v === "PreserveNewest") return "PreserveNewest";
        if (v === "Never") return "None";
      }
    }
    return undefined;
  }

  function dependentUpon(item: XmlNode): string | undefined {
    for (const child of Xml.children(item)) {
      if (Xml.tagName(child) === "DependentUpon") {
        const v = (Xml.text(child) ?? "").trim();
        return v ? v.replace(/\\/g, "/") : undefined;
      }
    }
    return undefined;
  }

  function toProjectFile(item: XmlNode, rootDir: string): ProjectFile | undefined {
    const include = Xml.attr(item, "Include");
    if (!include) return undefined;
    const relPath = include.replace(/\\/g, "/");
    const { kind, isMinified } = classify(relPath);
    return {
      absPath: path.resolve(rootDir, include.replace(/\\/g, path.sep)),
      relPath,
      kind,
      isMinified,
      dependentUpon: dependentUpon(item),
      copyToOutput: copyState(item),
    };
  }

  function readJson<T>(file: string): T | undefined {
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  }

  function load(rootDir: string): ProjectModel {
    const csprojPath = findCsproj(rootDir);
    const raw = fs.readFileSync(csprojPath, "utf8");
    const doc = Xml.parse(raw);

    const files: ProjectFile[] = [];
    for (const tag of FILE_ITEM_TAGS) {
      for (const item of Xml.findAll(doc, tag)) {
        const pf = toProjectFile(item, rootDir);
        if (pf) files.push(pf);
      }
    }

    return {
      rootDir,
      csproj: { path: csprojPath, raw, files },
      bundleConfig: readJson<BundleEntry[]>(path.join(rootDir, "bundleconfig.json")),
      compilerConfig: readJson<CompilerEntry[]>(path.join(rootDir, "compilerconfig.json")),
    };
  }

  function commit(_model: ProjectModel): void {
    throw new Error("ProjectLoader.commit not implemented");
  }

  return { load, commit };
})();
