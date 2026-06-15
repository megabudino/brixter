/** Whether the request targets the CMS (public `/admin` or internal `/__brixter`). */
export function isBrixterAdminPath(pathname: string, adminPath: string): boolean {
	if (pathname === adminPath || pathname.startsWith(`${adminPath}/`)) return true;
	if (pathname === '/__brixter' || pathname.startsWith('/__brixter/')) return true;
	return false;
}

export function isAuthApiPath(pathname: string, adminPath: string): boolean {
	return (
		pathname.startsWith(`${adminPath}/api/auth`) || pathname.startsWith('/__brixter/api/auth')
	);
}

export function isLoginPath(pathname: string, adminPath: string): boolean {
	const loginPath = `${adminPath}/login`;
	return (
		pathname === loginPath ||
		pathname.startsWith(`${loginPath}/`) ||
		pathname === '/__brixter/login' ||
		pathname.startsWith('/__brixter/login/')
	);
}

export function isSetupPath(pathname: string, adminPath: string): boolean {
	const setupPath = `${adminPath}/setup`;
	return (
		pathname === setupPath ||
		pathname.startsWith(`${setupPath}/`) ||
		pathname === '/__brixter/setup' ||
		pathname.startsWith('/__brixter/setup/')
	);
}

export function isConfigErrorPath(pathname: string, adminPath: string): boolean {
	const configErrorPath = `${adminPath}/config-error`;
	return (
		pathname === configErrorPath ||
		pathname.startsWith(`${configErrorPath}/`) ||
		pathname === '/__brixter/config-error' ||
		pathname.startsWith('/__brixter/config-error/')
	);
}
