<script lang="ts">
import { enhance } from '$app/forms';
import { Button, Input, Spinner } from 'brixter/ui';

let { form }: { form: any } = $props();

let submitting = $state(false);
let submitError = $state('');

const displayError = $derived(form?.message ?? submitError);
</script>

<div class="flex min-h-screen items-center justify-center">
	<div class="w-full max-w-md space-y-8">
		<div class="text-center">
			<h1 class="text-heading font-display text-3xl font-bold tracking-tight">
				Welcome to brixter
			</h1>
			<p class="text-secondary mt-2">Create your account to get started.</p>
		</div>

		<form
			method="post"
			action="?/setup"
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
								'Account creation failed unexpectedly. Please try again.';
						}
					} catch (error) {
						submitError =
							error instanceof Error && error.message.trim()
								? error.message
								: 'Account creation failed unexpectedly. Please try again.';
					} finally {
						submitting = false;
					}
				};
			}}
			class="space-y-6"
		>
			<fieldset disabled={submitting} class="space-y-6 disabled:opacity-60">
				<Input label="Name" type="text" name="name" required value={form?.name ?? ''} />
				<Input label="Email" type="email" name="email" required value={form?.email ?? ''} />
				<Input label="Password" type="password" name="password" required minlength={8} />
				<Input
					label="Confirm Password"
					type="password"
					name="confirmPassword"
					required
					minlength={8}
				/>

				{#if displayError}
					<p class="text-error text-sm" role="alert" aria-live="polite">{displayError}</p>
				{/if}

				<Button type="submit" class="w-full" disabled={submitting}>
					{#if submitting}
						<span class="flex items-center justify-center gap-2"><Spinner /> Creating account...</span>
					{:else}
						Create account
					{/if}
				</Button>
			</fieldset>
		</form>
	</div>
</div>
