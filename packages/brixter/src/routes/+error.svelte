<script lang="ts">
	import { page } from '$app/stores';
</script>

<div class="min-h-svh bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
	<div class="max-w-[65ch] mx-auto px-6 text-center">
		<h1
			class="mx-auto font-display text-5xl lg:text-6xl text-gray-900 italic dark:text-gray-50"
		>
			{$page.status}
		</h1>
		<div class="mx-auto prose prose-lg lg:prose-xl dark:prose-invert text-center">
			<p>{$page.error?.message}</p>
		</div>
	</div>
</div>
