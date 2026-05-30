<script lang="ts">
	import { Lock, AlertTriangle } from 'lucide-svelte';

	let { data } = $props();
</script>

<div class="mx-auto max-w-2xl px-6 py-16">
	<h1 class="mt-4 mb-2 font-display text-3xl text-gray-900 dark:text-gray-50">
		{data.repo.name}
	</h1>
	<p class="mb-8 text-secondary">{data.repo.fullName}</p>

	<div class="mb-4 flex items-center justify-between">
		<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">Branches</h2>
		<a href="/admin/b/new" class="text-sm text-secondary transition-colors hover:text-heading">
			+ New branch
		</a>
	</div>
	<ul
		class="divide-y divide-gray-300 border border-gray-300 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-[#1f2937]"
	>
		{#each data.branches as branch}
			{#if branch.isDefault}
				<li class="flex items-center justify-between px-5 py-4">
					<span class="text-gray-900 dark:text-gray-100">{branch.name}</span>
					<span class="flex items-center gap-1.5 text-xs font-medium text-muted">
						<Lock size={14} /> default
					</span>
				</li>
			{:else}
				<li>
					<a
						href={`/admin/b/${encodeURIComponent(branch.name)}`}
						class="flex cursor-pointer items-center justify-between px-5 py-4 text-gray-900 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
					>
						{branch.name}
						{#if branch.behindBy > 0}
							<span
								class="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
							>
								<AlertTriangle size={14} />
								{branch.behindBy} behind
							</span>
						{/if}
					</a>
				</li>
			{/if}
		{/each}
	</ul>
</div>
