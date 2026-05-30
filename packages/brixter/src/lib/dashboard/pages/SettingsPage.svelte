<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Spinner } from 'brixter/ui';

	let { data, form }: { data: any; form: any } = $props();

	let extensions = $state(data.config.allowedExtensions.join(', '));
	let mediaPath = $state(data.config.mediaPath ?? '');
	let submitting = $state(false);
</script>

<div class="mx-auto max-w-2xl px-6 py-16">
	<h1 class="font-display mb-8 text-3xl text-gray-900 dark:text-gray-50">Settings</h1>

	<form
		method="post"
		action="?/settings"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update({ reset: false });
			};
		}}
	>
		<fieldset disabled={submitting} class="space-y-10 disabled:opacity-60">
			<!-- Routes root -->
			<section>
				<h2 class="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-50">Routes root</h2>
				<p class="text-muted mb-3 text-sm">
					The explorer follows your SvelteKit pages from this repo-relative directory.
				</p>
				<code class="block rounded bg-gray-100 px-3 py-2 text-sm dark:bg-gray-800">
					{data.routesRoot}
				</code>
			</section>

			<!-- Media path -->
			<section>
				<h2 class="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-50">Media directory</h2>
				<p class="text-muted mb-4 text-sm">
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
				<p class="text-muted mb-4 text-sm">
					Comma-separated list of file extensions to show in the explorer.
				</p>
				<Input
					name="extensions"
					value={extensions}
					placeholder=".md, .yaml, .yml"
					oninput={(e: Event) => (extensions = (e.target as HTMLInputElement).value)}
				/>
			</section>

			{#if form?.message}
				<p class="text-error text-sm">{form.message}</p>
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
