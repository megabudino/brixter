<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Spinner } from 'brixter/ui';

	interface Account {
		id: string;
		name: string;
		email: string;
		createdAt: string;
	}

	let { data, form }: { data: { users: Account[]; currentUserId: string }; form: any } = $props();

	let submitting = $state(false);

	function formatDate(value: string): string {
		return new Date(value).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="mx-auto max-w-2xl px-6 py-16">
	<h1 class="font-display mb-8 text-3xl text-gray-900 dark:text-gray-50">Accounts</h1>

	<section class="mb-12">
		<h2 class="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-50">Team members</h2>
		<p class="text-muted mb-4 text-sm">People who can sign in to this brixter instance.</p>

		{#if data.users.length === 0}
			<p class="text-muted text-sm">No accounts yet.</p>
		{:else}
			<ul class="divide-y divide-gray-200 rounded border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
				{#each data.users as user (user.id)}
					<li class="flex items-center justify-between gap-4 px-4 py-3">
						<div class="min-w-0">
							<p class="truncate font-medium text-gray-900 dark:text-gray-50">
								{user.name}
								{#if user.id === data.currentUserId}
									<span class="text-muted font-normal">(you)</span>
								{/if}
							</p>
							<p class="text-muted truncate text-sm">{user.email}</p>
						</div>
						<p class="text-muted shrink-0 text-xs">{formatDate(user.createdAt)}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2 class="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-50">Invite account</h2>
		<p class="text-muted mb-4 text-sm">
			Create a new account and share the credentials with your teammate.
		</p>

		<form
			method="post"
			action="?/inviteAccount"
			use:enhance={() => {
				submitting = true;
				return async ({ update, result }) => {
					submitting = false;
					await update({
						reset: result.type === 'success' && Boolean(result.data?.success)
					});
				};
			}}
		>
			<fieldset disabled={submitting} class="space-y-4 disabled:opacity-60">
				<Input label="Name" type="text" name="name" required value={form?.name ?? ''} />
				<Input label="Email" type="email" name="email" required value={form?.email ?? ''} />
				<Input label="Password" type="password" name="password" required minlength={8} />
				<Input
					label="Confirm password"
					type="password"
					name="confirmPassword"
					required
					minlength={8}
				/>

				{#if form?.message}
					<p class="text-error text-sm">{form.message}</p>
				{/if}

				{#if form?.success}
					<p class="text-sm text-green-600 dark:text-green-400">Account created successfully.</p>
				{/if}
			</fieldset>

			<div class="mt-6">
				<Button class="w-full" disabled={submitting}>
					{#if submitting}
						<span class="flex items-center justify-center gap-2"><Spinner /> Creating…</span>
					{:else}
						Invite account
					{/if}
				</Button>
			</div>
		</form>
	</section>
</div>
