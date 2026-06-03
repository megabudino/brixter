<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Spinner } from 'brixter/ui';

	let { form }: { form: any } = $props();

	let submitting = $state(false);
</script>

<div class="flex min-h-screen items-center justify-center">
	<div class="w-full max-w-md space-y-8">
		<div class="text-center">
			<h1 class="text-heading font-display text-3xl font-bold tracking-tight">Sign in</h1>
			<p class="text-secondary mt-2">Sign in to your brixter account.</p>
		</div>

		<form
			method="post"
			action="?/login"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
			class="space-y-6"
		>
			<fieldset disabled={submitting} class="space-y-6 disabled:opacity-60">
				<Input label="Email" type="email" name="email" required value={form?.email ?? ''} />
				<Input label="Password" type="password" name="password" required />

				{#if form?.message}
					<p class="text-error text-sm">{form.message}</p>
				{/if}

				<Button class="w-full" disabled={submitting}>
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
