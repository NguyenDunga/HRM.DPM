import type { Change, ProjectModel } from "../Project/Interface.js";

/**
 * A Handler inspects the ProjectModel and mutates it in place, returning the
 * changes it made. Handlers must be idempotent.
 */
export interface Handler {
  readonly name: string;
  applicable(model: ProjectModel): boolean;
  run(model: ProjectModel): Change[];
}

/** Runs handlers in order over a single model. */
export const Pipeline = (() => {
  function run(handlers: Handler[], model: ProjectModel): Change[] {
    const changes: Change[] = [];
    for (const h of handlers) {
      if (h.applicable(model)) changes.push(...h.run(model));
    }
    return changes;
  }
  return { run };
})();
