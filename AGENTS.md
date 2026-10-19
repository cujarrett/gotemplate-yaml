# Go Template in YAML

A VS Code extension with two parts.

- Highlighting: one TextMate grammar injected into YAML.
- Go to definition: [src/definitions.ts](./src/definitions.ts) holds all the logic and has no VS Code dependency, so it runs under `node --test`. [src/extension.ts](./src/extension.ts) registers the provider and reads workspace files.

esbuild bundles both into `dist/extension.js`, used for desktop and vscode.dev alike, so it must not import Node modules. `yaml` is bundled, so every package is a devDependency and `node_modules` never ships.

## Rules

- **Never run `git add`, `git commit`, `git push`, or any git command that writes to the
  index, history, or a remote.** Output the commands instead - staging is the human's review.
- **Never add a `Co-Authored-By` trailer or a "Generated with Claude Code" line** to commit messages or PR descriptions, including in suggested commit messages. Commits are authored by the user alone.
- **Always give a suggested commit message**, with `git add` and the commit as two separate
  steps, listing every file explicitly. Never `git add .` or a bare directory.
- **Never output a `git push` command.**
- Run `/security-review` before suggesting a commit. Report one line when clean.

## Build

Run `npm ci` once.

- `just ci`: lint (including `tsc`), test, then build.
- `just test`: unit tests in `test/*.test.ts`, then each fixture in `test/fixtures/` against its `.snap`.
- `just snap`: rewrites the snapshots after an intended highlighting change. The diff is the review.
- `just build`: produces the `.vsix`. `just run` installs it into the local editor.

`test/grammars/` is VS Code's own YAML grammar, copied from its install.

## The injection

The grammar is injected into `source.yaml`, so it applies to every YAML file with no
configuration. Two things have to stay true or it silently stops working:

- `scopeName` in the grammar must match `scopeName` in the `contributes.grammars` entry.
- `injectTo` must list `source.yaml`. Without it VS Code registers a scope nothing maps to,
  the extension loads without error, and no file is ever highlighted.

`injectionSelector` narrows where inside YAML the patterns apply. It lists block scalars
first because that is where Crossplane, Helm and Argo put templates.

## Publishing

`just publish` needs `VSCE_PAT` in the environment, from an Azure DevOps personal access
token with Marketplace publish scope. CI publishes on a push to main and skips silently
when the version already exists, so a release is a version bump in `package.json` plus a
`CHANGELOG.md` entry.
