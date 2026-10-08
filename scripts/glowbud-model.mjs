// Original procedural creature model. Meshtint's public preview informs proportions
// and readability only; no purchased meshes, textures or animations are included.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export const DESIGN_REFERENCE = 'https://assetstore.unity.com/packages/3d/characters/creatures/low-level-monsters-growing-pack-cute-series-v1-2-391364';
const palette={body:0x1ba99b,lower:0x087d7a,leaf:0xa4d935,vein:0x538d25,feet:0xffedc4,eyes:0x092d47,amber:0xffbc43,pouch:0xd7a46b,cap:0x825f3c};
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:0.82,metalness:0,...extra});

export function createGlowbud({variant='seed',accessory=true,expression='idle',growth=0}={}) {
  const root=new THREE.Group();root.name='Glowbud';
  root.userData={author:'Consept original example',designReference:DESIGN_REFERENCE,anatomy:'non-humanoid quadruped',variant,expression,growth};
  const body=new THREE.Group();body.name='Creature_Body';root.add(body);
  const colors={...palette};
  if(variant==='beetle'){colors.body=0x148caa;colors.leaf=0x71cb9b;}
  if(variant==='guardian'){colors.body=0x5db181;colors.leaf=0xd2d947;}
  const mats=Object.fromEntries(Object.entries(colors).map(([key,color])=>[key,material(color)]));
  mats.amber=material(colors.amber,{emissive:0xff9b1c,emissiveIntensity:0.55,roughness:0.36});
  mats.eyes=material(colors.eyes,{roughness:0.26});
  const mesh=(name,geometry,mat,position,scale=[1,1,1],parent=body)=>{
    const obj=new THREE.Mesh(geometry,mat);obj.name=name;obj.position.set(...position);obj.scale.set(...scale);parent.add(obj);return obj;
  };
  const ball=(name,mat,p,s,parent=body)=>mesh(name,new THREE.SphereGeometry(1,16,10),mat,p,s,parent);
  const wide=variant==='beetle'?1.14:variant==='guardian'?1.04:1;
  ball('Seed_body',mats.body,[0,1.03,0],[1.04*wide,variant==='beetle'?0.64:0.78,0.88]);
  ball('Lower_shell',mats.lower,[0,0.75,-0.09],[0.93*wide,0.49,0.85]);
  for(const [i,[x,z]] of [[-.68,.48],[.68,.48],[-.68,-.49],[.68,-.49]].entries()){
    ball('Root_leg_'+i,mats.lower,[x*wide,0.38,z],[0.22,0.34,0.24]);
    ball('Root_foot_'+i,mats.feet,[x*wide,0.19,z+0.04],[0.29,0.19,0.34]);
  }
  ball('Lantern_rim',mats.lower,[0,0.80,0.82],[0.51,0.37,0.17]);
  ball('Amber_seed',mats.amber,[0,0.80,0.94],[0.4,0.30,0.085]);
  ball('Seed_core',material(0xffe6a2,{emissive:0xffbc56,emissiveIntensity:0.65}),[0,0.82,1.015],[0.15,0.2,0.02]);
  const eyeY=1.47;
  for(const side of [-1,1]){
    const happy=expression==='happy';
    ball((side<0?'Right':'Left')+'_eye',mats.eyes,[side*0.39,eyeY,0.75],[0.21,happy?0.10:expression==='surprised'?0.31:0.26,0.115]);
    if(!happy)ball('Eye_glint_'+side,material(0xffffff),[side*0.39-0.035,eyeY+0.087,0.857],[0.055,0.063,0.017]);
    if(expression==='angry'){
      const brow=mesh('Brow_'+side,new THREE.CapsuleGeometry(.046,.30,2,6),mats.lower,[side*.39,1.74,.76]);brow.rotation.z=side*0.42+Math.PI/2;
    }
  }
  if(expression==='surprised')ball('Mouth',mats.eyes,[0,1.28,.9],[.073,.097,.034]);
  else {const smile=mesh('Mouth',new THREE.TorusGeometry(.1,.022,5,12,Math.PI),mats.eyes,[0,1.28,.91]);smile.rotation.z=Math.PI;}
  const stem=mesh('Sprout_stem',new THREE.CylinderGeometry(.08,.12,.55,8),mats.vein,[0,1.93,-.12]);stem.rotation.z=-.06;
  function leaf(name,origin,angle,size=1){
    const shape=new THREE.Shape();shape.moveTo(0,0);shape.quadraticCurveTo(.43,.15,.42,.66);shape.quadraticCurveTo(.24,.98,0,1.22);shape.quadraticCurveTo(-.28,.98,-.34,.66);shape.quadraticCurveTo(-.41,.2,0,0);
    const geom=new THREE.ExtrudeGeometry(shape,{depth:.10,bevelEnabled:true,bevelSize:.04,bevelThickness:.035,bevelSegments:1,steps:1,curveSegments:5});
    const group=new THREE.Group();group.name=name;group.position.set(...origin);group.rotation.z=angle;group.rotation.y=-.12;group.scale.setScalar(size);body.add(group);
    mesh(name+'_blade',geom,mats.leaf,[0,0,-.05],[1,1,1],group);
    const line=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.08,.08),new THREE.Vector3(.015,.55,.095),new THREE.Vector3(0,1.1,.08)]);
    mesh(name+'_vein',new THREE.TubeGeometry(line,8,.022,5,false),mats.vein,[0,0,0],[1,1,1],group);
  }
  leaf('Left_leaf',[0,2.17,-.12],-.78,.70+growth*.10);
  leaf('Right_leaf',[0,2.17,-.12],.73,.62+growth*.10);
  if(variant==='guardian'||growth>0)leaf('Back_leaf',[0,2.13,-.25],.1,.61+growth*.12);
  if(variant==='beetle'){
    const seam=mesh('Shell_seam',new THREE.TorusGeometry(.79,.025,5,24,Math.PI),mats.lower,[0,1.06,-.08]);seam.rotation.x=Math.PI/2;
  }
  if(growth>0){
    for(const side of [-1,1])leaf('Flank_leaf_'+side,[side*.79,1.23,-.38],-side*1.1,.44+growth*.1);
  }
  if(accessory){
    const bag=new THREE.Group();bag.name='Detachable_acorn_pouch';root.add(bag);
    ball('Acorn_pouch',mats.pouch,[1.035,1.03,-.20],[.28,.34,.26],bag);
    ball('Acorn_cap',mats.cap,[1.035,1.27,-.20],[.30,.12,.28],bag);
    mesh('Acorn_stem',new THREE.CylinderGeometry(.033,.045,.16,7),mats.cap,[1.035,1.41,-.20],[1,1,1],bag);
    const strap=new THREE.CatmullRomCurve3([new THREE.Vector3(-.7,1.43,-.5),new THREE.Vector3(-.08,1.79,-.5),new THREE.Vector3(.68,1.5,-.5),new THREE.Vector3(1.03,1.15,-.25)]);
    mesh('Pouch_strap',new THREE.TubeGeometry(strap,18,.035,5,false),mats.pouch,[0,0,0],[1,1,1],bag);
  }
  if(growth>0)root.scale.setScalar(1+growth*.16);
  return root;
}

export function createGlowbudRenderer(size=1024){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(size,size);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.setClearColor(0x000000,0);
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xedfff5,0x4b6373,2.4));
  const key=new THREE.DirectionalLight(0xfff4d8,3.3);key.position.set(-3,6,5);scene.add(key);
  const rim=new THREE.DirectionalLight(0xc8f0ff,2.0);rim.position.set(4,3,-3);scene.add(rim);
  const camera=new THREE.OrthographicCamera(-1.85,1.85,1.85,-1.85,.1,40);
  const positions={threeQuarter:[4,3.3,5],front:[0,1.5,7],back:[0,1.5,-7],left:[7,1.5,0],right:[-7,1.5,0]};
  return {
    render(model,view='threeQuarter'){
      scene.add(model);camera.position.set(...positions[view]);camera.lookAt(0,1.5,0);renderer.render(scene,camera);const png=renderer.domElement.toDataURL('image/png');scene.remove(model);return png;
    },
    renderFamily(models){
      const group=new THREE.Group();models.forEach((model,i)=>{model.position.x=(i-1)*3.0;model.rotation.y=-.18;group.add(model);});
      const original={left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom};
      renderer.setSize(1536,1024);camera.left=-5.3;camera.right=5.3;camera.top=3.53;camera.bottom=-3.53;camera.updateProjectionMatrix();scene.add(group);camera.position.set(3,4.2,11);camera.lookAt(0,1.4,0);renderer.render(scene,camera);const png=renderer.domElement.toDataURL('image/png');scene.remove(group);Object.assign(camera,original);camera.updateProjectionMatrix();renderer.setSize(size,size);return png;
    },
    dispose(){renderer.dispose();}
  };
}

export async function exportGlowbud(model){
  const buffer=await new GLTFExporter().parseAsync(model,{binary:true});
  let triangles=0,meshes=0;const materialIds=new Set();model.traverse(obj=>{if(obj.isMesh){meshes++;triangles+=(obj.geometry.index?.count||obj.geometry.attributes.position.count)/3;for(const mat of Array.isArray(obj.material)?obj.material:[obj.material])materialIds.add(mat.uuid);}});
  return {blob:new Blob([buffer],{type:'model/gltf-binary'}),metadata:{triangles,meshes,materials:materialIds.size,rigged:false,animations:0,designReference:DESIGN_REFERENCE}};
}
