# Go Template in YAML

A VS Code grammar injection. No runtime code, no build step, no dependencies - the whole
extension is `package.json` plus one TextMate grammar.

## Rules

- **Never run `git add`, `git commit`, `git push`, or any git command that writes to the
  index, history, or a remote.** Output the commands instead - staging is the human's review.
- **Always give a suggested commit message**, with `git add` and the commit as two separate
  steps, listing every file explicitly. Never `git add .` or a bare directory.
- **Never output a `git push` command.**
- Run `/security-review` before suggesting a commit. Report one line when clean.

## Build

`just ci` runs lint then build. `just build` produces the `.vsix`; `just run` installs it
into the local editor to try it.

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
