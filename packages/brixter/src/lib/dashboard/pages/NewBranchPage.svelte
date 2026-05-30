<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Spinner } from 'brixter/ui';

	let { data, form }: { data: any; form: any } = $props();
	let submitting = $state(false);
</script>

<div class="mx-auto max-w-md px-6 py-16">
	<a href="/admin" class="text-secondary hover:text-heading text-sm transition-colors"> ← Back </a>
	<div class="mb-6">
		<h1 class="font-display mt-4 text-3xl text-gray-900 dark:text-gray-50">New branch</h1>
		<p class="text-muted mt-2 text-sm">
			Branched from <code class="text-xs">{data.repo.defaultBranch}</code>. Use lowercase letters
			and hyphens only. Keep it short and descriptive.<br />
		</p>
	</div>

	<form
		method="post"
		action="?/newBranch"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
		class="space-y-6"
	>
		<Input
			label="Branch name"
			name="branch_name"
			required
			value={form?.branchName ?? ''}
			placeholder="homepage-edit"
		/>

		{#if form?.message}
			<p class="text-error text-sm">{form.message}</p>
		{/if}

		<Button class="w-full" disabled={submitting}>
			{#if submitting}
				<span class="flex items-center justify-center gap-2"><Spinner /> Creating…</span>
			{:else}
				Create branch
			{/if}
		</Button>
	</form>
</div>
