# Vanilla-First Components

- Prefer components that stay as close as possible to plain Svelte components.
- Keep `<script module>` minimal and reserve it for metadata the builder cannot infer from markup.
- Prefer expressing editable targets in markup with `data-builder-field` and `data-builder-collection-item` instead of duplicating selectors in metadata.
- Keep builder metadata focused on real schema needs: `kind`, nested `fields`, `item`, defaults, and labels only when the key is not enough.
- Avoid verbose helper types or configuration when the component stays readable with straightforward `$props()` destructuring.
- If a builder feature can be derived reliably from existing markup or HTML attributes, prefer inference in the builder over per-component boilerplate.

# Configuration Docs

- When documenting configuration, derive the guide from the real implementation and current code paths, not from assumptions.
- Write configuration docs as user-facing manual setup guides that explain how to achieve the desired result by hand.
- Do not structure configuration docs as a walkthrough of what an init script or automation happens to do internally.
- If there is a gap between current automation and the intended manual setup, call it out explicitly and document the manual step.
- Whenever the init script changes, review the embedded and split configuration guides and update them if the manual setup story or documented end state has changed.
