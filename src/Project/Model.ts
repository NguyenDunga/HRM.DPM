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

/** In-memory representation of a *.csproj to be edited. */
export interface CsprojModel {
  path: string;
  /** Raw XML, parsed lazily by handlers that need it. */
  raw: string;
  files: ProjectFile[];
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

/** The full working set a run operates on. */
export interface ProjectModel {
  /** Project root directory (contains the .csproj). */
  rootDir: string;
  csproj: CsprojModel;
  bundleConfig?: BundleEntry[];
  compilerConfig?: CompilerEntry[];
}

/** A single change a handler proposes, for logging / dry-run. */
export interface Change {
  handler: string;
  kind: "add" | "remove" | "modify";
  target: string;
  detail: string;
}
