import type { Handler } from "../Handler.js";

/**
 * JavaScript inclusion rules (HRM.UI.csproj):
 *  - Add any Scripts/* file not yet referenced in the csproj.
 *  - When foo.js and foo.min.js share a folder, nest foo.min.js under foo.js.
 *  - Copy-state on build: foo.js -> "None", foo.min.js -> "Always".
 */
export const ScriptInclusionHandler: Handler = (() => {
  return {
    name: "js-inclusion",
    applicable: (model) => model.csproj.files.some((f) => f.kind === "js"),
    run: (_model) => {
      // TODO: implement inclusion + nesting + copy-state rules
      return [];
    },
  };
})();
