<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input } from 'brixter/ui';

	let { form }: { form: any } = $props();
</script>

<div class="flex min-h-screen items-center justify-center">
	<div class="w-full max-w-md space-y-8">
		<div class="text-center">
			<h1 class="text-heading font-display text-3xl font-bold tracking-tight">
				Welcome to brixter
			</h1>
			<p class="text-secondary mt-2">Create your account to get started.</p>
		</div>

		<form method="post" action="?/setup" use:enhance class="space-y-6">
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

			{#if form?.message}
				<p class="text-error text-sm">{form.message}</p>
			{/if}

			<Button class="w-full">Create account</Button>
		</form>
	</div>
</div>
