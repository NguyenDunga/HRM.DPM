import type { Handler } from "../Handler.js";

/**
 * bundleconfig.json rules (HRM.UI):
 *  - Remove entries whose inputFiles[0] .js no longer exists.
 *  - When a foo.js/foo.min.js pair is added, ensure a matching bundle entry.
 */
export const BundleConfigHandler: Handler = (() => {
  return {
    name: "bundleconfig",
    applicable: (model) => model.bundleConfig !== undefined,
    run: (_model) => {
      // TODO: prune missing inputs; add missing pairs
      return [];
    },
  };
})();
