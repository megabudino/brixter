<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Spinner } from '../../ui';

	let { form, notice = '' }: { form: any; notice?: string } = $props();

	let submitting = $state(false);
	let submitError = $state('');

	const displayError = $derived(form?.message ?? submitError ?? notice);
</script>

<div class="flex min-h-screen items-center justify-center">
	<div class="w-full max-w-md space-y-8">
		<div class="text-center">
			<h1 class="bx-text-heading bx-font-display text-3xl font-bold tracking-tight">Sign in</h1>
			<p class="bx-text-secondary mt-2">Sign in to your brixter account.</p>
		</div>

		<form
			method="post"
			action="?/login"
			use:enhance={() => {
				submitting = true;
				submitError = '';
				return async ({ result, update }) => {
					try {
						if (result.type === 'redirect') {
							await update();
							return;
						}
						await update();
						if (result.type === 'error') {
							submitError =
								result.error?.message?.trim() ||
								'Sign in failed unexpectedly. Please try again.';
						}
					} catch (error) {
						submitError =
							error instanceof Error && error.message.trim()
								? error.message
								: 'Sign in failed unexpectedly. Please try again.';
					} finally {
						submitting = false;
					}
				};
			}}
			class="space-y-6"
		>
			<fieldset disabled={submitting} class="space-y-6 disabled:opacity-60">
				<Input label="Email" type="email" name="email" required value={form?.email ?? ''} />
				<Input label="Password" type="password" name="password" required />

				{#if displayError}
					<p class="bx-text-error text-sm" role="alert" aria-live="polite">{displayError}</p>
				{/if}

				<Button type="submit" class="w-full" disabled={submitting}>
					{#if submitting}
						<span class="flex items-center justify-center gap-2"><Spinner /> Signing in...</span>
					{:else}
						Sign in
					{/if}
				</Button>
			</fieldset>
		</form>
	</div>
</div>
