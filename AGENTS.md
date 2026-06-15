# Vanilla-First Components

- Prefer components that stay as close as possible to plain Svelte components.
- Keep `<script module>` minimal and reserve it for metadata the builder cannot infer from markup.
- Prefer expressing editable targets in markup with `data-brixter-field` and `data-brixter-collection-item` instead of duplicating selectors in metadata.
- Keep builder metadata focused on real schema needs: `kind`, nested `fields`, `item`, defaults, and labels only when the key is not enough.
- Avoid verbose helper types or configuration when the component stays readable with straightforward `$props()` destructuring.
- If a builder feature can be derived reliably from existing markup or HTML attributes, prefer inference in the builder over per-component boilerplate.