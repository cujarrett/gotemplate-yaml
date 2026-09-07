# Changelog

## 0.1.0

- Highlight Go template expressions inside YAML, including block scalars, as a grammar injection rather than a standalone grammar. The previous build registered a scope nothing mapped to, so it never applied to a real file.
