<script lang="ts">
	import type { CoreConfigIssue } from '../../server/config.ts';

	let { issues }: { issues: CoreConfigIssue[] } = $props();
</script>

<div class="flex min-h-screen items-center justify-center px-6">
	<div class="w-full max-w-lg space-y-6">
		<div class="text-center">
			<h1 class="bx-text-heading bx-font-display text-3xl font-bold tracking-tight">Configuration required</h1>
			<p class="bx-text-secondary mt-2">
				Brixter cannot start until these environment variables are set. Copy them from
				<code class="text-sm">.env.example</code> into <code class="text-sm">.env</code>, then restart the dev
				server.
			</p>
		</div>

		<ul class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
			{#each issues as issue}
				<li class="px-4 py-3">
					<p class="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{issue.key}</p>
					<p class="bx-text-secondary mt-1 text-sm">{issue.description}</p>
				</li>
			{/each}
		</ul>
	</div>
</div>
