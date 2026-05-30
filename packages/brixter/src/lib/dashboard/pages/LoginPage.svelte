<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input } from 'brixter/ui';

	let { form }: { form: any } = $props();
</script>

<div class="flex min-h-screen items-center justify-center">
	<div class="w-full max-w-md space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold tracking-tight text-heading font-display">Sign in</h1>
			<p class="mt-2 text-secondary">Sign in to your brixter account.</p>
		</div>

		<form method="post" use:enhance class="space-y-6">
			<Input label="Email" type="email" name="email" required value={form?.email ?? ''} />
			<Input label="Password" type="password" name="password" required />

			{#if form?.message}
				<p class="text-sm text-error">{form.message}</p>
			{/if}

			<Button class="w-full">Sign in</Button>
		</form>
	</div>
</div>
