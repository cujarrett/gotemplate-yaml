# Changelog

## 0.2.0

- Highlight dotted field paths like `.observed.foo.bar`.
- Highlight every function, not just a fixed list of 24 names.
- Highlight expressions inside plain and quoted YAML scalars.
- Highlight backquoted raw strings, `nil`, `true`, `false`, floats and negative numbers.
- Stop colouring a field as a keyword when it is named `template`, `index` or similar.

## 0.1.0

- Highlight Go template expressions inside YAML, including block scalars, as a grammar injection rather than a standalone grammar. The previous build registered a scope nothing mapped to, so it never applied to a real file.
