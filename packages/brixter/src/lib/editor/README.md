# Standalone Rich Text Editor

A self-contained TipTap-based rich text editor for Svelte (v4/v5) with a block toolbar, floating inline toolbar, and dark mode support.

## Files

```
src/lib/editor/
├── RichTextEditor.svelte   # Core TipTap editor with extensions & styling
├── Toolbar.svelte           # Block-level toolbar (headings, lists, tables, images…)
├── InlineToolbar.svelte     # Floating inline toolbar (bold, italic, links…)
├── index.ts                 # Barrel export
└── README.md
```

## Peer Dependencies

Install these in the target project:

```bash
npm install @tiptap/core @tiptap/starter-kit @tiptap/extensions \
  @tiptap/extension-blockquote @tiptap/extension-code-block \
  @tiptap/extension-color @tiptap/extension-highlight \
  @tiptap/extension-horizontal-rule @tiptap/extension-image \
  @tiptap/extension-link @tiptap/extension-subscript \
  @tiptap/extension-superscript @tiptap/extension-table \
  @tiptap/extension-table-cell @tiptap/extension-table-header \
  @tiptap/extension-table-row @tiptap/extension-task-item \
  @tiptap/extension-task-list @tiptap/extension-text-align \
  @tiptap/extension-text-style @tiptap/extension-underline \
  lucide-svelte
```

## Usage

```svelte
<script>
  import { RichTextEditor, Toolbar, InlineToolbar } from '$lib/editor';

  let editor = null;

  function handleContentChange(e) {
    console.log(e.detail.html);
  }
</script>

<Toolbar
  {editor}
  uploadImage={async (file) => {
    // Upload and return the public URL
    return URL.createObjectURL(file);
  }}
/>
<InlineToolbar {editor} />
<RichTextEditor
  bind:editor
  initialContent="<p>Hello world</p>"
  placeholder="Start writing..."
  dark={true}
  on:contentChange={handleContentChange}
/>
```

## Props

### RichTextEditor

| Prop             | Type      | Default              | Description                   |
| ---------------- | --------- | -------------------- | ----------------------------- |
| `initialContent` | `string`  | `''`                 | HTML content to load          |
| `placeholder`    | `string`  | `'Start writing...'` | Placeholder text              |
| `dark`           | `boolean` | `true`               | Enable dark mode styling      |

### Events

| Event             | Detail                          |
| ----------------- | ------------------------------- |
| `contentChange`   | `{ html: string, json: any }`   |
| `selectionUpdate` | `{ editor: Editor }`            |
| `focus`           | `{ editor: Editor }`            |
| `blur`            | `{ editor: Editor }`            |

### Exported methods

- `getContent(): { html: string, json: any }`
- `setContent(html: string): void`

### Toolbar

| Prop          | Type                                       | Description                                |
| ------------- | ------------------------------------------ | ------------------------------------------ |
| `editor`      | `Editor \| null`                           | The TipTap editor instance (bind from RichTextEditor) |
| `uploadImage` | `((file: File) => Promise<string>) \| null` | Optional image upload handler              |
