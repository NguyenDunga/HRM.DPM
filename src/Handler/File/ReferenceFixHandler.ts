import fs from "node:fs";
import path from "node:path";
import type { Handler } from "../Handler.js";
import type { Change, ItemChild, ProjectModel } from "../../Project/Interface.js";

/**
 * Fix broken project references (migrated from HRM.PMS fix_project_missing_add_dll):
 *  - For each <ProjectReference> whose target .csproj is missing on disk,
 *    search the configured libraryPaths for the matching DLL.
 *  - The DLL base name is nameMap[name] (or the reference Name itself).
 *  - When found, replace the ProjectReference with a
 *    <Reference Include="Name"><HintPath>..\\rel\\Name.dll</HintPath></Reference>.
 *  - When not found, warn and leave the reference untouched.
 *
 * Idempotent: intact references (target exists) are skipped.
 */
export const ReferenceFixHandler: Handler = (() => {
  /** Resolve the DLL file name for a reference name via the config map. */
  function dllFileName(name: string, nameMap: Record<string, string>): string {
    const mapped = nameMap[name] ?? name;
    return /\.dll$/i.test(mapped) ? mapped : `${mapped}.dll`;
  }

  /** First libraryPath (absolute) containing the DLL, or undefined. */
  function findDll(rootDir: string, libraryPaths: string[], dllName: string): string | undefined {
    for (const lib of libraryPaths) {
      const abs = path.isAbsolute(lib) ? lib : path.resolve(rootDir, lib);
      const candidate = path.join(abs, dllName);
      if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
  }

  return {
    name: "reference-fix",

    applicable: (model) =>
      model.config.libraryPaths.length > 0 &&
      model.csproj.projectReferences.some((r) => !r.exists),

    run: (model: ProjectModel): Change[] => {
      const changes: Change[] = [];
      const { rootDir, config } = model;
      const csprojDir = path.dirname(model.csproj.path);

      for (const ref of model.csproj.projectReferences) {
        if (ref.exists) continue; // intact reference — skip

        const refName = ref.name ?? path.basename(ref.include).replace(/\.[^.]+$/, "");
        const dllName = dllFileName(refName, config.nameMap);
        const dllPath = findDll(rootDir, config.libraryPaths, dllName);

        if (!dllPath) {
          changes.push({
            handler: "reference-fix",
            kind: "modify",
            target: refName,
            detail: `broken reference — ${dllName} not found in libraryPaths`,
          });
          continue;
        }

        // HintPath relative to the csproj directory, in native backslash form.
        const hintPath = path.relative(csprojDir, dllPath).replace(/\//g, "\\");
        const children: ItemChild[] = [{ tag: "HintPath", text: hintPath }];

        model.csproj.edits.push({ op: "remove-item", include: ref.include });
        model.csproj.edits.push({ op: "add-item", tag: "Reference", include: refName, children });

        // Reflect in the model.
        ref.exists = true;
        changes.push({
          handler: "reference-fix",
          kind: "modify",
          target: refName,
          detail: `replaced broken ProjectReference with Reference -> ${hintPath}`,
        });
      }

      return changes;
    },
  };
})();
