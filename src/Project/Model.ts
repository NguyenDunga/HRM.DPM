/**
 * Shared domain types for DPM.
 *
 * A run operates on a single .NET project directory containing a .csproj file
 * plus optional bundleconfig.json / compilerconfig.json. Handlers read and
 * mutate a shared ProjectModel; nothing touches disk until commit().
 */

/** Build "Copy to Output Directory" state for a csproj item. */
export type CopyToOutput = "None" | "Always" | "PreserveNewest";

/** Kind of asset a file represents in the pipeline. */
export type AssetKind = "js" | "less" | "css" | "dll" | "other";

/** A single file reference inside the project. */
export interface ProjectFile {
  /** Absolute path on disk. */
  absPath: string;
  /** Path relative to the .csproj, using forward slashes. */
  relPath: string;
  kind: AssetKind;
  /** True for *.min.js / *.min.css. */
  isMinified: boolean;
  /** relPath of the parent this file should be nested under, if any. */
  dependentUpon?: string;
  copyToOutput?: CopyToOutput;
}

/**
 * A concrete, formatting-preserving edit for the csproj. Handlers push these;
 * commit() applies each as a minimal string operation on the raw text.
 *
 * Include paths use the csproj's native backslash form (e.g. "Scripts\\a.js").
 */
export type CsprojEdit =
  | { op: "add-item"; tag: string; include: string; children?: ItemChild[] }
  | { op: "remove-item"; include: string }
  | { op: "set-dependent-upon"; include: string; value: string }
  | { op: "set-copy-to-output"; include: string; value: CopyToOutput };

/** A child element of a csproj item, e.g. <DependentUpon>a.js</DependentUpon>. */
export interface ItemChild {
  tag: string;
  text: string;
}

/** In-memory representation of a *.csproj to be edited. */
export interface CsprojModel {
  path: string;
  /** Raw XML as read from disk (content only, BOM stripped). */
  raw: string;
  /** Line ending detected in the source ("\r\n" or "\n"). */
  eol: string;
  /** Whether the source file began with a UTF-8 BOM. */
  hasBom: boolean;
  files: ProjectFile[];
  /** Pending edits recorded by handlers, applied by commit(). */
  edits: CsprojEdit[];
}

/** One entry of bundleconfig.json. */
export interface BundleEntry {
  outputFileName: string;
  inputFiles: string[];
  [k: string]: unknown;
}

/** One entry of compilerconfig.json. */
export interface CompilerEntry {
  outputFile: string;
  inputFile: string;
  sourceMap?: boolean;
  outputUTF8Identifier?: boolean;
  [k: string]: unknown;
}

/** A JSON config file tracked alongside the csproj. */
export interface JsonConfig<T> {
  path: string;
  hasBom: boolean;
  entries: T[];
  /** True when a handler mutated entries and it should be rewritten. */
  dirty: boolean;
}

/** DPM tool configuration (dpm.config.json), with defaults applied. */
export interface DpmConfig {
  /** Folders (relative to project root) scanned for .js inclusion. */
  scriptRoots: string[];
  /** Folders scanned for .less/.css inclusion. */
  lessRoots: string[];
}

/** The full working set a run operates on. */
export interface ProjectModel {
  /** Project root directory (contains the .csproj). */
  rootDir: string;
  csproj: CsprojModel;
  config: DpmConfig;
  bundleConfig?: JsonConfig<BundleEntry>;
  compilerConfig?: JsonConfig<CompilerEntry>;
}

/** A single change a handler proposes, for logging / dry-run. */
export interface Change {
  handler: string;
  kind: "add" | "remove" | "modify";
  target: string;
  detail: string;
}
