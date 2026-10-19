import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findTarget, xrdFieldSpan } from '../src/definitions.ts'
import type { Target } from '../src/definitions.ts'

const composition = `apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: foo
spec:
  compositeTypeRef:
    apiVersion: platform.example.org/v1alpha1
    kind: XFoo
  pipeline:
    - step: first
      input:
        template: |
          {{- $xr := .observed.composite.resource }}
          {{- $params := $xr.spec.parameters -}}
          {{- $observedResources := .observed.resources | default dict }}
          {{- define "labels" }}app: bar{{ end }}
          ---
          metadata:
            name: {{ $params.name }}
            labels: {{ include "labels" . }}
            annotations:
              gotemplating.fn.crossplane.io/composition-resource-name: deployment
          spec:
            replicas: {{ $.observed.composite.resource.spec.replicas }}
            image: {{ (index $observedResources "deployment").resource.spec }}
            other: {{ include "missing" . }}
          {{- range $i, $port := $params.ports }}
            port: {{ $port }}
          {{- end }}
    - step: second
      input:
        template: |
          {{- $xr := .observed.composite.resource }}
          name: {{ $xr.metadata.name }}
`

// Offset of the first character of needle, plus shift, searching from the first occurrence of after.
function at(needle: string, shift = 0, after = '') {
  const from = after ? composition.indexOf(after) : 0
  const i = composition.indexOf(needle, from)
  assert.notEqual(i, -1, needle)
  return i + shift
}

function spans(target: Target | undefined) {
  assert.ok(target?.kind === 'local', `expected local, got ${target?.kind}`)
  return target.spans
}

function path(target: Target | undefined) {
  assert.ok(target?.kind === 'xrd', `expected xrd, got ${target?.kind}`)
  return target.path
}

function lines(spans: { start: number }[]) {
  return spans.map(s => composition.slice(0, s.start).split('\n').length)
}

test('variable jumps to its := in the same template step only', () => {
  const target = findTarget(composition, at('$xr.spec', 1))
  assert.deepEqual(lines(spans(target)), [13])

  const second = findTarget(composition, at('$xr.metadata', 1))
  assert.deepEqual(lines(spans(second)), [33])
})

test('range variables count as declarations', () => {
  const target = findTarget(composition, at('$port }}', 2))
  assert.deepEqual(lines(spans(target)), [27])
})

test('field through two variables resolves to the XR path', () => {
  assert.deepEqual(findTarget(composition, at('$params.name', 9)), {
    kind: 'xrd',
    ref: { group: 'platform.example.org', version: 'v1alpha1', kind: 'XFoo' },
    path: ['spec', 'parameters', 'name'],
  })
})

test('cursor mid-chain stops the path at that segment', () => {
  const target = findTarget(composition, at('$xr.spec', 5))
  assert.deepEqual(path(target), ['spec'])
})

test('absolute path from $ resolves to the XR path', () => {
  const target = findTarget(composition, at('spec.replicas', 7))
  assert.deepEqual(path(target), ['spec', 'replicas'])
})

test('XR metadata has no XRD lookup', () => {
  assert.equal(findTarget(composition, at('$xr.metadata', 6)), undefined)
})

test('observed resource name jumps to its annotation', () => {
  const target = findTarget(composition, at('"deployment"', 3))
  assert.deepEqual(lines(spans(target)), [22])
})

test('fields of an observed resource are not XR fields', () => {
  assert.equal(findTarget(composition, at('.resource.spec', 12, '"deployment")')), undefined)
})

test('include jumps to define in the same file', () => {
  const target = findTarget(composition, at('include "labels"', 11))
  assert.deepEqual(lines(spans(target)), [16])
})

test('include with no define here asks for a workspace search', () => {
  assert.deepEqual(findTarget(composition, at('"missing"', 2)), { kind: 'define', name: 'missing' })
})

test('plain YAML outside {{ }} has no target', () => {
  assert.equal(findTarget(composition, at('replicas:', 2)), undefined)
})

test('Helm template that is not valid YAML still finds variables', () => {
  const helm = `{{- $name := .Release.Name }}\nmetadata:\n  name: {{ $name }}\n`
  const target = findTarget(helm, helm.lastIndexOf('$name') + 1)
  assert.deepEqual(spans(target), [{ start: 4, end: 9 }])
})

const xrd = `apiVersion: apiextensions.crossplane.io/v1
kind: CompositeResourceDefinition
metadata:
  name: xfoos.platform.example.org
spec:
  group: platform.example.org
  names:
    kind: XFoo
    plural: xfoos
  versions:
    - name: v1alpha1
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                parameters:
                  type: object
                  properties:
                    name:
                      type: string
                    ports:
                      type: array
                      items:
                        type: object
                        properties:
                          number:
                            type: integer
`

test('XRD field lookup lands on the property key', () => {
  const ref = { group: 'platform.example.org', version: 'v1alpha1', kind: 'XFoo' }
  const span = xrdFieldSpan(xrd, ref, ['spec', 'parameters', 'name'])
  assert.ok(span)
  assert.equal(xrd.slice(span.start, span.end), 'name')
  assert.equal(xrd.slice(0, span.start).split('\n').length, 22)
})

test('XRD lookup misses on unknown fields and other kinds', () => {
  const ref = { group: 'platform.example.org', version: 'v1alpha1', kind: 'XFoo' }
  assert.equal(xrdFieldSpan(xrd, ref, ['spec', 'parameters', 'nope']), undefined)
  assert.equal(xrdFieldSpan(xrd, { ...ref, kind: 'XBar' }, ['spec']), undefined)
})

test('XRD lookup steps through array items', () => {
  const ref = { group: 'platform.example.org', version: 'v1alpha1', kind: 'XFoo' }
  const span = xrdFieldSpan(xrd, ref, ['spec', 'parameters', 'ports', 'number'])
  assert.ok(span)
  assert.equal(xrd.slice(span.start, span.end), 'number')
})
