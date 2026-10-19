# Changelog

## 0.6.0

- Go to definition inside `{{ }}`: a `$variable` to its `:=`, an XR field to its XRD property, an `index` resource name to its annotation, and an `include` name to its `define`.

## 0.5.0

- Highlight the YAML inside `template: |` and `values: |` blocks as YAML, so keys, values and comments in a Crossplane go-templating template or an ArgoCD Helm values block read like the rest of the file.

## 0.4.0

- Colour Go's built-in functions, such as `eq`, `and`, `printf` and `index`, separately from Sprig functions in themes that style built-ins.
- Shrink the package from about 2MB to about 20KB.

## 0.3.2

- Highlight a Go string written with escaped quotes inside a double-quoted YAML value, such as `"{{ printf \"%s\" .name }}"`. The closing `\"` used to be read as an escape, so the expression ran past its `}}` and swallowed the following lines.

## 0.3.1

- Improve the demo image in the README.

## 0.3.0

- Colour `$variables`, the `|` pipe and the `:=` and `=` operators distinctly, so they no longer blend into the surrounding expression.

## 0.2.0

- Highlight dotted field paths like `.observed.foo.bar`.
- Highlight every function, not just a fixed list of 24 names.
- Highlight expressions inside plain and quoted YAML scalars.
- Highlight backquoted raw strings, `nil`, `true`, `false`, floats and negative numbers.
- Stop colouring a field as a keyword when it is named `template`, `index` or similar.

## 0.1.0

- Highlight Go template expressions inside YAML, including block scalars, as a grammar injection rather than a standalone grammar. The previous build registered a scope nothing mapped to, so it never applied to a real file.
