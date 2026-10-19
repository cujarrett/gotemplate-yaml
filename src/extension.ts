import * as vscode from 'vscode'
import { defineSpans, findTarget, lineCol, xrdFieldSpan } from './definitions'
import type { Span } from './definitions'

const exclude = '**/{node_modules,.git}/**'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider({ language: 'yaml' }, { provideDefinition }),
  )
}

async function provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
  const target = findTarget(document.getText(), document.offsetAt(position))
  if (!target) return undefined

  if (target.kind === 'local') {
    return target.spans.map(span => location(document.uri, document.getText(), span))
  }

  if (target.kind === 'define') {
    const found: vscode.Location[] = []
    for (const uri of await vscode.workspace.findFiles('**/*.{tpl,yaml,yml}', exclude)) {
      if (token.isCancellationRequested) return undefined
      const text = await read(uri)
      if (!text.includes(target.name)) continue
      found.push(...defineSpans(text, target.name).map(span => location(uri, text, span)))
    }
    return found
  }

  // The XRD usually sits beside its composition, so look there before the whole workspace.
  const siblings = await vscode.workspace.findFiles(
    new vscode.RelativePattern(vscode.Uri.joinPath(document.uri, '..'), '*.{yaml,yml}'),
  )
  const seen = new Set(siblings.map(uri => uri.toString()))
  const rest = (await vscode.workspace.findFiles('**/*.{yaml,yml}', exclude)).filter(uri => !seen.has(uri.toString()))
  for (const uri of [...siblings, ...rest]) {
    if (token.isCancellationRequested) return undefined
    const text = await read(uri)
    if (!text.includes('CompositeResourceDefinition') || !text.includes(target.ref.kind)) continue
    const span = xrdFieldSpan(text, target.ref, target.path)
    if (span) return location(uri, text, span)
  }
  return undefined
}

// An open file can have unsaved edits, and its spans must match what the editor shows.
async function read(uri: vscode.Uri) {
  const open = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString())
  return open ? open.getText() : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
}

function location(uri: vscode.Uri, text: string, span: Span) {
  const start = lineCol(text, span.start)
  const end = lineCol(text, span.end)
  return new vscode.Location(uri, new vscode.Range(start.line, start.character, end.line, end.character))
}
