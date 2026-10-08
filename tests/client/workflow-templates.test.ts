import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filterWorkflowTemplates, getWorkflowTemplate, instantiateTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-templates';
import { copyTemplateAssets } from '../../src/template-assets';

const TEMPLATE_IDS = ['glowbud', 'lunar-cache', 'lunar-ui', 'image', '3d', 'characters', 'ui-kits', 'materials'] as const;
function walk(value: unknown, visit: (entry: unknown) => void) {
  visit(value);
  if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach((child) => walk(child, visit));
}

describe('workflow templates', () => {
  it('ships complete, explained workflows with packaged results and no live job state', () => {
    expect(WORKFLOW_TEMPLATES.map(t => t.id)).toEqual([...TEMPLATE_IDS]);
    for (const template of WORKFLOW_TEMPLATES) {
      const stages = template.nodes.filter(n => n.type !== 'workflowLesson');
      const lessons = template.nodes.filter(n => n.type === 'workflowLesson');
      expect(stages.length).toBeGreaterThanOrEqual(4);
      expect(lessons).toHaveLength(stages.length);
      expect(lessons.every(n => n.data.body && n.data.exercise)).toBe(true);
      // Every stage must be reachable from the input, including parallel branches.
      const reached = new Set([stages[0].id]);
      for (let i = 0; i < stages.length; i++) for (const e of template.edges) if (reached.has(e.source)) reached.add(e.target);
      expect(stages.every(n => reached.has(n.id))).toBe(true);
      const last = stages.at(-1)!;
      expect(last.data.imageUrl || last.data.modelUrl).toBeTruthy();
      let bundledImages = 0;
      walk(template, entry => {
        expect(typeof entry).not.toBe('function');
        if (typeof entry === 'string' && entry.startsWith('/workflow-examples/')) {
          bundledImages++;
          expect(existsSync(`public${entry}`), entry).toBe(true);
        }
        if (typeof entry === 'string') expect(entry.startsWith('/data/')).toBe(false);
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          expect(entry).not.toHaveProperty('jobId');
          expect(entry).not.toHaveProperty('batchId');
          if ('status' in entry) expect(['completed', 'ready', 'review']).toContain(entry.status);
          if ('generationStatus' in entry) expect(entry.generationStatus).toBe('completed');
        }
      });
      expect(bundledImages).toBeGreaterThan(2);
    }
  });

  it('contains all four views, reviewed props, a validated atlas and seven material maps', () => {
    const character = getWorkflowTemplate('characters')!;
    for (const n of character.nodes.filter(n => n.type === 'characterViews')) {
      const views = Object.values(n.data.views as Record<string, { outputUrl: string }>);
      expect(views).toHaveLength(4);
      expect(views.every(v => v.outputUrl)).toBe(true);
    }
    const atlas = getWorkflowTemplate('ui-kits')!.nodes.find(n => n.type === 'spriteAtlas')!;
    expect(atlas.data.validation).toEqual({ valid: 4, total: 4, issues: [] });
    expect((atlas.data.manifest as { frames: unknown[] }).frames).toHaveLength(4);
    const smart = getWorkflowTemplate('ui-kits')!.nodes.find(n => n.type === 'smartSeparation')!;
    expect(atlas.data.inputUrls).toEqual((smart.data.items as Array<{ outputUrl: string }>).map(item => item.outputUrl));
    const maps = getWorkflowTemplate('materials')!.nodes.find(n => n.type === 'materialMaps')!;
    const mapSet = maps.data.maps as Record<string, { outputUrl: string }>;
    expect(maps.data.inputUrl).toBe(mapSet.baseColor.outputUrl);
    expect(Object.values(maps.data.maps as Record<string, { outputUrl: string }>).filter(m => m.outputUrl)).toHaveLength(7);
  });

  it('remaps edges and internal prop/model references for each independent copy', () => {
    const original = JSON.stringify(WORKFLOW_TEMPLATES);
    for (const id of TEMPLATE_IDS) {
      const first = instantiateTemplate(id);
      const second = instantiateTemplate(id);
      const ids = new Set(first.nodes.map(n => n.id));
      expect(first.nodes.map(n => n.id)).not.toEqual(second.nodes.map(n => n.id));
      expect(first.edges.every(e => ids.has(e.source) && ids.has(e.target))).toBe(true);
      walk(first.nodes, entry => {
        if (entry && typeof entry === 'object') for (const [key,value] of Object.entries(entry)) {
          if (['spawnedNodeId','sourceNodeId','nodeId'].includes(key) && value) expect(ids.has(String(value))).toBe(true);
        }
      });
      first.nodes[0].data.title = 'Edited copy';
    }
    expect(JSON.stringify(WORKFLOW_TEMPLATES)).toBe(original);
  });

  it('copies each asset once into the new project and rewrites nested URLs and asset ids', async () => {
    const original = JSON.stringify(WORKFLOW_TEMPLATES);
    for (const id of TEMPLATE_IDS) {
      const calls: string[] = [];
      const instance = instantiateTemplate(id);
      const copied = await copyTemplateAssets(instance, 'new-project', async (url, projectId, generated) => {
        expect(projectId).toBe('new-project'); calls.push(url);
        if (url.endsWith('.glb')) return { url: '/data/models/copied.glb', downloadUrl: '/api/models/copied/download', fileName: 'copied.glb' };
        const assetId = `copy-${calls.length}`;
        return { url: `/data/${generated ? 'generated' : 'assets'}/${assetId}`, id: assetId };
      });
      expect(new Set(calls).size).toBe(calls.length);
      expect(calls.length).toBeGreaterThan(2);
      walk(copied.nodes, entry => {
        if (typeof entry === 'string') expect(entry.startsWith('/workflow-examples/')).toBe(false);
        if (entry && typeof entry === 'object' && 'imageUrl' in entry) expect(entry).toHaveProperty('assetId');
        if (entry && typeof entry === 'object' && 'outputUrl' in entry) expect(entry).toHaveProperty('outputAssetId');
        if (entry && typeof entry === 'object' && 'modelUrl' in entry) expect(entry).toHaveProperty('downloadUrl', '/api/models/copied/download');
      });
      expect(JSON.stringify(instance)).toContain('/workflow-examples/');
      const atlas = copied.nodes.find(n => n.type === 'spriteAtlas');
      const smart = copied.nodes.find(n => n.type === 'smartSeparation');
      if (atlas && smart) expect(atlas.data.inputUrls).toEqual((smart.data.items as Array<{ outputUrl: string }>).map(item => item.outputUrl));
      const maps = copied.nodes.find(n => n.type === 'materialMaps');
      if (maps) expect(maps.data.inputUrl).toBe((maps.data.maps as Record<string, { outputUrl: string }>).baseColor.outputUrl);
    }
    expect(JSON.stringify(WORKFLOW_TEMPLATES)).toBe(original);
  });

  it('propagates failed imports instead of returning a graph with broken assets', async () => {
    await expect(copyTemplateAssets(instantiateTemplate('image'), 'new-project', async () => { throw new Error('Asset unavailable'); })).rejects.toThrow('Asset unavailable');
  });

  it('filters the examples and rejects unknown ids', () => {
    expect(filterWorkflowTemplates('').map(t => t.id)).toEqual([...TEMPLATE_IDS]);
    expect(filterWorkflowTemplates('PBR').map(t => t.id)).toEqual(['lunar-cache', 'materials']);
    expect(filterWorkflowTemplates('props').map(t => t.id)).toEqual(['characters']);
    expect(filterWorkflowTemplates('no-such-pipeline')).toEqual([]);
    expect(() => instantiateTemplate('props')).toThrow(/unknown workflow template/i);
  });

  it('ships original authored examples with real branches, joins and exportable results', () => {
    for (const id of ['lunar-cache', 'lunar-ui']) {
      const template = getWorkflowTemplate(id)!;
      expect(template.featured).toBe(true);
      expect(template.nodes.filter(node => node.type !== 'workflowLesson')).toHaveLength(14);
      expect(template.nodes.some(node => template.edges.filter(edge => edge.source === node.id).length >= 3)).toBe(true);
      expect(template.nodes.some(node => template.edges.filter(edge => edge.target === node.id).length >= 3)).toBe(true);
      walk(template.nodes, entry => {
        if (typeof entry === 'string' && entry.startsWith('/workflow-examples/')) expect(entry).toMatch(/^\/workflow-examples\/lunar-/);
      });
      for (const atlas of template.nodes.filter(node => ['spriteAtlas','relativeAtlas'].includes(node.type!))) {
        const validation = atlas.data.validation as { valid: number; total: number; issues: string[] };
        expect(validation.valid).toBe(validation.total);
        expect(validation.issues).toEqual([]);
        expect((atlas.data.manifest as { frames: unknown[] }).frames).toHaveLength(validation.total);
      }
    }
    const ui = getWorkflowTemplate('lunar-ui')!;
    const splits = ui.nodes.filter(node => node.type === 'smartSeparation');
    expect(splits).toHaveLength(2);
    for (const split of splits) {
      const items = split.data.items as Array<{ generationMethod: string; outputUrl: string; processingManifest: unknown }>;
      expect(items).toHaveLength(4);
      expect(items.every(item => item.generationMethod === 'sheet-crop' && item.outputUrl && item.processingManifest)).toBe(true);
    }
    expect(ui.nodes.find(node => node.type === 'relativeAtlas')!.data.inputUrls).toEqual((splits[1].data.items as Array<{ outputUrl: string }>).map(item => item.outputUrl));
  });

  it('provides a finished non-humanoid creature workflow with natural stance and an original static model', () => {
    const template=getWorkflowTemplate('glowbud')!;
    expect(template.nodes.filter(node=>node.type!=='workflowLesson')).toHaveLength(16);
    const views=template.nodes.find(node=>node.type==='characterViews')!;
    expect(views.data.subjectKind).toBe('character');
    expect(views.data.pose).toBe('neutral');
    expect(Object.values(views.data.views as Record<string,{status:string;outputUrl:string}>).every(view=>view.status==='completed'&&view.outputUrl)).toBe(true);
    const parts=template.nodes.find(node=>node.type==='characterParts')!;
    expect(parts.data.inputUrls).toEqual(['/workflow-examples/glowbud-variant-seed.png']);
    const model=template.nodes.find(node=>node.type==='model3d')!;
    expect(model.data.creationMethod).toBe('procedural-3d');
    expect(model.data.modelMetadata).toMatchObject({rigged:false,animations:0,triangles:6304});
    const glb=readFileSync(`public${model.data.modelUrl}`);
    expect(glb.toString('ascii',0,4)).toBe('glTF');
    expect(glb.readUInt32LE(4)).toBe(2);
    const scene=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
    expect(scene.nodes.filter((node:{name?:string})=>node.name?.startsWith('Root_foot_'))).toHaveLength(4);
    expect(scene.skins||[]).toHaveLength(0);
    expect(scene.animations||[]).toHaveLength(0);
    expect((model.data.modelMetadata as {materials:number}).materials).toBe(scene.materials.length);
    const atlases=template.nodes.filter(node=>node.type==='spriteAtlas');
    expect(atlases).toHaveLength(2);
    expect(atlases.every(node=>JSON.stringify(node.data.validation)===JSON.stringify({valid:4,total:4,issues:[]}))).toBe(true);
    expect(template.edges.some(edge=>edge.sourceHandle==='part:glowbud-body')).toBe(true);
  });
});
