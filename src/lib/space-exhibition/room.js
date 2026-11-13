// Three different galleries, each constructed as continuous walkable architecture.
// Local display coordinates use +Z out of the hanging face and +Y up.
export function buildRoom(C) {
  const {T,group,theme,art,artTex}=C;
  const solids=[],targets=[],painted=new Set(),cache=new Map();
  const PI=Math.PI,TAU=2*PI;
  const material=(key,u=1,v=1,tint)=>{
    const id=[key,u,v,tint||''].join('/');if(cache.has(id))return cache.get(id);
    const src=C.mat(key,u,v),m=tint?src.clone():src;
    if(tint&&m.color)m.color.multiply(new T.Color(tint));
    cache.set(id,m);return m;
  };
  const shell=material('shell'),trim=material('trim',1.001,1),ceil=material('ceiling',1.001,1);
  const matColor=(c)=>new T.MeshBasicMaterial({color:c,toneMapped:false});
  const luminous=matColor(theme==='earth'?'#fff3db':'#ffdeac');
  const dark=material('trim',1,1,theme==='earth'?'#686e73':'#665951');
  // The generated close-up of the frame has a clean photographic mount in its
  // lower-right corner, independent of the burgundy/gray bodywork material.
  const mountMap=C.tex('frame').clone();mountMap.repeat.set(.27,.28);mountMap.offset.set(.63,.075);mountMap.needsUpdate=true;
  const matte=new T.MeshStandardMaterial({map:mountMap,color:'#fffaf0',roughness:.90});
  const sharedBox=new T.BoxGeometry(),sharedPlane=new T.PlaneGeometry();
  const point=(x,y,z)=>new T.Vector3(x,y,z);

  function mesh(parent,g,m,x=0,y=0,z=0) {
    const o=new T.Mesh(g,m);o.position.set(x,y,z);o.receiveShadow=true;parent.add(o);return o;
  }
  function box(p,x,y,z,w,h,d,m,cast=false) {
    const o=mesh(p,sharedBox,m,x,y,z);o.scale.set(w,h,d);o.castShadow=cast;return o;
  }
  function plane(p,x,y,z,w,h,m) {
    const o=mesh(p,sharedPlane,m,x,y,z);o.scale.set(w,h,1);return o;
  }
  function at(x,z,yaw=0) {
    const o=new T.Group();o.position.set(x,0,z);o.rotation.y=yaw;group.add(o);return o;
  }
  function solid(x,z,w,d,angle=0){solids.push({x,z,w,d,angle});}
  function solidFrom(node,w,d,dx=0,dz=0){
    node.updateWorldMatrix(true,false);
    const p=point(dx,0,dz).applyMatrix4(node.matrixWorld);solid(p.x,p.z,w,d,node.rotation.y);
  }
  function rr(w,h,r=.05,hole=false) {
    const p=hole?new T.Path():new T.Shape(),x=-w/2,y=-h/2;
    r=Math.min(Math.max(.001,r),w*.49,h*.49);
    p.moveTo(x+r,y);p.lineTo(x+w-r,y);p.quadraticCurveTo(x+w,y,x+w,y+r);
    p.lineTo(x+w,y+h-r);p.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    p.lineTo(x+r,y+h);p.quadraticCurveTo(x,y+h,x,y+h-r);
    p.lineTo(x,y+r);p.quadraticCurveTo(x,y,x+r,y);p.closePath();return p;
  }
  function extrude(shape,d,bevel=0) {
    return new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:8});
  }
  function border(parent,x,y,z,w,h,edge,depth,r,m) {
    const s=rr(w,h,r);s.holes.push(rr(w-2*edge,h-2*edge,Math.max(.004,r-edge),true));
    return mesh(parent,extrude(s,depth,.003),m,x,y,z);
  }
  function photo(key) {
    const id='photo/'+key;if(cache.has(id))return cache.get(id);
    const o=new T.MeshBasicMaterial({map:C.tex(key),toneMapped:false});cache.set(id,o);return o;
  }
  function rail(p,pts,radius,m) {
    const path=new T.CatmullRomCurve3(pts.map(a=>point(...a)),false,'centripetal');
    return mesh(p,new T.TubeGeometry(path,Math.max(7,pts.length*3),radius,8,false),m);
  }
  function lamp(p,x,y,z,width=.26) {
    const head=box(p,x,y,z,width,.12,.17,dark);
    plane(p,x,y,z+.09,width*.90,.095,photo('light'));
    box(p,x,y-.066,z+.027,width*.75,.016,.075,luminous);return head;
  }
  function plaque(p,x,y,z,title,opts={}) {
    if(!C.label)return;
    const w=opts.w||1.15,h=opts.h||.17,height=opts.bg?96:72,width=opts.bg?Math.max(256,Math.round(w/h*height)):512;
    const o=plane(p,x,y,z,w,h,C.label(title,{width,height,color:opts.color||'#403a2d',background:opts.bg,font:opts.bg?'700 52px "Malgun Gothic",sans-serif':'600 37px sans-serif'}));
    o.material.transparent=true;return o;
  }
  // Every work hangs in the same frame (FRAME_W × FRAME_H) with its name card below;
  // only index 0 differs: the big slide screen that shows every work in turn.
  const FRAME_W=1.0,FRAME_H=.78,CARD_W=1.05,CARD_GAP=.05;
  const bezel=new T.MeshStandardMaterial({color:'#15161c',roughness:.45,metalness:.35});
  let heroSlot=null;
  function nameCard(g,a,y,width,opts){
    if(!C.caption||!a)return;
    const card=C.caption(a,opts),w=width,h=w/card.aspect;
    plane(g,0,y-h/2,.045,w,h,card.material).renderOrder=2;
  }
  function artwork(p,index,x,y,w,h,z=.095,swap) {
    if(!swap&&(index>=art.length||painted.has(index)))return;
    if(index===0&&!swap)heroSlot={p,x,y,w,h,z};
    const image=swap?swap.texture:artTex(index),a=swap?swap.art:art[index],dim=image?.image||{};
    const aspect=(a.width||dim.naturalWidth||dim.width||1)/(a.height||dim.naturalHeight||dim.height||1);
    const g=new T.Group();g.position.set(x,y,z);p.add(g);
    if(index===0){
      // The slide screen: a dark bezel of fixed size, each work letterboxed inside it.
      const iw=Math.min(w,h*aspect),ih=iw/aspect;
      box(g,0,0,.0,w+.2,h+.2,.06,bezel);
      box(g,0,0,.032,w+.04,h+.04,.004,matColor('#0b0c10'));
      plane(g,0,0,.036,iw,ih,new T.MeshBasicMaterial({map:image,toneMapped:false}));
      border(g,0,0,.03,w+.26,h+.26,.045,.04,.03,trim);
      nameCard(g,a,-(h/2+.2),Math.min(w+.2,2.4),{screen:true,total:C.total});
    }else{
      // Same frame for everyone; the picture fits inside the mount at its own ratio.
      const fw=Math.min(w,FRAME_W),fh=Math.min(h,FRAME_H),iw=Math.min(fw,fh*aspect),ih=iw/aspect;
      const pad=.06,edge=theme==='moon'?.026:.032;
      box(g,.010,-.014,-.009,fw+pad*2+.035,fh+pad*2+.035,.037,dark);
      box(g,0,0,.015,fw+pad*2,fh+pad*2,.031,matte);
      border(g,0,0,.022,fw+pad*2+edge*2,fh+pad*2+edge*2,edge,.036,.010,trim);
      plane(g,0,0,.038,iw,ih,new T.MeshBasicMaterial({map:image,toneMapped:false}));
      nameCard(g,a,-(fh/2+pad+edge+CARD_GAP),CARD_W,{});
    }
    const target={mesh:g,kind:'art',index};
    if(swap)return target;
    targets.push(target);painted.add(index);
  }
  // Rows of equal frames across a wall: indices fill row by row; ys are the frame centres.
  function hangGrid(parent,indices,width,ys,z=.095) {
    const cols=Math.ceil(indices.length/ys.length),cell=width/cols;
    indices.forEach((i,k)=>artwork(parent,i,(k%cols+.5)*cell-width/2,ys[Math.floor(k/cols)],Math.min(cell-.24,FRAME_W),FRAME_H,z));
  }
  const range=(from,count)=>Array.from({length:count},(_,k)=>from+k);
  // Replace the main slide's frame with another work, sized to its own ratio.
  function swapHero(texture,info){
    if(!heroSlot)return null;
    const {p,x,y,w,h,z}=heroSlot;
    return artwork(p,0,x,y,w,h,z,{texture,art:info});
  }
  function panel(x,z,yaw,w,h,thick=.23,skin=shell) {
    const p=at(x,z,yaw);
    box(p,0,h/2,0,w,h,thick,skin,true);
    box(p,0,.07,thick/2+.012,w,.13,.035,dark);
    box(p,0,h-.045,thick/2+.028,w-.12,.035,.065,trim);
    solidFrom(p,w,thick);
    const front=new T.Group(),back=new T.Group();front.position.z=thick/2;back.position.z=-thick/2;back.rotation.y=PI;p.add(front,back);
    return {p,front,back};
  }
  function hangingDoor(p,x=0,width=1.52,height=2.35,z=.11) {
    const doorway=new T.Group();doorway.position.set(x,0,z);p.add(doorway);
    border(doorway,0,height/2+.015,0,width+.16,height+.105,.080,.10,.22,trim);
    plane(doorway,0,height/2+.02,.073,width,height,photo('door'));
    plaque(doorway,0,height+.24,.07,C.exitLabel||'입구로',{w:1.13,h:.17,color:theme==='saturn'?'#efd3ab':'#474946'});
    targets.push({mesh:doorway,kind:'back'});
  }
  function ring(parent,cx,cy,cz,r,thick,m) {
    const o=mesh(parent,new T.TorusGeometry(r,thick,9,112),m,cx,cy,cz);o.rotation.x=PI/2;return o;
  }
  function turned(parent,x,y,z,profile,m) {
    return mesh(parent,new T.LatheGeometry(profile.map(([r,h])=>new T.Vector2(r,h)),80),m,x,y,z);
  }
  function seat(p,x,z,w,d=.62) {
    const g=new T.Group();g.position.set(x,0,z);p.add(g);
    box(g,0,.13,0,w-.22,.21,d*.74,dark);
    const cushion=rr(w,.18,.087);
    const m=material('trim',2,1,theme==='earth'?'#415d85':'#72534e');
    const c=mesh(g,extrude(cushion,d-.07,.030),m,0,.33,-d/2+.035);c.castShadow=true;
    plane(g,0,.325,d/2+.005,w-.14,.125,photo('bench'));
    p.updateWorldMatrix(true,false);const pos=g.getWorldPosition(point(0,0,0));
    solid(pos.x,pos.z,w,d,p.rotation.y);return g;
  }
  function wallSegment(a,b,cx,cz) {
    let [x,z]=a,[x2,z2]=b,dx=x2-x,dz=z2-z;const len=Math.hypot(dx,dz),mx=(x+x2)/2,mz=(z+z2)/2;
    let yaw=Math.atan2(-dz,dx);
    if((cx-mx)*Math.sin(yaw)+(cz-mz)*Math.cos(yaw)<0)yaw+=PI;
    return {p:at(mx,mz,yaw),len,t:yaw};
  }
  function roundedPort(seg,h,count=2) {
    const {p,len}=seg, gap=.265,portW=(len-gap*(count-1)-.64)/count;
    const frameH=h-.85, yc=.56+frameH/2;
    box(p,0,.27,0,len,.54,.27,shell);
    box(p,0,h-.125,0,len,.25,.30,shell);
    for(let i=0;i<count;i++){
      const x=(i+.5)*(portW+gap)-len/2+.32-gap/2;
      const w=portW,holeH=frameH;
      // Rectangular hull section with an actual rounded opening.
      const section=rr(w+.27,holeH+.24,.035);section.holes.push(rr(w-.15,holeH-.19,.74,true));
      mesh(p,extrude(section,.26,.01),shell,x,yc,-.18);
      border(p,x,yc,.09,w+.03,holeH+.01,.092,.055,.77,trim);
      border(p,x,yc,.142,w-.14,holeH-.16,.036,.023,.69,dark);
      // The glazing is optically clear; the planet is always the external sky.
      if(i===0){
        box(p,x+w/2+.10,yc+.45,.13,.25,.45,.125,trim);
        plane(p,x+w/2+.10,yc+.45,.202,.21,.37,photo('panel'));
      }
      seat(p,x,.73,w-.25,.58);
    }
    solidFrom(p,len,.29);
  }
  function horizontalPolygon(points,y,m,flip=false) {
    const s=new T.Shape();
    points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();
    const g=new T.ShapeGeometry(s),uv=g.attributes.uv,ps=g.attributes.position;
    for(let i=0;i<uv.count;i++)uv.setXY(i,ps.getX(i)/3.25,ps.getY(i)/3.25);
    const o=mesh(group,g,m,0,y,0);o.rotation.x=-PI/2;if(flip){o.material=m.clone();o.material.side=T.DoubleSide;}return o;
  }
  function floorFinish(){
    const m=material('floor',1.001,1).clone();
    m.roughness=theme==='moon'?.57:.37;m.metalness=theme==='moon'?.05:.18;
    // The source plates are material close-ups. Blend their high-frequency
    // grain into the distant floor's own tint, as a real polished finish does.
    const neutral=theme==='earth'?['.063','.089','.112']:theme==='moon'?['.24','.225','.205']:['.077','.061','.058'];
    const grain=theme==='earth'?'.20':theme==='moon'?'.40':'.55';
    m.onBeforeCompile=s=>{
      s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\n diffuseColor.rgb = mix(vec3('+neutral.join(',')+'), diffuseColor.rgb, '+grain+');');
    };
    return m;
  }
  // A small offscreen view of the actual room supplies the broad, soft
  // reflections of artwork, light and planet across the polished floor.
  function polish(floor) {
    const rt=new T.WebGLRenderTarget(368,240,{minFilter:T.LinearMipmapLinearFilter,magFilter:T.LinearFilter,generateMipmaps:true});
    rt.texture.generateMipmaps=true;
    const reflected=new T.PerspectiveCamera(),matrix=new T.Matrix4(),up=point(0,1,0),look=point(0,0,0);
    const uniforms={plate:{value:rt.texture},reflectionProjection:{value:matrix},opacityScale:{value:theme==='moon'?.15:theme==='earth'?.28:.34}};
    const coating=new T.ShaderMaterial({uniforms,side:T.DoubleSide,transparent:true,depthWrite:false,
      vertexShader:`uniform mat4 reflectionProjection; varying vec4 coord; varying vec3 world;
        void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;coord=reflectionProjection*p;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`uniform sampler2D plate;uniform float opacityScale;varying vec4 coord;varying vec3 world;
        void main(){vec2 u=coord.xy/coord.w*.5+.5;vec2 b=vec2(.008,.024);
          vec3 c=texture2D(plate,u,4.).rgb*.25;
          c+=(texture2D(plate,u+b,4.).rgb+texture2D(plate,u-b,4.).rgb)*.125;
          c+=(texture2D(plate,u+vec2(-b.x,b.y),4.).rgb+texture2D(plate,u+vec2(b.x,-b.y),4.).rgb)*.125;
          c+=(texture2D(plate,u+vec2(0.,2.*b.y),4.).rgb+texture2D(plate,u-vec2(0.,2.*b.y),4.).rgb)*.125;
          float g=1.-clamp(normalize(cameraPosition-world).y,0.,1.);gl_FragColor=vec4(c,opacityScale*(.41+.59*g*g));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    coating.addEventListener('dispose',()=>rt.dispose());
    const top=new T.Mesh(floor.geometry,coating);top.position.copy(floor.position);top.position.y+=.004;
    top.quaternion.copy(floor.quaternion);top.scale.copy(floor.scale);top.renderOrder=-1;top.raycast=()=>{};floor.parent.add(top);
    top.onBeforeRender=(renderer,scene,camera)=>{
      if(camera===reflected)return;
      const y=-.01;
      reflected.copy(camera,false);reflected.position.y=2*y-camera.position.y;
      camera.getWorldDirection(look).add(camera.position);look.y=2*y-look.y;
      reflected.up.set(0,1,0).applyQuaternion(camera.quaternion).reflect(up);reflected.lookAt(look);reflected.updateMatrixWorld();
      matrix.multiplyMatrices(reflected.projectionMatrix,reflected.matrixWorldInverse);
      const previous=renderer.getRenderTarget(),shadows=renderer.shadowMap.needsUpdate;
      top.visible=false;floor.visible=false;renderer.shadowMap.needsUpdate=false;
      renderer.setRenderTarget(rt);renderer.state.buffers.depth.setMask(true);
      try {renderer.render(scene,reflected);}
      finally {renderer.setRenderTarget(previous);renderer.shadowMap.needsUpdate=shadows;floor.visible=true;top.visible=true;}
    };
  }
  function bayImage(p,w,h,y,z) {
    const map=C.tex('artBay');if(!map)return;
    const key='bay-print';
    if(!cache.has(key))cache.set(key,new T.MeshBasicMaterial({map,toneMapped:false}));
    return plane(p,0,y,z,w,h,cache.get(key));
  }
  function orbitalSky(direction,scale) {
    const g=new T.SphereGeometry(170,128,64),v=g.attributes.position;
    const facing=point(...direction).normalize();
    const rotation=new T.Quaternion().setFromAxisAngle(point(0,1,0),Math.atan2(-facing.z,facing.x));
    rotation.multiply(new T.Quaternion().setFromAxisAngle(point(0,0,1),Math.asin(facing.y)));
    if(theme==='earth')rotation.multiply(new T.Quaternion().setFromAxisAngle(point(1,0,0),-.11));
    const uv=g.attributes.uv;
    const tmp=point(0,0,0),a=scale*scale;
    for(let i=0;i<v.count;i++){
      uv.setX(i,1-uv.getX(i));
      tmp.fromBufferAttribute(v,i).normalize();
      // Stereographic compression preserves the planet's round silhouette,
      // retains the entire generated sky, and sets its apparent angular size.
      const x=tmp.x,denom=(1+x)+a*(1-x);
      tmp.set(((1+x)-a*(1-x))/denom,2*scale*tmp.y/denom,2*scale*tmp.z/denom);
      tmp.applyQuaternion(rotation).multiplyScalar(170);v.setXYZ(i,tmp.x,tmp.y,tmp.z);
    }
    const map=C.tex('sky').clone();map.mapping=T.UVMapping;map.needsUpdate=true;
    const dome=mesh(group,g,new T.MeshBasicMaterial({map,side:T.BackSide,toneMapped:false,depthWrite:false,fog:false}));
    dome.renderOrder=-10;dome.raycast=()=>{};
  }
  function spot(parent,x,y,z,tx,ty,tz,power,angle) {
    const l=new T.SpotLight(0xffe5c4,power,10,angle,.94,2);
    l.position.set(x,y,z);l.target.position.set(tx,ty,tz);parent.add(l,l.target);
  }
  function earth() {
    const hull=[[-6.72,7.12],[-6.72,1.51],[-3.67,-7.41],[5.22,-7.41],[6.45,-6.16],[6.45,6.15],[5.29,7.32],[-5.81,7.32]];
    orbitalSky([-.61,-.33,-.72],.79);
    const H=4.03,segments=hull.map((a,i)=>wallSegment(a,hull[(i+1)%hull.length],0,0));
    polish(horizontalPolygon(hull,-.014,floorFinish()));horizontalPolygon(hull,H+.03,ceil,true);
    segments.forEach((s,i)=>{
      if(i===1){roundedPort(s,H,2);return;}
      const {p,len}=s;
      box(p,0,H/2,0,len+.025,H,.23,shell);
      box(p,0,.14,.14,len,.21,.085,trim);
      box(p,0,H-.28,.155,len,.27,.22,trim);
      box(p,0,H-.41,.244,len-.15,.028,.045,luminous);
      solidFrom(p,len,.25);
    });
    // Plumbing and overhead ribs belong to the capsule, with a second bay visible past the first wall.
    for(const zz of [-6.36,-3.40,-.44,2.52,5.48]){
      const length=zz<0?9.60:12.04;
      const holder=at(.1,zz);rail(holder,[[-length*.5,3.72,0],[-length*.5+.64,3.96,0],[0,4.0,0],[length*.5-.52,3.96,0],[length*.5,3.74,0]],.045,trim);
      box(holder,0,3.948,-.10,length*.62,.021,.038,luminous);
    }
    const hero=panel(1.66,-3.01,-.14,6.44,3.39,.22);
    bayImage(hero.front,6.40,3.27,1.69,.012);
    spot(hero.front,-1.85,3.29,.74,-1.72,1.32,0,14,.77);
    spot(hero.front,1.44,3.29,.74,1.46,1.32,0,14,.77);
    box(hero.p,0,3.33,.14,6.49,.15,.20,trim);
    box(hero.p,0,3.245,.233,6.20,.025,.029,luminous);
    artwork(hero.front,0,0,1.95,3.7,2.08);
    hangGrid(hero.back,range(1,8),5.9,[2.65,1.22]);
    hangGrid(segments[2].p,range(9,10),8.2,[2.7,1.27]);
    hangGrid(segments[4].p,range(19,12),11.6,[2.7,1.27]);
    const rear=segments[6].p;hangingDoor(rear);
    return {swapHero,spawn:[-.54,.02],yaw:-.02,camera:{distance:4.29},bounds:[-6.72,6.45,-7.41,7.32],solids,targets};
  }
  function domeShell() {
    const p=[],uv=[],indices=[],n=96,rows=14;
    for(let j=0;j<=rows;j++){
      const t=j/rows,e=Math.sin(t*PI/2),r=8.5-5.19*t,cx=1.40*t,cz=-2.22*t,y=2.98+1.35*e;
      for(let i=0;i<=n;i++){
        const a=TAU*i/n;p.push(cx+r*Math.cos(a),y,cz+r*Math.sin(a));uv.push(i/n*10,t*2.5);
        if(j&&i){const k=j*(n+1)+i;indices.push(k-n-2,k-n-1,k,k-n-2,k,k-1);}
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
    const skin=ceil.clone();skin.side=T.DoubleSide;mesh(group,g,skin);
    for(const [r,y,m] of [[3.31,4.32,trim],[3.39,4.29,dark],[3.30,4.38,trim]])ring(group,1.40,y,-2.22,r,.028,m);
    // The oculus has a real recessed lip, with the external panorama visible above.
    const lip=material('trim',6,1).clone();lip.side=T.DoubleSide;
    mesh(group,new T.CylinderGeometry(3.35,3.31,.20,96,1,true),lip,1.40,4.44,-2.22);
  }
  function moon() {
    const R=8.5,H=2.99,n=24;
    const perimeter=Array.from({length:n},(_,i)=>{
      const a=TAU*(i-.5)/n;return [R*Math.sin(a),R*Math.cos(a)];
    });
    polish(horizontalPolygon(perimeter,-.014,floorFinish()));domeShell();
    const sections=perimeter.map((a,i)=>wallSegment(a,perimeter[(i+1)%n],0,0));
    sections.forEach(({p,len})=>{
      box(p,0,H/2,0,len+.015,H,.21,shell);
      box(p,0,.075,.12,len,.115,.043,dark);solidFrom(p,len,.24);
    });
    hangingDoor(sections[0].p);
    const first=panel(-2.79,-.94,.27,4.64,3.34,.22,matte);
    bayImage(first.front,4.60,3.25,1.68,.011);
    spot(first.front,-.80,3.37,.86,-.96,1.55,0,18,.78);
    artwork(first.front,0,0,2.05,3.3,1.85);
    lamp(first.front,-1.05,3.38,.17,.28);lamp(first.front,1.32,3.38,.17,.28);
    hangGrid(first.back,range(1,6),4.4,[2.65,1.22]);
    const second=panel(2.18,-4.34,-.095,5.02,2.94,.22,matte);
    bayImage(second.front,4.98,2.86,1.48,.012);
    spot(second.front,1.04,2.99,.77,1.07,1.15,0,14,.82);
    // The second panel is lower, so it takes one row a side; the perimeter walls take the rest.
    hangGrid(second.front,range(7,4),4.8,[1.75]);
    for(const xx of [-1.87,0,1.90])lamp(second.front,xx,2.99,.17,.24);
    hangGrid(second.back,range(11,4),4.8,[1.75]);
    [2,3,5,6,8,9,11,12,14,15,17,18,20,21,22,23].forEach((s,j)=>{
      artwork(sections[s].p,15+j,0,1.72,FRAME_W,FRAME_H,.17);lamp(sections[s].p,0,2.58,.16,.20);
    });
    // A low continuous upholstered seat under the opening leaves a generous walking ring.
    const cx=1.23,cz=-.70,rb=1.34;
    turned(group,cx,.015,cz,[[0,0],[rb*.89,0],[rb*.92,.17],[0,.17]],dark);
    function cloth(u,v){
      const m=new T.MeshStandardMaterial({map:C.tex('bench'),roughness:.94});
      m.onBeforeCompile=s=>{
        s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',
          'vec2 stitch=fract(vMapUv*vec2('+u.toFixed(1)+','+v.toFixed(1)+'))*vec2(.26,.22)+vec2(.13,.59); diffuseColor.rgb=mix(vec3(.235,.213,.19),texture2D(map,stitch).rgb,.42);');
      };
      m.customProgramCacheKey=()=>u+'x'+v;return m;
    }
    const upholstery=cloth(32,2);
    turned(group,cx,.078,cz,[[0,0],[rb-.08,0],[rb,.055],[rb,.32],[rb-.034,.39],[rb-.13,.42]],upholstery);
    const top=mesh(group,new T.CircleGeometry(rb-.127,80),cloth(12,12),cx,.498,cz);top.rotation.x=-PI/2;
    ring(group,cx,.043,cz,rb+.48,.011,trim);
    for(let i=0;i<14;i++){
      const a=TAU*i/14;solid(cx+Math.cos(a)*rb*.70,cz+Math.sin(a)*rb*.70,rb*.69,rb*.69,a);
    }
    return {swapHero,spawn:[.02,1.76],yaw:.018,camera:{distance:4.28},bounds:[-R,R,-R,R],solids,targets};
  }
  function annularHorizontal(cx,cz,r1,r2,y,m,faceUp=true) {
    const n=112,p=[],uv=[],indices=[];
    for(let j=0;j<=n;j++){
      const a=TAU*j/n;
      for(const r of [r1,r2]){const x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;p.push(x,y,z);uv.push(x/3.2,z/3.2);}
      if(j){const k=j*2;indices.push(k-2,k,k+1,k-2,k+1,k-1);}
    }
    if(!faceUp)indices.reverse();
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
    const surface=m.clone();surface.side=T.DoubleSide;return mesh(group,g,surface);
  }
  function saturn() {
    const cx=-10.34,cz=-.10,Ri=6.64,Ro=13.32,H=3.86,n=56;
    orbitalSky([.33,.09,-.935],.134);
    const plum=material('shell',1,1,'#f6e8ea');const charcoal=material('ceiling',1.001,1,'#ddcdc0');
    polish(annularHorizontal(cx,cz,Ri,Ro,-.012,floorFinish()));annularHorizontal(cx,cz,Ri,Ro-.62,H,charcoal,false);
    const mid=material('shell',8,1).clone();mid.side=T.DoubleSide;
    mesh(group,new T.CylinderGeometry(Ri,Ri,H,96,1,true),mid,cx,H/2,cz);
    for(const [height,r,rad,m] of [[.14,Ro-.08,.068,trim],[.72,Ro-.14,.034,trim],[H-.04,Ro-.63,.060,trim],[3.64,9.26,.078,dark],[3.60,9.31,.026,luminous],[.018,11.35,.012,trim],[.09,Ri+.07,.04,trim]])ring(group,cx,height,cz,r,rad,m);
    // Slender curved mullions and a low parapet leave the outside of the ring
    // physically open to the orbit panorama, from floor level to overhead.
    const sillMat=material('trim',10,1).clone();sillMat.side=T.DoubleSide;
    mesh(group,new T.CylinderGeometry(Ro-.03,Ro,.27,112,1,true),sillMat,cx,.135,cz);
    for(let i=0;i<n;i++){
      const a=TAU*i/n;
      const loc=(r,y)=>[cx+r*Math.cos(a),y,cz+r*Math.sin(a)];
      if(i%2===0){
        rail(group,[loc(Ro-.06,.20),loc(Ro-.09,1.13),loc(Ro-.17,2.12),loc(Ro-.35,3.02),loc(Ro-.66,H-.03)],.052,trim);
        rail(group,[loc(Ri+.03,H-.04),loc(Ri+1.13,H-.15),loc(Ri+2.61,H-.19),loc(Ro-.68,H-.03)],.055,dark);
        const r=Ri+2.58;
        const track=at(cx+r*Math.cos(a),cz+r*Math.sin(a),PI/2-a);
        const head=mesh(track,new T.CylinderGeometry(.085,.096,.103,12),dark,0,H-.23,0);
        mesh(track,new T.CylinderGeometry(.060,.066,.006,12),luminous,0,head.position.y-.055,0);
      }
      const b=TAU*(i+.5)/n;
      for(const r of [Ri,Ro])solid(cx+r*Math.cos(b),cz+r*Math.sin(b),2*r*Math.sin(PI/n)+.07,.19,PI/2-b);
    }
    // Six walls stand on one inner circle, turned toward the visitor walking the ring:
    // following the corridor once passes every wall face-on, with no weaving between walls.
    const wallHeight=3.62,wallWidth=4.16,bayRadius=8.35,tilt=.45;
    for(let i=0;i<6;i++){
      const a=-.42-i*.86;
      const yaw=PI/2-(a+tilt);
      const bay=panel(cx+bayRadius*Math.cos(a),cz+bayRadius*Math.sin(a),yaw,wallWidth,wallHeight,.42,plum);
      // A recessed warm exhibition liner sits inside the deep burgundy bay.
      const f=bay.front;box(f,0,1.83,.032,3.54,2.98,.079,matte);
      bayImage(f,wallWidth-.022,wallHeight-.022,wallHeight/2,.137);
      border(f,0,1.83,.084,3.59,3.03,.062,.047,.105,trim);
      box(f,0,.14,.066,3.94,.15,.089,trim);
      box(f,0,.057,.117,3.72,.019,.022,luminous);
      if(i===0)artwork(f,0,0,2.05,3.1,1.95,.143);
      else hangGrid(f,range(1+(i-1)*6,6),3.5,[2.65,1.22],.143);
      lamp(f,0,3.42,.23,.33);
      if(i===0||i===1)spot(f,0,3.48,.85,0,1.47,0,18,.75);
    }
    const last=.77,doorNode=at(cx+8.58*Math.cos(last),cz+8.58*Math.sin(last),PI/2-(last+.94));
    box(doorNode,0,1.64,0,3.82,3.28,.23,plum,true);solidFrom(doorNode,3.82,.23);
    hangingDoor(doorNode,0,1.56,2.35,.14);
    return {swapHero,spawn:[.04,0],yaw:-.10,camera:{distance:4.27},bounds:[cx-Ro,cx+Ro,cz-Ro,cz+Ro],solids,targets};
  }
  return theme==='moon'?moon():theme==='saturn'?saturn():earth();
}
