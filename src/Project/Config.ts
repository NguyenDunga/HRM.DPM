import type { DpmConfig } from "./Interface";

/** Effective per-project defaults, applied when a field is not set. */
export const DEFAULT_CONFIG: DpmConfig = {
  scriptRoots: [
    "."
  ],
  lessRoots: [
    "."
  ],
  libraryPaths: [
    "."
  ],
  nameMap: {
    "HRM.MemCached": "HRM.MemCache",
    "HRM.eOffice": "HRM.Office"
  },
};

/** csproj item tags that reference a file we care about. */
export const FILE_ITEM_TAGS = ["Content", "None", "TypeScriptCompile", "Compile"];
