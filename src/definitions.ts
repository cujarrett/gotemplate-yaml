import { isMap, isScalar, isSeq, parseAllDocuments, visit } from 'yaml'
import type { Document, YAMLMap } from 'yaml'

export type Span = { start: number; end: number }
export type TypeRef = { group: string; version: string; kind: string }

export type Target =
  | { kind: 'local'; spans: Span[] }
  | { kind: 'define'; name: string }
  | { kind: 'xrd'; ref: TypeRef; path: string[] }

const xrPrefix = ['observed', 'composite', 'resource']

// What Cmd+click at offset should open.
// local: spans in the same file.
// define: a named template not defined in this file, to look for in the workspace.
// xrd: an XR field, to look for in the XRD that the composition's compositeTypeRef names.
export function findTarget(text: string, offset: number): Target | undefined {
  const docs = parseAllDocuments(text)
  const scope = templateScope(docs, text, offset)
  const action = actionAt(text, offset, scope)
  if (!action) return undefined

  const literal = stringAt(text, offset, action)
  if (literal) {
    const before = text.slice(action.start, literal.span.start)
    if (/\b(include|template)\s*$/.test(before)) {
      const spans = defineSpans(text, literal.value)
      return spans.length ? { kind: 'local', spans } : { kind: 'define', name: literal.value }
    }
    if (/\b(index|getComposedResource)\b/.test(before)) {
      const spans = resourceSpans(text, literal.value)
      return spans.length ? { kind: 'local', spans } : undefined
    }
    return undefined
  }

  const chain = chainAt(text, offset)
  if (!chain) return undefined

  if (chain.root.startsWith('$') && chain.root !== '$' && chain.segments.length === 0) {
    const spans = variableSpans(text, scope, chain.root).map(d => d.span)
    return spans.length ? { kind: 'local', spans } : undefined
  }

  const path = resolve(text, scope, offset, chain.root, chain.segments, 0)
  if (!path || path.length <= xrPrefix.length) return undefined
  if (!xrPrefix.every((seg, i) => path[i] === seg)) return undefined
  // Crossplane supplies metadata itself, so no XRD declares it.
  if (path[xrPrefix.length] === 'metadata') return undefined
  const ref = compositeTypeRef(docs, offset)
  return ref ? { kind: 'xrd', ref, path: path.slice(xrPrefix.length) } : undefined
}

// The text a template variable can be seen from.
// Block scalar: a go-templating step's template, so steps sharing variable names stay apart.
// Anything else: the whole file, which is how Helm scopes a template.
function templateScope(docs: Document.Parsed[], text: string, offset: number): Span {
  const whole = { start: 0, end: text.length }
  const doc = docs.find(d => d.range[0] <= offset && offset <= d.range[2])
  if (!doc || doc.errors.length) return whole
  let found: Span | undefined
  visit(doc, {
    Scalar(_, node) {
      if (!node.range || typeof node.value !== 'string') return
      const [start, end] = node.range
      if (start <= offset && offset <= end) {
        found = { start, end }
        return visit.BREAK
      }
    },
  })
  return found ?? whole
}

function actionAt(text: string, offset: number, scope: Span): Span | undefined {
  const open = text.lastIndexOf('{{', offset)
  if (open < scope.start) return undefined
  const closeBefore = text.lastIndexOf('}}', offset - 1)
  if (closeBefore > open) return undefined
  const close = text.indexOf('}}', offset)
  if (close === -1 || close > scope.end) return undefined
  return { start: open + 2, end: close }
}

function stringAt(text: string, offset: number, action: Span) {
  const re = /"((?:[^"\\\n]|\\.)*)"|`([^`]*)`/g
  re.lastIndex = action.start
  for (let m = re.exec(text); m && m.index < action.end; m = re.exec(text)) {
    const span = { start: m.index, end: m.index + m[0].length }
    if (span.start <= offset && offset < span.end) {
      return { span, value: m[1] ?? m[2] }
    }
  }
  return undefined
}

// A dotted chain such as $xr.spec.parameters.foo, cut after the segment under the cursor.
function chainAt(text: string, offset: number) {
  const isChar = (c: string | undefined) => !!c && /[\w$.]/.test(c)
  let start = offset
  while (isChar(text[start - 1])) start--
  let end = offset
  while (isChar(text[end]) && text[end] !== '.') end++
  if (start === end) return undefined
  const chain = text.slice(start, end)
  const root = chain.match(/^\$\w*/)?.[0] ?? ''
  if (!root && !chain.startsWith('.')) return undefined
  const segments = chain.slice(root.length).split('.').filter(Boolean)
  return { root, segments }
}

// Expands $variables until the chain starts from the template root, or gives up.
function resolve(text: string, scope: Span, offset: number, root: string, segments: string[], depth: number): string[] | undefined {
  if (root === '' || root === '$') return segments
  if (depth > 5) return undefined
  const defs = variableSpans(text, scope, root).filter(d => d.value !== undefined)
  const def = defs.filter(d => d.span.start < offset).pop() ?? defs[0]
  if (!def?.value) return undefined
  const value = def.value.match(/^(\$\w*)?((?:\.\w+)*)\s*(\||$)/)
  if (!value || (!value[1] && !value[2])) return undefined
  const valueSegments = value[2].split('.').filter(Boolean)
  return resolve(text, scope, def.span.start, value[1] ?? '', [...valueSegments, ...segments], depth + 1)
}

// Every := for the variable in scope.
// value: the right-hand side, only for a single-variable declaration.
// range $k, $v := has no value, because the right-hand side is the collection.
function variableSpans(text: string, scope: Span, name: string) {
  const re = /(\$\w+)(?:\s*,\s*(\$\w+))?\s*:=\s*([^}]*)/g
  re.lastIndex = scope.start
  const defs: { span: Span; value?: string }[] = []
  for (let m = re.exec(text); m && m.index < scope.end; m = re.exec(text)) {
    if (m[1] === name) {
      defs.push({ span: { start: m.index, end: m.index + name.length }, value: m[2] ? undefined : m[3].replace(/-?\s*$/, '').trim() })
    }
    if (m[2] === name) {
      const start = m.index + m[0].indexOf(m[2], m[1].length)
      defs.push({ span: { start, end: start + name.length } })
    }
  }
  return defs
}

export function defineSpans(text: string, name: string): Span[] {
  const re = /\{\{-?\s*define\s+"((?:[^"\\]|\\.)*)"/g
  const spans: Span[] = []
  for (const m of text.matchAll(re)) {
    if (m[1] !== name) continue
    const start = m.index + m[0].length - name.length - 1
    spans.push({ start, end: start + name.length })
  }
  return spans
}

function resourceSpans(text: string, name: string): Span[] {
  const re = /composition-resource-name["']?\s*:\s*["']?([\w.-]+)/g
  const spans: Span[] = []
  for (const m of text.matchAll(re)) {
    if (m[1] !== name) continue
    const start = m.index + m[0].length - name.length
    spans.push({ start, end: start + name.length })
  }
  return spans
}

function compositeTypeRef(docs: Document.Parsed[], offset: number): TypeRef | undefined {
  const doc = docs.find(d => d.range[0] <= offset && offset <= d.range[2])
  const apiVersion = doc?.getIn(['spec', 'compositeTypeRef', 'apiVersion'])
  const kind = doc?.getIn(['spec', 'compositeTypeRef', 'kind'])
  if (typeof apiVersion !== 'string' || typeof kind !== 'string') return undefined
  const [group, version] = apiVersion.split('/')
  return version ? { group, version, kind } : undefined
}

// The key for the last path segment in a matching XRD's openAPIV3Schema.
// Prefers the version the composition names, then tries the others.
export function xrdFieldSpan(text: string, ref: TypeRef, path: string[]): Span | undefined {
  for (const doc of parseAllDocuments(text)) {
    if (doc.get('kind') !== 'CompositeResourceDefinition') continue
    if (doc.getIn(['spec', 'group']) !== ref.group) continue
    if (doc.getIn(['spec', 'names', 'kind']) !== ref.kind) continue
    const versions = doc.getIn(['spec', 'versions'], true)
    if (!isSeq(versions)) continue
    const items = versions.items.filter(isMap)
    items.sort((a, b) => Number(b.get('name') === ref.version) - Number(a.get('name') === ref.version))
    for (const version of items) {
      const span = schemaSpan(version.getIn(['schema', 'openAPIV3Schema'], true), path)
      if (span) return span
    }
  }
  return undefined
}

function schemaSpan(schema: unknown, path: string[]): Span | undefined {
  let node = schema
  let span: Span | undefined
  for (const seg of path) {
    // An array's fields live under items.
    // A variable from range $x := over that array reaches them with no index in the path.
    while (isMap(node) && !node.has('properties') && node.has('items')) node = node.get('items', true)
    if (!isMap(node)) return undefined
    const props = node.get('properties', true)
    if (!isMap(props)) return undefined
    const pair = (props as YAMLMap).items.find(p => isScalar(p.key) && p.key.value === seg)
    if (!pair || !isScalar(pair.key) || !pair.key.range) return undefined
    span = { start: pair.key.range[0], end: pair.key.range[1] }
    node = pair.value
  }
  return span
}

export function lineCol(text: string, offset: number) {
  let line = 0
  let lineStart = 0
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) {
    line++
    lineStart = i + 1
  }
  return { line, character: offset - lineStart }
}
