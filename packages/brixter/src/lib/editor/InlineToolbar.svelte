<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Editor } from '@tiptap/core';
  import {
    Bold,
    Italic,
    Strikethrough,
    Code,
    Link as LinkIcon
  } from 'lucide-svelte';

  let {
    editor = null,
    editorFocused = true,
  }: {
    editor?: Editor | null;
    editorFocused?: boolean;
  } = $props();

  let visible = $state(false);
  let settled = $state(false);
  let top = $state(0);
  let left = $state(0);
  let toolbarEl: HTMLDivElement;

  // Active states for highlighting
  let isBoldActive = $state(false);
  let isItalicActive = $state(false);
  let isStrikeActive = $state(false);
  let isCodeActive = $state(false);
  let isLinkActive = $state(false);

  function hasTextSelection(): boolean {
    if (!editor) return false;
    const { empty, from, to } = editor.state.selection as any;
    if (empty) return false;
    try {
      const text = editor.state.doc.textBetween(from, to).trim();
      return text.length > 0;
    } catch {
      return true;
    }
  }

  function updatePosition() {
    if (!editor) return;
    if (!hasTextSelection()) {
      visible = false;
      settled = false;
      return;
    }

    const { from, to } = editor.state.selection as any;
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    const rectTop = Math.min(start.top, end.top);

    // position horizontally at the start of the selection and clamp to viewport
    const toolbarWidth = toolbarEl?.offsetWidth ?? 200;
    const padding = 8;
    left = Math.max(padding, start.left);
    const maxLeft = Math.max(padding, (window?.innerWidth ?? 0) - toolbarWidth - padding);
    left = Math.min(left, maxLeft);
    // place above selection with small gap
    const toolbarHeight = toolbarEl?.offsetHeight ?? 36;
    top = rectTop - toolbarHeight - 8;
    // find the bottom edge of the sticky toolbar above the editor
    const scrollEl = editor.view.dom.closest('.overflow-y-auto');
    const stickyBar = scrollEl?.querySelector('.sticky');
    const minTop = stickyBar ? stickyBar.getBoundingClientRect().bottom : (scrollEl ? scrollEl.getBoundingClientRect().top : 0);
    // if it would overlap the header/toolbar bars, flip below selection
    if (top < minTop) top = Math.max(start.bottom, end.bottom) + 8;
    // if still overlapping, hide
    if (top < minTop) { visible = false; settled = false; return; }

    const wasVisible = visible;
    visible = true;
    if (!wasVisible) {
      requestAnimationFrame(() => { settled = true; });
    }
  }

  function onSelectionOrTxn() {
    // slight defer to allow DOM/layout settle
    requestAnimationFrame(() => {
      updatePosition();
      refreshActiveStates();
    });
  }

  function setLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link')?.href ?? '';
    const url = window.prompt('Enter URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  }

  let currentEditor: Editor | null = null;
  let handlerSelection: (() => void) | null = null;
  let handlerTxn: (() => void) | null = null;
  let handlerFocus: (() => void) | null = null;
  let handlerBlur: (() => void) | null = null;
  let onAnyScroll: (() => void) | null = null;


  function refreshActiveStates() {
    if (!editor) return;
    isBoldActive = editor.isActive('bold');
    isItalicActive = editor.isActive('italic');
    isStrikeActive = editor.isActive('strike');
    isCodeActive = editor.isActive('code');
    isLinkActive = editor.isActive('link');
  }

  function attach() {
    if (!editor) return;
    currentEditor = editor;
    handlerSelection = () => onSelectionOrTxn();
    handlerTxn = () => onSelectionOrTxn();
    handlerFocus = () => onSelectionOrTxn();
    handlerBlur = () => { visible = false; };
    currentEditor.on('selectionUpdate', handlerSelection);
    currentEditor.on('transaction', handlerTxn);
    currentEditor.on('focus', handlerFocus);
    currentEditor.on('blur', handlerBlur);
    onAnyScroll = () => onSelectionOrTxn();
    window.addEventListener('scroll', onAnyScroll, true);
    window.addEventListener('resize', onAnyScroll);
    onSelectionOrTxn();
    refreshActiveStates();
  }

  function detach() {
    if (currentEditor) {
      if (handlerSelection) currentEditor.off('selectionUpdate', handlerSelection);
      if (handlerTxn) currentEditor.off('transaction', handlerTxn);
      if (handlerFocus) currentEditor.off('focus', handlerFocus);
      if (handlerBlur) currentEditor.off('blur', handlerBlur);
    }
    if (onAnyScroll) {
      window.removeEventListener('scroll', onAnyScroll, true);
      window.removeEventListener('resize', onAnyScroll);
    }
    handlerSelection = handlerTxn = handlerFocus = handlerBlur = null;
    onAnyScroll = null;
    currentEditor = null;
  }

  onMount(() => {
    attach();
  });

  onDestroy(() => {
    detach();
  });

  $effect(() => {
    if (editor && editor !== currentEditor) {
      detach();
      attach();
    }
  });
</script>

{#if editor}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={toolbarEl}
    class="inline-toolbar fixed z-[9] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 shadow-lg backdrop-blur duration-200 {settled ? 'transition-all' : 'transition-[opacity,transform]'} {visible && editorFocused ? 'opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-95'}"
    style={`top:${top}px;left:${left}px;`}
    onmousedown={(e) => e.preventDefault()}
  >
    <button onclick={() => editor?.chain().focus().toggleBold().run()} class:active={isBoldActive} title="Bold (Ctrl+B)">
      <Bold size={16} />
    </button>
    <button onclick={() => editor?.chain().focus().toggleItalic().run()} class:active={isItalicActive} title="Italic (Ctrl+I)">
      <Italic size={16} />
    </button>
    <button onclick={() => editor?.chain().focus().toggleStrike().run()} class:active={isStrikeActive} title="Strikethrough">
      <Strikethrough size={16} />
    </button>
    <button onclick={() => editor?.chain().focus().toggleCode().run()} class:active={isCodeActive} title="Inline Code">
      <Code size={16} />
    </button>
    <button onclick={() => (editor?.isActive('link') ? editor?.chain().focus().unsetLink().run() : setLink())} class:active={isLinkActive} title="Link">
      <LinkIcon size={16} />
    </button>
  </div>
{/if}

<style>
  .inline-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    pointer-events: auto;
    padding: 8px 16px;
  }

  .inline-toolbar button {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    padding: 0.5rem;
    border: 1px solid transparent;
    transition: all 0.15s ease-in-out;
  }

  .inline-toolbar button:hover {
    background-color: #f3f4f6;
    color: #1e1c18;
  }

  :global(.dark) .inline-toolbar button:hover {
    background-color: #444039;
    color: #f9fafb;
  }

  .inline-toolbar button.active {
    background-color: #facc15 !important;
    color: white !important;
    border: 1px solid #facc15 !important;
    box-shadow: 0 2px 4px rgba(253, 224, 71, 0.3) !important;
  }

  .inline-toolbar button.active:hover {
    background-color: #fde047 !important;
    border-color: #fde047 !important;
    box-shadow: 0 4px 8px rgba(253, 224, 71, 0.4) !important;
  }
</style>


