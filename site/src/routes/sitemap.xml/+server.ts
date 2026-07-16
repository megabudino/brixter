// Auto-discovers every page under src/routes. In dev this is served via SSR, so
// <loc> uses the request origin (http://localhost:5173). For a real deployment
// pass your canonical origin so prerendered output is absolute:
//   import { createSitemap } from 'brixter/sveltekit/sitemap';
//   export const { GET, prerender } = createSitemap({ siteUrl: 'https://yoursite.com' });
export { GET, prerender } from 'brixter/sveltekit/sitemap';
