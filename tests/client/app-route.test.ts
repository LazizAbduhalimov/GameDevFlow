import { describe, expect, it } from 'vitest';
import { appPathFor, parseAppPath, shouldHandleAppLink, workspacePath } from '../../src/app-route';

describe('app routes', () => {
  it('keeps the project list on the home path', () => {
    expect(parseAppPath('/')).toEqual({ screen: 'home' });
    expect(parseAppPath('')).toEqual({ screen: 'home' });
    expect(appPathFor({ screen: 'home' })).toBe('/');
  });

  it('opens a workflow from a project URL', () => {
    expect(parseAppPath('/project/default')).toEqual({ screen: 'workspace', projectId: 'default' });
    expect(parseAppPath('/project/cab61627-3702-49ce-a827-4151a05a2598/')).toEqual({
      screen: 'workspace',
      projectId: 'cab61627-3702-49ce-a827-4151a05a2598',
    });
    expect(workspacePath('default')).toBe('/project/default');
    expect(appPathFor({ screen: 'workspace', projectId: 'default' })).toBe('/project/default');
  });

  it('falls back to home for unknown or invalid paths', () => {
    expect(parseAppPath('/workspace')).toEqual({ screen: 'home' });
    expect(parseAppPath('/project')).toEqual({ screen: 'home' });
    expect(parseAppPath('/project/not-a-project')).toEqual({ screen: 'home' });
    expect(parseAppPath('/project/default/extra')).toEqual({ screen: 'home' });
  });

  it('lets modified clicks open a real page in a new tab', () => {
    expect(shouldHandleAppLink({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false })).toBe(true);
    expect(shouldHandleAppLink({ button: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false })).toBe(false);
    expect(shouldHandleAppLink({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false })).toBe(false);
    expect(shouldHandleAppLink({ button: 0, metaKey: false, ctrlKey: true, shiftKey: false, altKey: false, defaultPrevented: false })).toBe(false);
  });
});
