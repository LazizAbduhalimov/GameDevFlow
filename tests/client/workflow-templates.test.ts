import { describe, expect, it } from 'vitest';
import {
  filterWorkflowTemplates,
  getWorkflowTemplate,
  instantiateTemplate,
  WORKFLOW_TEMPLATES,
} from '../../src/workflow-templates';

const TEMPLATE_IDS = ['image', '3d', 'characters', 'ui-kits', 'materials'] as const;

function walk(value: unknown, visit: (entry: unknown) => void) {
  visit(value);
  if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach((child) => walk(child, visit));
}

describe('workflow templates', () => {
  it('ships five idle starters that are not personal projects', () => {
    expect(WORKFLOW_TEMPLATES.map((template) => template.id)).toEqual([...TEMPLATE_IDS]);
    for (const template of WORKFLOW_TEMPLATES) {
      expect(template.nodes.length).toBeGreaterThan(0);
      expect(template.nodes.every((node) => typeof node.id === 'string' && node.type)).toBe(true);
      walk(template, (entry) => {
        expect(typeof entry).not.toBe('function');
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          expect(entry).not.toHaveProperty('jobId');
          if ('outputUrl' in entry) expect(entry.outputUrl).toBeUndefined();
          if ('status' in entry) expect(['idle', undefined]).toContain(entry.status);
        }
      });
    }
  });

  it('keeps catalog graphs connected without source images', () => {
    expect(getWorkflowTemplate('image')?.nodes.map((node) => node.type)).toEqual(['generator', 'multiGenerate']);
    expect(getWorkflowTemplate('image')?.edges).toHaveLength(1);
    expect(getWorkflowTemplate('3d')?.nodes.map((node) => node.type)).toEqual(['characterViews']);
    expect(getWorkflowTemplate('characters')?.edges[0]).toMatchObject({ source: 'character-views', target: 'character-parts', sourceHandle: 'all' });
    expect((getWorkflowTemplate('characters')?.nodes.find((node) => node.type === 'characterParts')?.data as { parts?: unknown[] }).parts).toEqual([]);
    expect(getWorkflowTemplate('ui-kits')?.nodes.map((node) => node.type)).toEqual(['smartSeparation', 'spriteAtlas']);
    expect(getWorkflowTemplate('materials')?.edges[0]).toMatchObject({ source: 'seamless-texture', target: 'material-maps', sourceHandle: 'baseColor' });
    for (const template of WORKFLOW_TEMPLATES) {
      walk(template.nodes, (entry) => {
        if (entry && typeof entry === 'object' && 'imageUrl' in entry) expect(entry.imageUrl).toBeFalsy();
      });
    }
  });

  it('clones a template with fresh ids and leaves the catalog unchanged', () => {
    const original = JSON.stringify(getWorkflowTemplate('characters'));
    const first = instantiateTemplate('characters');
    const second = instantiateTemplate('characters');
    expect(first.name).toBe('Character pipeline');
    expect(first.nodes).toHaveLength(2);
    expect(first.edges).toHaveLength(1);
    expect(first.nodes.map((node) => node.id)).not.toEqual(second.nodes.map((node) => node.id));
    expect(first.edges[0].id).not.toBe(second.edges[0].id);
    expect(first.edges[0].source).toBe(first.nodes.find((node) => node.type === 'characterViews')?.id);
    expect(first.edges[0].target).toBe(first.nodes.find((node) => node.type === 'characterParts')?.id);
    first.nodes[0].data.title = 'Edited copy';
    expect(JSON.stringify(getWorkflowTemplate('characters'))).toBe(original);
  });

  it('filters the catalog by title, description and input or output', () => {
    expect(filterWorkflowTemplates('').map((template) => template.id)).toEqual([...TEMPLATE_IDS]);
    expect(filterWorkflowTemplates('PBR').map((template) => template.id)).toEqual(['materials']);
    expect(filterWorkflowTemplates('props').map((template) => template.id)).toEqual(['characters']);
    expect(filterWorkflowTemplates('no-such-pipeline')).toEqual([]);
  });

  it('rejects unknown template ids', () => {
    expect(() => instantiateTemplate('props')).toThrow(/unknown workflow template/i);
  });
});
