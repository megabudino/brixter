# _unused/

Materiale rimosso dall'app durante il refactor Fase 1 (collasso multi-workspace → single-repo, preparazione al package `brixkit`).

Niente di quanto presente qui è importato dal codice attivo dell'app. È conservato come riferimento storico e verrà rivalutato in Fase 2 — destinato a uno di:

- spostato nel **playground** del package `brixkit` (es. demo/manifesto, esempi di test)
- ripristinato dentro `brixkit` se torna utile
- eliminato definitivamente

## Contenuto

### `routes/brandkit/`

Pagina demo che rendeva `lib/shared-content/manifesto.svx`. Non era linkata da nessuna parte della UI dell'app.

### `lib/shared-content/`

Contenuti `.svx` usati solo dalla pagina `brandkit/` di cui sopra.

### `lib/vitest-examples/`

File di scaffold generati da `sv create` con i template di test (`greet.ts`, `Welcome.svelte` e i rispettivi `.spec.ts`). Non sono codice di dominio; servono solo come esempio funzionante di Vitest browser + node multi-project.

## Note

- I percorsi originali erano:
  - `src/routes/brandkit/`
  - `src/lib/shared-content/`
  - `src/lib/vitest-examples/`
- La history Git è preservata: lo spostamento è stato fatto con `git mv`.
- Questa cartella è esclusa da ESLint, Prettier e dai pattern di test di Vitest.
