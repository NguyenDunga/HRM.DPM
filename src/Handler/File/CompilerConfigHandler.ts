import type { Handler } from "../Handler.js";

/**
 * compilerconfig.json rules (HRM.UI):
 *  - Remove entries whose input .css/.less no longer exists.
 *  - When a style.less/style.css set is added, ensure a matching entry.
 */
export const CompilerConfigHandler: Handler = (() => {
  return {
    name: "compilerconfig",
    applicable: (model) => model.compilerConfig !== undefined,
    run: (_model) => {
      // TODO: prune missing inputs; add missing entries
      return [];
    },
  };
})();
