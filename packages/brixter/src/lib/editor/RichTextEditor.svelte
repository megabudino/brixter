<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Editor, Node as TiptapNode, mergeAttributes, type CommandProps } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import CodeBlock from '@tiptap/extension-code-block';
	import Blockquote from '@tiptap/extension-blockquote';
	import HorizontalRule from '@tiptap/extension-horizontal-rule';
	import { NodeSelection } from '@tiptap/pm/state';
	import TextAlign from '@tiptap/extension-text-align';
	import Link from '@tiptap/extension-link';
	import Image from '@tiptap/extension-image';
	import { Placeholder } from '@tiptap/extensions';

	let {
		initialContent = '',
		placeholder = 'Start writing...',
		proxyImagePrefix = '/admin/api/repo-image',
		onready,
		oncontentChange,
		onselectionUpdate,
		onfocus,
		onblur
	}: {
		initialContent?: string;
		placeholder?: string;
		/**
		 * URL prefix used to detect proxied repo images.
		 * Images whose `src` starts with this prefix are fetched as authenticated
		 * blobs (because the proxy requires session cookies and may be private).
		 */
		proxyImagePrefix?: string;
		onready?: (detail: { editor: any }) => void;
		oncontentChange?: (detail: { html: string; json: any }) => void;
		onselectionUpdate?: (detail: { editor: any }) => void;
		onfocus?: (detail: { editor: any }) => void;
		onblur?: (detail: { editor: any }) => void;
	} = $props();

	let element: HTMLElement;
	let editor: Editor | null = $state(null);
	let dark = $state(browser ? document.body.classList.contains('dark') : true);

	$effect(() => {
		const observer = new MutationObserver(() => {
			dark = document.body.classList.contains('dark');
		});
		observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	});

	// HTML block — raw HTML preserved as-is in markdown output
	const HtmlBlock = TiptapNode.create({
		name: 'htmlBlock',
		group: 'block',
		atom: true,

		addAttributes() {
			return {
				content: { default: '' }
			};
		},

		parseHTML() {
			return [
				{
					tag: 'div[data-html-block]',
					getAttrs: (el: Element) => ({ content: el.innerHTML.trim() })
				}
			];
		},

		renderHTML({ HTMLAttributes }) {
			return [
				'div',
				mergeAttributes({ 'data-html-block': '' }, { 'data-content': HTMLAttributes.content })
			];
		},

		addCommands() {
			return {
				toggleHtmlBlock:
					() =>
					({ chain, state }: CommandProps) => {
						const { from } = state.selection;
						const node = state.doc.nodeAt(from);
						if (node?.type.name === 'htmlBlock') {
							return chain().setNode('paragraph').run();
						}
						return chain()
							.insertContent({ type: 'htmlBlock', attrs: { content: '' } })
							.run();
					}
			} as Record<string, unknown>;
		},

		addKeyboardShortcuts() {
			return {
				'Mod-Shift-m': () => (this.editor.commands as any).toggleHtmlBlock()
			};
		},

		addNodeView() {
			return ({ node, getPos, editor: e }) => {
				const wrapper = document.createElement('div');
				wrapper.classList.add('html-block');
				wrapper.contentEditable = 'false';

				const textarea = document.createElement('textarea');
				textarea.value = node.attrs.content;
				textarea.placeholder = 'Enter HTML…';
				textarea.style.overflow = 'hidden';
				function autoResize() {
					textarea.style.height = 'auto';
					textarea.style.height = textarea.scrollHeight + 'px';
				}
				requestAnimationFrame(autoResize);
				textarea.addEventListener('input', () => {
					autoResize();
					if (typeof getPos !== 'function') return;
					const pos = getPos();
					if (pos === undefined) return;
					e.view.dispatch(
						e.view.state.tr.setNodeMarkup(pos, undefined, { content: textarea.value })
					);
				});

				wrapper.appendChild(textarea);
				return {
					dom: wrapper,
					stopEvent: (event) => {
						return wrapper.contains(event.target as Node);
					},
					update: (updatedNode) => {
						if (updatedNode.type.name !== 'htmlBlock') return false;
						if (textarea.value !== updatedNode.attrs.content) {
							textarea.value = updatedNode.attrs.content;
							autoResize();
						}
						return true;
					}
				};
			};
		}
	});

	// Create a custom Image extension that accepts blob and http(s)/relative URLs during editing
	const CustomImage = Image.extend({
		name: 'customImage',

		renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
			return ['img', HTMLAttributes];
		},

		parseHTML() {
			return [
				{
					tag: 'img[src]:not([src^="data:"])',
					getAttrs: (element: Element) => {
						const src = element.getAttribute('src');
						if (!src) return false;
						if (
							src.startsWith('http://') ||
							src.startsWith('https://') ||
							src.startsWith('blob:') ||
							src.startsWith('/')
						) {
							return {
								src,
								alt: element.getAttribute('alt'),
								title: element.getAttribute('title')
							};
						}
						return false;
					}
				}
			];
		},

		addNodeView() {
			return ({ node, editor: e, getPos }) => {
				const wrapper = document.createElement('div');
				wrapper.classList.add('img-wrapper');
				wrapper.contentEditable = 'false';

				const placeholder = document.createElement('div');
				placeholder.classList.add('img-placeholder');

				const img = document.createElement('img');
				img.style.opacity = '0';
				img.style.transition = 'opacity 0.2s ease-in';
				if (node.attrs.alt) img.alt = node.attrs.alt;

				img.onload = () => {
					placeholder.remove();
					img.style.opacity = '1';
				};

				let blobUrl: string | null = null;

				function loadImage(src: string) {
					if (src.startsWith(proxyImagePrefix)) {
						img.style.opacity = '0';
						if (!wrapper.contains(placeholder)) wrapper.prepend(placeholder);
						fetch(src, { credentials: 'include' })
							.then((res) => {
								if (!res.ok) throw new Error(`HTTP ${res.status}`);
								return res.blob();
							})
							.then((blob) => {
								if (blobUrl) URL.revokeObjectURL(blobUrl);
								blobUrl = URL.createObjectURL(blob);
								img.src = blobUrl;
							})
							.catch(() => {
								placeholder.remove();
							});
					} else {
						img.src = src;
					}
				}

				loadImage(node.attrs.src);
				wrapper.appendChild(img);
				wrapper.addEventListener('click', () => {
					if (typeof getPos !== 'function') return;
					const pos = getPos();
					if (pos === undefined) return;
					const tr = e.view.state.tr.setSelection(NodeSelection.create(e.view.state.doc, pos));
					e.view.dispatch(tr);
				});
				return {
					dom: wrapper,
					update: (updatedNode) => {
						if (updatedNode.type.name !== 'customImage') return false;
						if (updatedNode.attrs.src !== node.attrs.src) {
							loadImage(updatedNode.attrs.src);
						}
						if (updatedNode.attrs.alt) img.alt = updatedNode.attrs.alt;
						return true;
					},
					destroy: () => {
						if (blobUrl) URL.revokeObjectURL(blobUrl);
					}
				};
			};
		}
	});

	// No-op sanitize to retain temporary blob URLs during editing
	function sanitizeContent(content: string): string {
		return content;
	}

	onMount(() => {
		editor = new Editor({
			element: element,
			extensions: [
				StarterKit.configure({
					heading: {
						levels: [1, 2, 3]
					},
					// Disable built-in extensions that we're customizing
					codeBlock: false,
					blockquote: false,
					horizontalRule: false
				}),
				Placeholder.configure({
					placeholder: placeholder
				}),
				CodeBlock,
				Blockquote,
				HorizontalRule.extend({
					addNodeView() {
						return ({ node, editor: e, getPos }) => {
							const wrapper = document.createElement('div');
							wrapper.classList.add('hr-wrapper');
							wrapper.contentEditable = 'false';
							const hr = document.createElement('hr');
							wrapper.appendChild(hr);
							wrapper.addEventListener('click', () => {
								if (typeof getPos !== 'function') return;
								const pos = getPos();
								if (pos === undefined) return;
								const tr = e.view.state.tr.setSelection(
									NodeSelection.create(e.view.state.doc, pos)
								);
								e.view.dispatch(tr);
							});
							return { dom: wrapper };
						};
					}
				}),
				TextAlign.configure({
					types: ['heading', 'paragraph']
				}),
				Link.configure({
					HTMLAttributes: {
						class: 'text-yellow-500 hover:underline'
					}
				}),
				CustomImage.configure({
					HTMLAttributes: {
						class: 'max-w-full h-auto rounded-lg shadow-md'
					}
				}),
				HtmlBlock
			],
			content: sanitizeContent(initialContent),
			onCreate: ({ editor }) => {
				onready?.({ editor });
			},
			onUpdate: ({ editor }) => {
				const html = editor.getHTML();
				const json = editor.getJSON();
				oncontentChange?.({ html, json });
			},
			onSelectionUpdate: ({ editor }) => {
				onselectionUpdate?.({ editor });
			},
			onFocus: ({ editor }) => {
				onfocus?.({ editor });
			},
			onBlur: ({ editor }) => {
				onblur?.({ editor });
			}
		});
	});

	onDestroy(() => {
		if (editor) {
			editor.destroy();
		}
	});

	// Function to get current content
	export function getContent() {
		if (editor) {
			return {
				html: editor.getHTML(),
				json: editor.getJSON()
			};
		}
		return { html: '', json: null };
	}

	// Function to set content
	export function setContent(content: string) {
		if (editor) {
			editor.commands.setContent(sanitizeContent(content));
		}
	}
</script>

<!-- Editor Content -->
<div bind:this={element} class="editor-content prose max-w-none {dark ? 'prose-invert' : ''}"></div>

<style>
	.editor-content {
		min-height: 500px;
		padding: 0 1.5rem 1.5rem 1.5rem;
	}

	.editor-content :global(.ProseMirror) {
		outline: none;
	}

	.editor-content :global(:is(h1, h2, h3, h4, th)) {
		font-family: inherit;
	}

	/* Image wrapper (custom NodeView) */
	.editor-content :global(.ProseMirror .img-wrapper) {
		margin: 1.5rem 0;
		cursor: pointer;
		border-radius: 0.5rem;
		transition: outline 0.15s;
		outline: 2px solid transparent;
	}

	.editor-content :global(.ProseMirror .img-wrapper.ProseMirror-selectednode) {
		outline: 2px solid #fde047;
		border-radius: 0.5rem;
	}

	.editor-content :global(.ProseMirror .img-wrapper img) {
		max-width: 100%;
		height: auto;
		border-radius: 0.5rem;
		display: block;
	}

	.editor-content :global(.ProseMirror .img-placeholder) {
		height: 200px;
		border-radius: 0.5rem;
		background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s ease-in-out infinite;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	/* HR wrapper (custom NodeView) */
	.editor-content :global(.ProseMirror .hr-wrapper) {
		margin: 1.5rem 0;
		padding: 0.5rem 0;
		cursor: pointer;
		border-radius: 4px;
		transition: background-color 0.15s;
	}

	.editor-content :global(.ProseMirror .hr-wrapper:hover) {
		background-color: rgba(0, 0, 0, 0.04);
	}

	.editor-content :global(.ProseMirror .hr-wrapper.ProseMirror-selectednode) {
		background-color: rgba(253, 224, 71, 0.1);
		outline: 2px solid #fde047;
	}

	.editor-content :global(.ProseMirror .hr-wrapper hr) {
		border: none;
		border-top: 1px solid #d1d5db;
		margin: 0;
	}

	/* HTML block */
	.editor-content :global(.ProseMirror .html-block) {
		background-color: #fefce8;
		border: 1px dashed #fde047;
		border-radius: 0.375rem;
		padding: 0.5rem;
		margin: 1rem 0;
	}

	.editor-content :global(.ProseMirror .html-block.ProseMirror-selectednode) {
		outline: 2px solid #fde047;
		border-color: transparent;
	}

	.editor-content :global(.ProseMirror .html-block textarea) {
		width: 100%;
		background: transparent;
		border: none;
		outline: none;
		resize: none;
		min-height: 3.5em;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.8125rem;
		line-height: 1.5;
		color: inherit;
		padding: 0.25rem 0.5rem;
	}

	.editor-content.prose-invert :global(.ProseMirror .html-block) {
		background-color: rgba(253, 224, 71, 0.1);
		border-color: #a16207;
	}

	/* Placeholder */
	.editor-content :global(.ProseMirror p.is-editor-empty:first-child::before) {
		pointer-events: none;
		float: left;
		height: 0;
		color: #9ca3af;
		font-weight: 400;
		content: attr(data-placeholder);
	}

	/* Dark mode extras */
	.editor-content.prose-invert :global(.ProseMirror .img-placeholder) {
		background: linear-gradient(90deg, #2d2a25 25%, #444039 50%, #2d2a25 75%);
		background-size: 200% 100%;
	}

	.editor-content.prose-invert :global(.ProseMirror .hr-wrapper:hover) {
		background-color: rgba(255, 255, 255, 0.04);
	}

	.editor-content.prose-invert :global(.ProseMirror .hr-wrapper hr) {
		border-top-color: #334155;
	}

	.editor-content.prose-invert :global(.ProseMirror p.is-editor-empty:first-child::before) {
		color: oklch(44.6% 0.03 85);
	}
</style>
