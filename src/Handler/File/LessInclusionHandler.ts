import type { Handler } from "../Handler.js";

/**
 * Less inclusion rules (HRM.UI.csproj):
 *  - For a triplet style.less / style.css / style.min.css, nest as
 *    style.less -> style.css -> style.min.css.
 *  - Copy-state on build: style.less & style.css -> "None",
 *    style.min.css -> "Always".
 */
export const LessInclusionHandler: Handler = (() => {
  return {
    name: "less-inclusion",
    applicable: (model) => model.csproj.files.some((f) => f.kind === "less"),
    run: (_model) => {
      // TODO: implement less/css/min.css nesting + copy-state rules
      return [];
    },
  };
})();
