grammars := "-g test/grammars/yaml.tmLanguage.json -g test/grammars/yaml-1.2.tmLanguage.json -g test/grammars/yaml-embedded.tmLanguage.json"

# Package the extension into a .vsix without publishing.
build:
    npx --yes @vscode/vsce package

# Validate the manifest and grammar the same way packaging does.
lint:
    python3 -m json.tool syntaxes/gotemplate-yaml.tmLanguage.json > /dev/null
    python3 -m json.tool package.json > /dev/null
    npx --yes @vscode/vsce ls > /dev/null

# Fails if highlighting of test/fixtures/sample.yaml differs from sample.yaml.snap.
# test/grammars/ is VS Code's own YAML grammar, which ours plugs into.
test:
    npx --yes --package vscode-tmgrammar-test@0.1.3 vscode-tmgrammar-snap -s source.yaml {{grammars}} 'test/fixtures/*.yaml'

# Run after changing highlighting on purpose, then check the .snap diff in git.
snap:
    npx --yes --package vscode-tmgrammar-test@0.1.3 vscode-tmgrammar-snap -s source.yaml --updateSnapshot {{grammars}} 'test/fixtures/*.yaml'

ci: lint test build

# Install the packaged build into the local editor to try it.
run: build
    code --install-extension $(ls -t *.vsix | head -1) --force

# Publish to the Marketplace. Needs VSCE_PAT in the environment.
publish:
    npx --yes @vscode/vsce publish
