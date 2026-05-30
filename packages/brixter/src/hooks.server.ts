import { sequence } from '@sveltejs/kit/hooks';
import { handle as brixterHandle } from '$lib/server';

export const handle = sequence(brixterHandle);
