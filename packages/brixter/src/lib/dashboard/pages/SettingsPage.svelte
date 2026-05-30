<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Spinner } from 'brixter/ui';
	import { ChevronRight, ChevronDown, Folder } from 'lucide-svelte';

	let { data, form }: { data: any; form: any } = $props();

	let extensions = $state(data.config.allowedExtensions.join(', '));
	let mediaPath = $state(data.config.mediaPath ?? '');
	let selectedPaths = $state<Set<string>>(new Set(data.config.allowedPaths));
	let expanded = $state<Set<string>>(new Set<string>());
	let submitting = $state(false);

	interface TreeNode {
		name: string;
		path: string;
		children: TreeNode[];
	}

	const tree = $derived.by(() => {
		const root: TreeNode[] = [];
		const dirs = data.directories as string[];

		for (const dir of dirs) {
			const parts = dir.split('/');
			let current = root;

			for (let i = 0; i < parts.length; i++) {
				const fullPath = parts.slice(0, i + 1).join('/');
				let node = current.find((n) => n.name === parts[i]);
				if (!node) {
					node = { name: parts[i], path: fullPath, children: [] };
					current.push(node);
				}
				current = node.children;
			}
		}

		return root;
	});

	function isIncludedByParent(path: string): boolean {
		return [...selectedPaths].some((sp) => path.startsWith(sp + '/'));
	}

	function toggle(path: string) {
		const next = new Set(selectedPaths);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
			for (const sp of next) {
				if (sp !== path && sp.startsWith(path + '/')) {
					next.delete(sp);
				}
			}
		}
		selectedPaths = next;
	}

	function toggleExpanded(path: string) {
		const next = new Set(expanded);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
		}
		expanded = next;
	}
</script>

<div class="mx-auto max-w-2xl px-6 py-16">
	<h1 class="mb-8 font-display text-3xl text-gray-900 dark:text-gray-50">Settings</h1>

	<form
		method="post"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update({ reset: false });
			};
		}}
	>
		<fieldset disabled={submitting} class="space-y-10 disabled:opacity-60">
			<!-- Media path -->
			<section>
				<h2 class="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-50">Media directory</h2>
				<p class="mb-4 text-sm text-muted">
					Directory that maps to your site root (e.g. <code
						class="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">public</code
					>
					or <code class="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">static</code>).
					Images inside it will use root-relative URLs.
				</p>
				<Input
					name="media_path"
					value={mediaPath}
					placeholder="e.g. public or static"
					oninput={(e: Event) => (mediaPath = (e.target as HTMLInputElement).value)}
				/>
			</section>

			<!-- Extensions -->
			<section>
				<h2 class="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-50">
					Visible extensions
				</h2>
				<p class="mb-4 text-sm text-muted">
					Comma-separated list of file extensions to show in the explorer.
				</p>
				<Input
					name="extensions"
					value={extensions}
					placeholder=".md, .yaml, .yml"
					oninput={(e: Event) => (extensions = (e.target as HTMLInputElement).value)}
				/>
			</section>

			<!-- Directory tree -->
			<section>
				<h2 class="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-50">
					Visible directories
				</h2>
				<p class="mb-4 text-sm text-muted">Select which directories are visible in the explorer.</p>

				{#if tree.length > 0}
					<div
						class="divide-y divide-gray-300 border border-gray-300 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-[#1f2937]"
					>
						{#snippet renderTree(nodes: TreeNode[], depth: number)}
							{#each nodes as node}
								<div>
									<div
										class="flex items-center gap-2 px-4 py-3 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
										style="padding-left: {depth * 20 + 16}px"
									>
										{#if node.children.length > 0}
											<button
												type="button"
												class="text-muted transition-colors hover:text-heading"
												onclick={() => toggleExpanded(node.path)}
											>
												{#if expanded.has(node.path)}
													<ChevronDown size={16} />
												{:else}
													<ChevronRight size={16} />
												{/if}
											</button>
										{:else}
											<span class="w-4"></span>
										{/if}
										<Folder size={16} class="shrink-0 text-muted" />
										<label
											class="flex-1 cursor-pointer text-sm select-none {isIncludedByParent(
												node.path
											)
												? 'text-muted'
												: 'text-gray-900 dark:text-gray-100'}"
										>
											<input
												type="checkbox"
												name={!isIncludedByParent(node.path) ? 'allowed_paths' : undefined}
												value={node.path}
												checked={selectedPaths.has(node.path) || isIncludedByParent(node.path)}
												disabled={isIncludedByParent(node.path)}
												onchange={() => toggle(node.path)}
												class="mr-2"
											/>
											{node.name}
										</label>
									</div>
									{#if expanded.has(node.path) && node.children.length > 0}
										{@render renderTree(node.children, depth + 1)}
									{/if}
								</div>
							{/each}
						{/snippet}
						{@render renderTree(tree, 0)}
					</div>
				{:else}
					<p class="text-sm text-muted">No directories found.</p>
				{/if}
			</section>

			{#if form?.message}
				<p class="text-sm text-error">{form.message}</p>
			{/if}

			{#if form?.success}
				<p class="text-sm text-green-600 dark:text-green-400">Settings saved.</p>
			{/if}
		</fieldset>

		<div class="mt-10">
			<Button class="w-full" disabled={submitting}>
				{#if submitting}
					<span class="flex items-center justify-center gap-2"><Spinner /> Saving…</span>
				{:else}
					Save settings
				{/if}
			</Button>
		</div>
	</form>
</div>
