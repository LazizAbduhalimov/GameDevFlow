import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { importProject, projectPayload } from '../../src/graph';
import {
  EMPTY_PROJECT_STYLE_LIBRARY,
  PROJECT_STYLE_IMAGE_LIMIT,
  PROJECT_STYLE_TEXT_LIMIT,
  ProjectStyleContext,
  normalizeProjectStyleLibrary,
  useProjectStyle,
} from '../../src/project-style';
import type { ProjectStyleLibrary } from '../../src/types';

function reference(id: string) {
  return { assetId: id, url: `/data/assets/${id}`, name: `Reference ${id}` };
}

describe('project style library', () => {
  it('restores projects without a library as independent empty libraries', () => {
    for (const value of [undefined, null, '', [], 123, { text: false, images: false }]) {
      expect(normalizeProjectStyleLibrary(value)).toEqual({ text: '', images: [] });
    }
    const first = normalizeProjectStyleLibrary(undefined);
    const second = normalizeProjectStyleLibrary(undefined);
    first.images.push(reference('one'));
    first.text = 'Project one only';
    expect(second).toEqual({ text: '', images: [] });
    expect(EMPTY_PROJECT_STYLE_LIBRARY).toEqual({ text: '', images: [] });
  });

  it('copies valid references and preserves the style notes', () => {
    const original: ProjectStyleLibrary = { text: 'Рисованный стиль\nMuted colors and soft light. ', images: [reference('one')] };
    const normalized = normalizeProjectStyleLibrary(original);
    expect(normalized).toEqual(original);
    expect(normalized).not.toBe(original);
    expect(normalized.images).not.toBe(original.images);
    normalized.images[0].name = 'Updated';
    expect(original.images[0].name).toBe('Reference one');
  });

  it('accepts a single reference shape without adding a reference to a missing library', () => {
    expect(normalizeProjectStyleLibrary(reference('legacy'))).toEqual({ text: '', images: [reference('legacy')] });
    expect(normalizeProjectStyleLibrary({ designReference: reference('legacy') })).toEqual({ text: '', images: [] });
  });

  it('rejects malformed images and prevents duplicate asset IDs or URLs', () => {
    const normalized = normalizeProjectStyleLibrary({ text: 'Paper cutout', images: [
      null, {}, { url: '/data/assets/missing-id' }, { ...reference('remote'), url: 'https://example.com/reference.png' },
      reference('one'), { ...reference('one'), url: '/data/generated/another' }, { ...reference('two'), url: '/data/assets/one' },
      { assetId: '  three  ', url: '  /data/generated/three  ', name: '  ' },
    ] });
    expect(normalized.images).toEqual([reference('one'), { assetId: 'three', url: '/data/generated/three', name: 'Style reference' }]);
  });

  it('bounds the notes and style references while leaving room for node inputs', () => {
    const normalized = normalizeProjectStyleLibrary({
      text: 'x'.repeat(PROJECT_STYLE_TEXT_LIMIT + 1),
      images: Array.from({ length: PROJECT_STYLE_IMAGE_LIMIT + 2 }, (_, index) => reference(`ref-${index}`)),
    });
    expect(normalized.text).toHaveLength(12_000);
    expect(normalized.images).toHaveLength(12);
    expect(normalized.images[11]).toEqual(reference('ref-11'));
  });

  it('uses the same stored reference lengths as the server', () => {
    const normalized = normalizeProjectStyleLibrary({ images: [{
      assetId: ` ${'a'.repeat(100)} `,
      url: ` /data/assets/${'b'.repeat(260)} `,
      name: ` ${'Long upload name '.repeat(20)} `,
    }] });
    expect(normalized.images[0].assetId).toBe('a'.repeat(80));
    expect(normalized.images[0].url).toBe(`/data/assets/${'b'.repeat(227)}`);
    expect(normalized.images[0].name).toBe('Long upload name '.repeat(20).trim().slice(0, 180));
    expect(normalizeProjectStyleLibrary(normalized)).toEqual(normalized);
  });

  it('lets a node read its current project library without carrying it in node data', () => {
    function NodeConsumer() {
      const { projectId, styleLibrary } = useProjectStyle();
      return createElement('span', null, `${projectId}:${styleLibrary.text}:${styleLibrary.images.length}`);
    }
    const renderNode = (projectId: string, styleLibrary: ProjectStyleLibrary) => renderToStaticMarkup(createElement(
      ProjectStyleContext.Provider, { value: { projectId, styleLibrary } }, createElement(NodeConsumer),
    ));
    expect(renderNode('project-one', { text: 'Watercolor', images: [reference('one')] })).toBe('<span>project-one:Watercolor:1</span>');
    expect(renderNode('project-two', { text: 'Pixel art', images: [] })).toBe('<span>project-two:Pixel art:0</span>');
    expect(renderToStaticMarkup(createElement(NodeConsumer))).toBe('<span>default::0</span>');
  });

  it('keeps style at project scope through portable JSON import', async () => {
    const styleLibrary = { text: 'Watercolor with warm paper grain', images: [reference('paper')] };
    const payload = projectPayload('project-style', 'Illustrations', 2, [{
      id: 'generator', type: 'generator', position: { x: 20, y: 30 }, data: { title: 'Character', prompt: 'A fox' },
    }], [], { x: 0, y: 0, zoom: 1 }, null, styleLibrary);
    const imported = await importProject(new File([JSON.stringify(payload)], 'style.consept.json', { type: 'application/json' }));
    expect(imported.styleLibrary).toEqual(styleLibrary);
    expect(imported.nodes[0].data).toEqual({ title: 'Character', prompt: 'A fox' });
    expect(imported.edges).toEqual([]);
  });
});
