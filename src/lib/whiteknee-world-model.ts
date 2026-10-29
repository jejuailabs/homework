import type * as Three from 'three';

export type WorldCompanion = {
  pet: string;
  outfit?: Partial<Record<'body' | 'bag', string>>;
  wardrobe?: Partial<Record<'head' | 'face' | 'neck', string>>;
};

/** Real geometry in all directions; no portrait planes or generated assets. */
export function createWhitekneeWorldModel(T: typeof Three, look: WorldCompanion) {
  const group = new T.Group();
  group.name = 'whiteknee';
  group.scale.setScalar(.78);
  const geometries = new Set<Three.BufferGeometry>();
  const materials = new Set<Three.Material>();
  const geometry = <G extends Three.BufferGeometry>(g: G) => {geometries.add(g); return g;};
  const material = (color: string, roughness = .88) => {
    const m = new T.MeshStandardMaterial({color, roughness}); materials.add(m); return m;
  };
  const fur = material('#302423'), caramel = material('#976b48'), cream = material('#f9e5c5');
  const pink = material('#e9a69a'), black = material('#140f14', .18), white = material('#fffaf0', .28);
  const sphere = geometry(new T.SphereGeometry(1, 24, 18));
  const cylinder = geometry(new T.CylinderGeometry(1, 1, 1, 12));
  function ball(parent: Three.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, m: Three.Material) {
    const mesh = new T.Mesh(sphere, m); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function segment(parent: Three.Object3D, a: number[], b: number[], radius: number, m: Three.Material) {
    const start = new T.Vector3(...a), end = new T.Vector3(...b), delta = end.clone().sub(start);
    const mesh = new T.Mesh(cylinder,m); mesh.position.copy(start.add(end).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0), delta.clone().normalize());
    mesh.scale.set(radius,delta.length(),radius); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  const torso = new T.Group(); group.add(torso);
  ball(torso,0,.69,-.36,.56,.47,.66,fur).name = 'abdomen';
  ball(torso,0,.67,.33,.43,.34,.37,caramel).name = 'face';
  ball(torso,0,.51,.60,.30,.19,.12,cream);
  for (const side of [-1,1]) {
    ball(torso,side*.175,.76,.646,.145,.17,.085,cream);
    ball(torso,side*.175,.77,.710,.112,.137,.056,black);
    ball(torso,side*.14,.825,.756,.035,.043,.015,white);
    ball(torso,side*.21,.735,.763,.016,.02,.008,white);
    ball(torso,side*.30,.56,.63,.073,.039,.025,pink);
    ball(torso,side*.13,.34,.57,.12,.13,.16,caramel);
  }
  const mouth = ball(torso,0,.50,.722,.09,.073,.022,material('#642c2c'));
  mouth.name='smile'; ball(torso,0,.467,.744,.055,.027,.009,pink);
  // One draw call for the fine fur, rather than hundreds of separate meshes.
  const hairs: Three.Vector3[]=[];
  for(let i=0;i<650;i++) {
    const y=1-2*(i+.5)/650,angle=i*2.399963229728653,r=Math.sqrt(1-y*y);
    const x=Math.cos(angle)*r,z=Math.sin(angle)*r;
    const start=new T.Vector3(x*.56,.69+y*.47,-.36+z*.66);
    const normal=new T.Vector3(x/.56,y/.47,z/.66).normalize();
    hairs.push(start,start.clone().addScaledVector(normal,.035+(i%5)*.005));
  }
  const hairMaterial=new T.LineBasicMaterial({color:'#af8661',transparent:true,opacity:.48});materials.add(hairMaterial);
  torso.add(new T.LineSegments(geometry(new T.BufferGeometry().setFromPoints(hairs)),hairMaterial));
  const legs: {pivot: Three.Group; side: number; index: number}[]=[];
  for(const side of [-1,1]) for(let index=0;index<4;index++) {
    const pivot=new T.Group(); pivot.name=`leg-${side}-${index}`;
    pivot.position.set(side*.30,.56,.33-index*.24); group.add(pivot);
    const dz=.46-index*.28;
    const knee=[side*.55,.16,dz], foot=[side*(.77+Math.sin(index)*.06),-.49,dz*1.7];
    segment(pivot,[0,0,0],knee,.105,fur); ball(pivot,...knee as [number,number,number],.125,.13,.125,cream);
    segment(pivot,knee,foot,.09,fur);
    const band=knee.map((v,i)=>v+(foot[i]-v)*.23);
    ball(pivot,...band as [number,number,number],.115,.13,.11,cream);
    ball(pivot,...foot as [number,number,number],.105,.075,.12,fur);
    legs.push({pivot,side,index});
  }
  const body=look.outfit?.body;
  const bodyColors: Record<string,string>={'whiteknee-body-explorer':'#a98b62','whiteknee-body-chef':'#f0e8d9','whiteknee-body-pajamas':'#b5a0d2','whiteknee-body-hero':'#458fd1'};
  if(body && bodyColors[body]) {
    const cloth=material(bodyColors[body]);
    ball(torso,0,.69,-.35,.574,.482,.674,cloth);
    if(body==='whiteknee-body-hero') ball(torso,0,.86,-.64,.48,.12,.53,material('#cb5151'));
    if(body==='whiteknee-body-explorer') for(const side of [-1,1]) ball(torso,side*.26,.93,-.10,.11,.035,.14,caramel);
    if(body==='whiteknee-body-pajamas') for(let i=0;i<7;i++) ball(torso,Math.sin(i*2.4)*.36,1.05,-.5+Math.cos(i*2.4)*.34,.033,.024,.033,cream);
  }
  const head=look.wardrobe?.head;
  if(head==='whiteknee-head-explorer') {ball(torso,0,1.00,.30,.42,.045,.30,caramel);ball(torso,0,1.08,.29,.27,.15,.22,caramel);}
  if(head==='whiteknee-head-chef') {ball(torso,0,1.08,.31,.25,.16,.20,white);for(const x of [-.16,0,.16])ball(torso,x,1.20,.31,.14,.13,.14,white);}
  if(head==='whiteknee-head-sleep') {ball(torso,0,1.07,.28,.29,.16,.23,material('#aa91ca'));ball(torso,.24,1.12,.24,.06,.06,.06,cream);}
  if(head==='whiteknee-head-sprout') {segment(torso,[0,.97,.3],[0,1.23,.3],.025,material('#739d52'));for(const side of [-1,1]){const leaf=ball(torso,side*.10,1.18,.3,.14,.05,.075,material('#8aaf63'));leaf.rotation.z=side*.4;}}
  if(head==='whiteknee-head-bow') {const bow=material('#ee94bb');for(const side of [-1,1])ball(torso,side*.15,1.07,.4,.18,.10,.07,bow);ball(torso,0,1.07,.43,.07,.07,.06,bow);}
  if(look.wardrobe?.neck==='whiteknee-neck-scarf') {const scarf=material('#db716c');ball(torso,0,.42,.42,.35,.055,.22,scarf);ball(torso,.14,.34,.62,.09,.13,.035,scarf);}
  if(['whiteknee-face-glasses','whiteknee-face-goggles'].includes(look.wardrobe?.face||'')) {
    const rim=material(look.wardrobe?.face==='whiteknee-face-goggles'?'#418fda':'#6b5143');
    const ring=geometry(new T.TorusGeometry(.147,.019,8,28));
    for(const side of [-1,1]){const mesh=new T.Mesh(ring,rim);mesh.position.set(side*.175,.77,.778);torso.add(mesh);}
    segment(torso,[-.035,.78,.78],[.035,.78,.78],.018,rim);
  }
  return {
    group,
    animate(phase: number,moving: boolean) {
      legs.forEach(({pivot,side,index})=>{
        const step=moving?Math.sin(phase+(index%2)*Math.PI+(side===1?Math.PI:0)):0;
        pivot.rotation.y=step*.15; pivot.rotation.z=side*Math.max(0,step)*.10;
      });
      torso.position.y=moving?Math.sin(phase*2)*.018:0;
    },
    dispose() {geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());},
  };
}
