import type { Reroute } from '@sveltejs/kit';

export const reroute: Reroute = ({ url }) => {
	if (url.pathname === '/admin') return '/__brixter';
	if (url.pathname.startsWith('/admin/')) return `/__brixter${url.pathname.slice('/admin'.length)}`;
};
