# Package the extension into a .vsix without publishing.
build:
    npx --yes @vscode/vsce package

# Validate the manifest and grammar the same way packaging does.
lint:
    python3 -m json.tool syntaxes/gotemplate-yaml.tmLanguage.json > /dev/null
    python3 -m json.tool package.json > /dev/null
    npx --yes @vscode/vsce ls > /dev/null

ci: lint build

# Install the packaged build into the local editor to try it.
run: build
    code --install-extension $(ls -t *.vsix | head -1) --force

# Publish to the Marketplace. Needs VSCE_PAT in the environment.
publish:
    npx --yes @vscode/vsce publish
