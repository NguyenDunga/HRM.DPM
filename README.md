# DPM (dotnet-package-management)

DPM is a command-line tool that fixes common project-file inconsistencies in
legacy .NET projects. It scans one or more `.csproj` projects, corrects how
front-end assets (JavaScript, LESS/CSS) and library references are declared, and
writes the changes back while preserving the original file formatting.

The tool applies minimal, formatting-preserving edits: untouched lines in a
`.csproj` remain byte-identical after a run, so diffs stay small and reviewable.

## What it fixes

### JavaScript inclusion

- Adds any `.js` file found under a configured script root that is not yet
  referenced in the project.
- When a file exists in both plain and minified form in the same folder (for
  example `node.js` and `node.min.js`), nests the minified file under the plain
  one (`node.min.js` becomes a child of `node.js`).
- Normalizes the build copy state for such pairs: the source file is set to
  "do not copy" and the minified file is set to "copy always".

### LESS and CSS inclusion

- For a style chain of `style.less`, `style.css`, and `style.min.css`, adds and
  nests them as `style.less` -> `style.css` -> `style.min.css`.
- Normalizes copy state: `style.less` and `style.css` are set to "do not copy"
  and `style.min.css` is set to "copy always".

### Project reference repair

- Detects `ProjectReference` entries whose target `.csproj` no longer exists on
  disk and replaces them with a direct assembly `Reference` plus a `HintPath`,
  resolving the DLL from the configured library paths.
- Uses the configured name map to translate a reference name to its DLL base
  name when the two differ.

### Bundle and compiler config

- `bundleconfig.json` and `compilerconfig.json` are loaded (tolerating a leading
  byte-order mark) and rewritten only when modified. Handling of these files is
  in progress.

## Installation

```
npm install
npm run build
```

To use `dpm` as a global command, link it after building:

```
npm link
```

On Windows this registers the proper command shim so the shell runs the tool
through Node rather than opening the script file.

## Usage

```
dpm <solution-dir> [config-path] [--dry-run]
```

- `<solution-dir>` — the directory whose `dpm.config.json` lists the projects to
  process. A single project is just a solution with one project root of `"."`.
- `[config-path]` — optional path to a specific config file. When omitted, the
  tool reads `dpm.config.json` from the solution directory.
- `--dry-run` — report the changes without writing anything to disk.

Examples:

```
dpm D:\Projects\HRM --dry-run
dpm D:\Projects\HRM D:\Projects\HRM\dpm.config.json
```

If you have not linked the command, run it through the package scripts instead:

```
npm start -- D:\Projects\HRM --dry-run
node dist/cli.js D:\Projects\HRM --dry-run
```

## Configuration

Configuration lives in `dpm.config.json`. Each entry in `projectRoots` is an
object with a `Path` plus optional per-project overrides. Shared settings can be
declared at the top level and are inherited by every project.

```json
{
    "projectRoots": [
        {
            "Path": "D:\\Projects\\HRM\\HRM.Entities",
            "libraryPaths": [
                "D:\\Projects\\HRM\\DLL",
                "D:\\Projects\\DLL.NET.6"
            ]
        },
        {
            "Path": "D:\\Projects\\HRM\\HRM.UI",
            "libraryPaths": [
                "D:\\Projects\\HRM\\DLL",
                "D:\\Projects\\DLL.NET.6"
            ],
            "scriptRoots": [
                ".\\Scripts\\_Library"
            ],
            "lessRoots": [
                ".\\Scripts\\_Library"
            ]
        }
    ],
    "libraryNameMap": {
        "HRM.MemCached": "HRM.MemCache",
        "HRM.eOffice": "HRM.Office"
    }
}
```

### Fields

- `projectRoots` — array of project entries. Each entry has:
  - `Path` — the project directory, absolute or relative to the solution
    directory.
  - `scriptRoots` — folders scanned for `.js` inclusion (optional).
  - `lessRoots` — folders scanned for `.less` / `.css` inclusion (optional).
  - `libraryPaths` — folders searched for library DLLs when repairing broken
    references (optional).
  - `nameMap` — per-project reference-to-DLL name map, merged over
    `libraryNameMap` (optional).
- `libraryNameMap` — shared reference-to-DLL name map applied to all projects.
- `scriptRoots`, `lessRoots`, `libraryPaths` — optional solution-level defaults
  inherited by projects that do not set their own.

### Resolution order

For each project, a setting resolves in this order: the project-level value, then
the solution-level default, then empty. The effective `nameMap` is
`libraryNameMap` merged with any per-project `nameMap`, where the per-project
values win on conflicts.

If a root list (`scriptRoots`, `lessRoots`, or `libraryPaths`) is not specified
at either the project or solution level, it defaults to empty and the
corresponding step is skipped silently for that project. No error is raised.

## Development

```
npm run dev        # run against source with watch mode
npm run typecheck  # type-check without emitting
npm test           # run the test suite
npm run build      # produce dist/cli.js
```

The tool is written in TypeScript and uses `fast-xml-parser` for reading
`.csproj` files. Tests run on the Playwright test runner as plain Node unit
tests.
