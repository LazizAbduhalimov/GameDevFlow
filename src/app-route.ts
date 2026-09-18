export type AppScreen = 'home' | 'workspace';

export type AppRoute =
  | { screen: 'home' }
  | { screen: 'workspace'; projectId: string };

export type AppRouteWriteMode = 'push' | 'replace' | 'none';

const PROJECT_ID = /^(default|[a-f0-9-]{36})$/;

export function isProjectId(value: string): boolean {
  return PROJECT_ID.test(value);
}

export function homePath() {
  return '/';
}

export function workspacePath(projectId: string) {
  return `/project/${encodeURIComponent(projectId)}`;
}

export function appPathFor(route: AppRoute) {
  return route.screen === 'home' ? homePath() : workspacePath(route.projectId);
}

export function parseAppPath(pathname: string): AppRoute {
  const path = normalizePath(pathname);
  if (path === '/') return { screen: 'home' };
  const match = /^\/project\/([^/]+)$/.exec(path);
  if (!match) return { screen: 'home' };
  let projectId = match[1];
  try { projectId = decodeURIComponent(projectId); }
  catch { return { screen: 'home' }; }
  return isProjectId(projectId) ? { screen: 'workspace', projectId } : { screen: 'home' };
}

export function readAppRoute(location: Pick<Location, 'pathname'> = window.location): AppRoute {
  return parseAppPath(location.pathname);
}

export function writeAppRoute(route: AppRoute, mode: AppRouteWriteMode = 'push') {
  if (mode === 'none' || typeof window === 'undefined') return;
  const path = appPathFor(route);
  if (window.location.pathname === path) return;
  if (mode === 'replace') window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
}

export function shouldHandleAppLink(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
}

function normalizePath(pathname: string) {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}
