import fs from "node:fs";
import path from "node:path";
import { Parser, type XmlNode } from "./Parser.js";
import { Writer } from "./Writer.js";
import type {
  AssetKind,
  BundleEntry,
  CompilerEntry,
  CopyToOutput,
  DpmConfig,
  JsonConfig,
  ProjectFile,
  ProjectModel,
} from "./Model.js";

/** csproj item tags that reference a file we care about. */
const FILE_ITEM_TAGS = ["Content", "None", "TypeScriptCompile", "Compile"];

/**
 * Loads a .NET project directory into a ProjectModel and writes it back.
 *
 * commit() applies the model's recorded edits as minimal string operations so
 * untouched formatting stays byte-identical (see Writer).
 */
export const ProjectLoader = (() => {
  function findCsproj(rootDir: string): string {
    const hits = fs.readdirSync(rootDir).filter((f) => f.toLowerCase().endsWith(".csproj"));
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
    for (const child of Parser.children(item)) {
      if (Parser.tagName(child) === "CopyToOutputDirectory") {
        const v = (Parser.text(child) ?? "").trim();
        if (v === "Always") return "Always";
        if (v === "PreserveNewest") return "PreserveNewest";
        if (v === "Never") return "None";
      }
    }
    return undefined;
  }

  function dependentUpon(item: XmlNode): string | undefined {
    for (const child of Parser.children(item)) {
      if (Parser.tagName(child) === "DependentUpon") {
        const v = (Parser.text(child) ?? "").trim();
        return v ? v.replace(/\\/g, "/") : undefined;
      }
    }
    return undefined;
  }

  function toProjectFile(item: XmlNode, rootDir: string): ProjectFile | undefined {
    const include = Parser.attr(item, "Include");
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

  function readConfig<T>(file: string): JsonConfig<T> | undefined {
    if (!fs.existsSync(file)) return undefined;
    const rawText = fs.readFileSync(file, "utf8");
    const hasBom = rawText.charCodeAt(0) === 0xfeff;
    const entries = JSON.parse(hasBom ? rawText.slice(1) : rawText) as T[];
    return { path: file, hasBom, entries, dirty: false };
  }

  const DEFAULT_CONFIG: DpmConfig = { scriptRoots: ["Scripts"], lessRoots: ["Views"] };

  function readDpmConfig(rootDir: string): DpmConfig {
    const file = path.join(rootDir, "dpm.config.json");
    if (!fs.existsSync(file)) return { ...DEFAULT_CONFIG };
    const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(text) as Partial<DpmConfig>;
    return {
      scriptRoots: parsed.scriptRoots ?? DEFAULT_CONFIG.scriptRoots,
      lessRoots: parsed.lessRoots ?? DEFAULT_CONFIG.lessRoots,
    };
  }

  function load(rootDir: string): ProjectModel {
    const csprojPath = findCsproj(rootDir);
    const rawFull = fs.readFileSync(csprojPath, "utf8");
    const hasBom = rawFull.charCodeAt(0) === 0xfeff;
    const raw = hasBom ? rawFull.slice(1) : rawFull;
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    const doc = Parser.parse(raw);

    const files: ProjectFile[] = [];
    for (const tag of FILE_ITEM_TAGS) {
      for (const item of Parser.findAll(doc, tag)) {
        const pf = toProjectFile(item, rootDir);
        if (pf) files.push(pf);
      }
    }

    return {
      rootDir,
      csproj: { path: csprojPath, raw, eol, hasBom, files, edits: [] },
      config: readDpmConfig(rootDir),
      bundleConfig: readConfig<BundleEntry>(path.join(rootDir, "bundleconfig.json")),
      compilerConfig: readConfig<CompilerEntry>(path.join(rootDir, "compilerconfig.json")),
    };
  }

  function commit(model: ProjectModel): void {
    const { csproj } = model;
    if (csproj.edits.length > 0) {
      const updated = Writer.applyEdits(csproj.raw, csproj.edits, csproj.eol);
      fs.writeFileSync(csproj.path, (csproj.hasBom ? "﻿" : "") + updated, "utf8");
    }
    for (const cfg of [model.bundleConfig, model.compilerConfig]) {
      if (cfg?.dirty) {
        const json = JSON.stringify(cfg.entries, null, 2) + "\n";
        fs.writeFileSync(cfg.path, (cfg.hasBom ? "﻿" : "") + json, "utf8");
      }
    }
  }

  return { load, commit };
})();
