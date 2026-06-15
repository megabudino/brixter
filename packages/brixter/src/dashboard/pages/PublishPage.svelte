<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, FileDiff } from 'lucide-svelte';
	import { Spinner } from 'brixter/ui';

	let { data, form }: { data: any; form: any } = $props();

	let publishing = $state(false);

	const statusLabels: Record<string, string> = {
		added: 'Added',
		modified: 'Modified',
		removed: 'Removed',
		renamed: 'Renamed',
		copied: 'Copied',
		changed: 'Changed',
		unchanged: 'Unchanged'
	};

	function statusLabel(status: string): string {
		return statusLabels[status] ?? status;
	}

	function diffLineClass(line: string): string {
		if (line.startsWith('+++') || line.startsWith('---')) {
			return 'text-secondary';
		}
		if (line.startsWith('@@')) {
			return 'text-yellow-500 dark:text-yellow-400';
		}
		if (line.startsWith('+')) {
			return 'bg-green-500/10 text-green-800 dark:bg-green-500/15 dark:text-green-300';
		}
		if (line.startsWith('-')) {
			return 'bg-red-500/10 text-red-800 dark:bg-red-500/15 dark:text-red-300';
		}
		return 'text-gray-700 dark:text-gray-300';
	}
</script>

<div class="mx-auto max-w-4xl px-6 py-16">
	<a
		href="/admin/routes"
		class="text-secondary hover:text-heading inline-flex items-center gap-2 text-sm transition-colors"
	>
		<ArrowLeft size={16} />
		Back to routes
	</a>

	<div class="mt-6 flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-display text-heading text-3xl">Review & Publish</h1>
			<p class="text-secondary mt-2 text-sm">
				{data.aheadBy} unpublished commit{data.aheadBy === 1 ? '' : 's'} on
				<code class="text-heading">{data.branch}</code>
				ahead of <code class="text-heading">{data.defaultBranch}</code>
			</p>
			<p class="text-muted mt-1 text-sm">{data.repo.fullName}</p>
		</div>

		<form
			method="post"
			action="?/publish"
			use:enhance={() => {
				publishing = true;
				return async ({ update }) => {
					publishing = false;
					await update();
				};
			}}
		>
			<button
				type="submit"
				disabled={publishing}
				class="btn-brutal-flat inline-flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if publishing}
					<Spinner /> Publishing…
				{:else}
					Publish
				{/if}
			</button>
		</form>
	</div>

	{#if form?.publishError}
		<p class="text-error mt-4 text-sm">{form.publishError}</p>
	{/if}

	<div class="mt-10 space-y-6">
		{#each data.files as file (file.filename)}
			<section class="overflow-hidden border-2 border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800">
				<div
					class="flex flex-wrap items-center justify-between gap-3 border-b-2 border-gray-300 px-5 py-4 dark:border-gray-700"
				>
					<div class="flex min-w-0 items-center gap-3">
						<FileDiff size={18} class="text-muted shrink-0" />
						<span class="text-heading truncate font-mono text-sm">{file.filename}</span>
					</div>
					<div class="flex shrink-0 items-center gap-3 text-xs">
						<span
							class="text-muted border-2 border-gray-300 bg-gray-50 px-2 py-1 tracking-wide uppercase dark:border-gray-600 dark:bg-gray-900"
						>
							{statusLabel(file.status)}
						</span>
						{#if file.additions > 0}
							<span class="font-medium text-green-700 dark:text-green-400">+{file.additions}</span>
						{/if}
						{#if file.deletions > 0}
							<span class="font-medium text-red-700 dark:text-red-400">−{file.deletions}</span>
						{/if}
					</div>
				</div>

				{#if file.patch}
					<div class="max-h-96 overflow-auto">
						<pre class="m-0 min-w-full w-max p-0 text-xs leading-5"><code>{#each file.patch.split('\n') as line}<div class="min-w-full w-max whitespace-pre px-4 {diffLineClass(line)}">{line || ' '}</div>{/each}</code></pre>
					</div>
				{:else}
					<p class="text-muted px-5 py-4 text-sm">No diff available for this file.</p>
				{/if}
			</section>
		{:else}
			<p class="text-muted text-sm">No file changes to review.</p>
		{/each}
	</div>
</div>
