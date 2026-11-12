/** Interactive arrival architecture for the three station museums. Fronts face +Z. */
export function buildArrival(C,stage) {
  const {T,group,theme}=C;
  const moon=theme==='moon', saturn=theme==='saturn';
  const tau=Math.PI*2, solids=[], targets=[],cache=new Map(),geometries=new Map();
  const palette=moon?{skin:'#ded3be',edge:'#c3b39a',dark:'#383735',metal:'#736e61',glow:'#ffe4ac',seat:'#dbd0b8',glz:'#a6b0af'}:
    saturn?{skin:'#553847',edge:'#b99058',dark:'#241c27',metal:'#745940',glow:'#ffe0a4',seat:'#613c45',glz:'#687a89'}:
    {skin:'#e1e4e3',edge:'#a2b5c3',dark:'#2b3946',metal:'#768b9b',glow:'#ffe0a0',seat:'#486b9c',glz:'#7998ae'};
  function surface(key,rx=1,ry=1,tint='#ffffff'){
    const k=[key,rx,ry,tint].join('/');
    if(!cache.has(k)){const m=C.mat(key,rx,ry).clone();if(m.color)m.color.multiply(new T.Color(tint));cache.set(k,m);}
    return cache.get(k);
  }
  function glow(color=palette.glow){if(!cache.has(color))cache.set(color,new T.MeshBasicMaterial({color,toneMapped:false}));return cache.get(color);}
  function photographed(key){const k='image/'+key;if(!cache.has(k))cache.set(k,new T.MeshBasicMaterial({map:C.tex(key),side:T.DoubleSide,toneMapped:false}));return cache.get(k);}
  function graphic(tex){return new T.MeshBasicMaterial({map:tex,toneMapped:false,side:T.DoubleSide});}
  const skyGlass=new T.MeshStandardMaterial({color:palette.glz,transparent:true,opacity:moon?.18:.14,roughness:.23,metalness:.15,depthWrite:false,side:T.DoubleSide});
  const hit=new T.MeshBasicMaterial({transparent:true,opacity:0,colorWrite:false,depthWrite:false,side:T.DoubleSide});
  // Generated panels already carry their finish and colour, particularly the
  // deep plum anodisation. A second paint tint would crush its warm highlights.
  const skin=surface(stage==='hub'?'shell':'exteriorHull',1,1,saturn?'#fff5eb':moon?'#fffaf2':'#f4f8ff');
  const edge=surface('trim',1,1,saturn?'#ffe6b7':'#e4e4dd'),dark=surface('trim',1,1,palette.dark),metal=surface(stage==='hub'?'trim':'rail',1,1,moon?'#bdb5a1':'#bcc1c4');
  const ceiling=surface('ceiling'), floor=surface('floor',4,4), oakSeat=surface('shell',1,1,palette.seat);
  function grp(parent,x=0,y=0,z=0,a=0){const o=new T.Group();o.position.set(x,y,z);o.rotation.y=a;parent.add(o);return o;}
  function mesh(parent,g,m,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);
    if(m.isMeshStandardMaterial&&!m.transparent){o.receiveShadow=true;o.castShadow=stage!=='hub';}
    parent.add(o);return o;}
  function geom(key,fn){if(!geometries.has(key))geometries.set(key,fn());return geometries.get(key);}
  const cube=geom('cube',()=>new T.BoxGeometry()),unitPlane=geom('plane',()=>new T.PlaneGeometry());
  function box(parent,x,y,z,w,h,d,m){const o=mesh(parent,cube,m,x,y,z);o.scale.set(w,h,d);return o;}
  function plane(parent,x,y,z,w,h,m){const o=mesh(parent,unitPlane,m,x,y,z);o.scale.set(w,h,1);return o;}
  function disc(parent,x,y,z,r,h,m,n=64){const g=geom('c'+n,()=>new T.CylinderGeometry(1,1,1,n));const o=mesh(parent,g,m,x,y,z);o.scale.set(r,h,r);return o;}
  function ring(parent,x,y,z,r,t,m,a=tau){
    const g=geom(['t',r,t,a].join(','),()=>new T.TorusGeometry(r,t,9,Math.max(16,Math.ceil(88*a/tau)),a));
    const o=mesh(parent,g,m,x,y,z);o.rotation.x=-Math.PI/2;return o;
  }
  function strokedPath(w,h,r,x=0,y=0,path=new T.Shape()){
    const l=x-w/2,b=y-h/2,rr=Math.max(.001,Math.min(r,w/2-.001,h/2-.001));
    path.moveTo(l+rr,b);path.lineTo(l+w-rr,b);path.quadraticCurveTo(l+w,b,l+w,b+rr);
    path.lineTo(l+w,b+h-rr);path.quadraticCurveTo(l+w,b+h,l+w-rr,b+h);
    path.lineTo(l+rr,b+h);path.quadraticCurveTo(l,b+h,l,b+h-rr);
    path.lineTo(l,b+rr);path.quadraticCurveTo(l,b,l+rr,b);path.closePath();return path;
  }
  function shapeGeo(shape,depth,bevel,w,h,centerY=0){
    const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,curveSegments:8});
    const pos=g.attributes.position,norm=g.attributes.normal,uv=g.attributes.uv;
    // Normalize extrusion UVs, including the return, so the photographic surface
    // is present on the edge of a pier, in a door reveal and under an eave.
    for(let i=0;i<pos.count;i++){const px=pos.getX(i),py=pos.getY(i)-centerY,pz=pos.getZ(i);
      if(Math.abs(norm.getZ(i))>.5)uv.setXY(i,px/w+.5,py/h+.5);
      else if(Math.abs(norm.getX(i))>.5)uv.setXY(i,pz/Math.max(.5,depth),py/h+.5);
      else uv.setXY(i,px/w+.5,pz/Math.max(.5,depth));
    }return g;
  }
  function rounded(parent,x,y,z,w,h,depth,r,m,bevel=.025){
    const key=['round',w,h,depth,r,bevel].join(',');
    return mesh(parent,geom(key,()=>shapeGeo(strokedPath(w,h,r),depth,bevel,w,h)),m,x,y,z);
  }
  function facePhoto(parent,key,x,y,z,w,h,r=0.07,uvBox=[0,0,1,1]){
    const tex=C.tex(key);if(!tex)return;
    const g=new T.ShapeGeometry(strokedPath(w,h,r),12),pos=g.attributes.position,uv=g.attributes.uv;
    for(let i=0;i<pos.count;i++)uv.setXY(i,uvBox[0]+(pos.getX(i)/w+.5)*(uvBox[2]-uvBox[0]),uvBox[1]+(pos.getY(i)/h+.5)*(uvBox[3]-uvBox[1]));
    return mesh(parent,g,photographed(key),x,y,z);
  }
  function rim(parent,x,y,z,w,h,r,iw,ih,ir,depth,m,bevel=.022){
    const key=['rim',w,h,r,iw,ih,ir,depth,bevel].join(',');
    const g=geom(key,()=>{const s=strokedPath(w,h,r);s.holes.push(strokedPath(iw,ih,ir,0,0,new T.Path()));return shapeGeo(s,depth,bevel,w,h);});
    return mesh(parent,g,m,x,y,z);
  }
  function taperedDome(parent,x,y,z,rx,ht,rz,m,options={}){
    const {cut=0,cutHeight=0,openTop=0}=options,N=64,V=17,p=[],uv=[],ix=[];
    const begin=openTop ? Math.asin(Math.min(.95,openTop)) : 0;
    for(let v=0;v<=V;v++){const t=begin+(Math.PI/2-begin)*v/V;
      for(let u=0;u<=N;u++){const a=u/N*tau,s=Math.sin(t);p.push(rx*s*Math.sin(a),ht*Math.cos(t),rz*s*Math.cos(a));uv.push(u/N*3,1-v/V);}
    }
    for(let v=0;v<V;v++)for(let u=0;u<N;u++){
      const a=(u+.5)/N*tau,t=begin+(Math.PI/2-begin)*(v+.5)/V;
      if(cut && Math.min(a,tau-a)<cut && ht*Math.cos(t)<cutHeight)continue;
      const k=v*(N+1)+u;ix.push(k,k+N+1,k+1,k+1,k+N+1,k+N+2);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();
    return mesh(parent,g,m,x,y,z);
  }
  function horizontalBand(parent,x,y,z,inner,outer,m,start=0,end=tau){
    const g=geom(['band',inner,outer,start,end].join(','),()=>new T.RingGeometry(inner,outer,84,1,start,end-start));
    const o=mesh(parent,g,m,x,y,z);o.rotation.x=-Math.PI/2;return o;
  }
  function tubeStrip(parent,points,r,m){
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
    return mesh(parent,new T.TubeGeometry(curve,Math.max(12,points.length*3),r,6,false),m);
  }
  function lamp(parent,x,y,z,s=1){
    rounded(parent,x,y,z,.32*s,.14*s,.035,.05,dark,.011);
    plane(parent,x,y,z+.041,.25*s,.072*s,photographed('light'));
    box(parent,x,y-.036*s,z+.055,.19*s,.016*s,.016,glow());
  }
  function title(parent,text,x,y,z,w,h,ink='#fff0cb',opt={}){
    return plane(parent,x,y,z,w,h,C.label(text,{width:Math.max(420,Math.round(w/h*100)),height:100,font:'600 52px "Malgun Gothic",sans-serif',color:ink,...opt}));
  }
  function framedCover(parent,absolute,x,y,z,w,h){
    rounded(parent,x,y,z,w+.12,h+.12,.044,.052,edge,.012);
    plane(parent,x,y,z+.059,w+.046,h+.046,dark);const tex=C.coverTex(absolute);
    // A mount is a physical plane; artwork is fitted in its original ratio.
    const width=tex?.userData.sourceWidth||tex?.image?.width,height=tex?.userData.sourceHeight||tex?.image?.height;
    const ratio=width&&height?width/height:w/h,aw=Math.min(w,h*ratio),ah=aw/ratio;
    plane(parent,x,y,z+.062,w,h,surface('shell',1,1,'#e7ddc9'));
    return plane(parent,x,y,z+.066,aw,ah,graphic(tex));
  }
  function collisionAt(anchor,localX,localZ,w,d){
    const a=anchor.rotation.y,c=Math.cos(a),s=Math.sin(a);
    solids.push({x:anchor.position.x+c*localX+s*localZ,z:anchor.position.z-s*localX+c*localZ,w,d,angle:a});
  }
  function hatch(parent,x,y,z,w=2.15,h=2.72,kind='enter',index){
    // A true recess with an aperture, reveal and frames. The touch plane is
    // transparent so a person looking from the bridge can see the room within.
    const outerR=moon?.82:saturn?.45:.53;
    rim(parent,x,y,z,w+.41,h+.34,outerR,w,h,outerR*.7,.38,skin,.045);
    rim(parent,x,y,z-.45,w+.17,h+.13,outerR*.8,w-.02,h-.025,outerR*.65,.05,metal,.018);
    if(C.tex('portalSkin')){
      // Align the actual keyed aperture to the 3D jamb (bounds measured in
      // each generated elevation). Crop only the outer wall margin.
      const [left,right,top]=moon?[.209,.781,.189]:saturn?[.204,.794,.207]:[.220,.780,.240];
      const imageW=w/(right-left),imageH=h/(1-top);
      const fullW=w+(stage==='hub'?.79:.55),fullH=h+(stage==='hub'?.49:.38);
      const centerY=fullH/2-h/2-.045,shape=strokedPath(fullW,fullH,outerR+.13,0,centerY);
      shape.holes.push(strokedPath(w+.09,h+.055,outerR*.75,0,0,new T.Path()));
      const g=new T.ShapeGeometry(shape,16),p=g.attributes.position,uv=g.attributes.uv;
      for(let i=0;i<p.count;i++)uv.setXY(i,(left+right)*.5+p.getX(i)/imageW,(p.getY(i)+h/2)/imageH);
      const mat=photographed('portalSkin');mat.transparent=true;mat.alphaTest=.06;
      mesh(parent,g,mat,x,y,z+.449);
    }else{
      rim(parent,x,y,z+.395,w+.17,h+.13,outerR*.77,w-.015,h-.01,outerR*.65,.06,edge,.016);
      for(const side of [-1,1])box(parent,x+side*(w/2-.025),y-.08,z+.445,.02,h*.50,.028,glow());
    }
    box(parent,x,y-h/2+.02,z+.16,w,.038,.76,metal);
    const pick=plane(parent,x,y,z+.461,w,h,hit);
    targets.push(index===undefined?{mesh:pick,kind}:{mesh:pick,kind,index});
    return pick;
  }
  function deck(parent,x,z,w,d,m){
    box(parent,x,-.14,z,w,.26,d,m);
    for(const k of [-1,1]){box(parent,x+k*(w*.5-.04),.024,z,.10,.045,d,edge);box(parent,x+k*(w*.5-.17),.034,z,.028,.025,d,glow());}
  }
  function approach(z0,z1,w,covered=false){
    const d=z1-z0,mid=(z1+z0)/2;
    deck(group,0,mid,w,d,surface('tread',2,Math.max(2,Math.round(d/1.8))));
    const count=Math.ceil(d/2);
    for(let k=0;k<=count;k++){
      const z=z0+k*d/count;
      for(const side of [-1,1]){
        const x=side*(w/2-.035);
        box(group,x,.43,z,.11,.89,.15,metal);
        box(group,x,.72,z,.13,.064,.22,edge);
      }
      if(covered && k<2){
        rim(group,0,1.63,z,w+.17,3.40,.65,w-.025,3.23,.51,.10,metal,.021);
        box(group,0,3.20,z+.132,w*.48,.034,.035,glow());
      }
    }
    for(const side of [-1,1]){
      const x=side*(w/2-.035);box(group,x,.87,mid,.10,.12,d,edge);box(group,x,.39,mid,.046,.045,d,metal);
      if(covered){const glass=box(group,x,1.42,z0+.95,.012,1.11,1.90,skyGlass);glass.renderOrder=1;}
    }
  }
  function littleGlazing(parent,x,y,z,w,h){
    rounded(parent,x,y,z,w+.16,h+.13,.040,.1,dark,.01);
    plane(parent,x,y,z+.046,w,h,photographed('panel'));
  }
  function cabin(parent,x,z,a,w=5.7,h=2.62,depth=2.45,index=0){
    const g=grp(parent,x,0,z,a),yc=1.35;
    // Hollow extruded rounded shell with glass and works on both elevations.
    rim(g,0,yc,-depth/2,w,h,1.07,w-.68,h-.67,.78,depth,skin,.15);
    for(const sign of [-1,1]){
      const f=grp(g,0,yc,sign*(depth/2+.065),sign===1?0:Math.PI);
      rim(f,0,0,0,w-.16,h-.15,1.02,w-.57,h-.56,.76,.07,edge,.035);
      rim(f,0,0,.083,w-.55,h-.55,.79,w-.71,h-.72,.72,.02,dark,.012);
      facePhoto(f,'exteriorBay',0,0,-.17,w-.65,h-.69,.65);
      plane(f,0,0,-.015,w-.82,h-.88,skyGlass);
      for(const s of [-1,1]){box(f,s*(w*.32),0,.115,.055,h-.73,.09,metal);}
      box(f,0,-h*.39,.135,w*.59,.025,.04,glow());
    }
    box(g,0,1.29,0,w-.8,1.97,.18,surface('shell',1,1,'#e9d8bd'));
    for(const sign of [-1,1]){
      const wall=grp(g,0,0,sign*.106,sign===1?0:Math.PI);
      for(let i=0;i<3;i++)framedCover(wall,(index*3+i)%20,(i-1)*1.23,1.41,0,.88,.95);
      box(wall,0,2.30,.03,w-.98,.034,.078,glow());
      const nose=grp(g,sign*(w/2+.157),yc,0,sign*Math.PI/2);
      rounded(nose,0,0,0,depth-.13,1.18,.039,.30,dark,.02);
      facePhoto(nose,'exteriorBay',0,0,.069,depth-.23,1.07,.244,[.18,0,.82,1]);
      for(const side of [-1,1])box(nose,side*depth*.168,0,.079,.028,.98,.040,metal);
      box(nose,0,-.57,.062,depth*.63,.015,.026,glow());
    }
    return g;
  }
  function solarWing(x,z,a){
    const g=grp(group,x,1.53,z,a);box(g,0,0,0,3,.11,.13,metal);
    for(const sign of [-1,1]){
      const nx=sign*3.31;box(g,nx,0,0,4.1,.075,1.65,metal);
      const top=plane(g,nx,.040,0,4.02,1.58,surface('terrain',3,1));top.rotation.x=-Math.PI/2;
      for(let i=-1;i<=1;i++)box(g,nx+i*.96,.049,0,.018,.016,1.61,edge);
    }
  }
  function frontRoom(z){
    const w=moon?3.15:2.13;
    const f=grp(group,0,0,z);hatch(f,0,1.45,0,w,2.77);
    const lining=surface('shell',1,1,moon?'#c7bca8':saturn?'#8c705b':'#d5cbc0');
    for(const side of [-1,1])box(f,side*(w/2+.076),1.42,-1.30,.17,2.9,2.75,lining);
    box(f,0,2.86,-1.35,w+.28,.14,2.9,lining);box(f,0,0,-1.35,w+.28,.12,2.95,surface('tread',1,2));
    box(f,0,1.43,-2.65,w+.31,2.90,.19,lining);
    if(C.tex('roomView'))plane(f,0,1.41,-.61,w+.13,2.84,photographed('roomView'));
    else framedCover(f,0,0,1.51,-2.53,1.53,1.18);
    lamp(f,0,2.58,-2.47,.95);
    littleGlazing(f,w/2+.31,1.2,.06,.29,.52);
  }
  function earthExterior(){
    const shellMap=surface('exteriorHull',2,1);disc(group,0,.79,-1.2,3.65,1.58,skin);
    taperedDome(group,0,1.52,-1.2,3.79,2.12,3.79,skyGlass);
    for(const rr of [3.56,3.73])ring(group,0,1.49,-1.2,rr,.13,edge);
    for(let i=0;i<12;i++){
      const a=i*tau/12,pts=[];
      for(let k=0;k<=13;k++){const v=k/13*Math.PI/2;pts.push([Math.cos(v)*3.71*Math.sin(a),1.51+Math.sin(v)*2.17,-1.2+Math.cos(v)*3.71*Math.cos(a)]);}
      tubeStrip(group,pts,.082,shellMap);
    }
    disc(group,0,3.68,-1.2,.78,.105,edge);ring(group,0,3.73,-1.2,.69,.043,glow());
    for(let i=0;i<5;i++){const a=(.5+i)*tau/5;const r=5.02;const p=cabin(group,r*Math.sin(a),-1.2+r*Math.cos(a),Math.PI/2+a,5.64,2.55,2.2,i);p.position.y=.05;}
    // The front collar emerges between the two near petals.
    const spline=grp(group,0,0,2.64);rim(spline,0,1.46,-.80,3.46,3.12,.85,2.21,2.73,.52,3.21,skin,.10);
    frontRoom(5.16);approach(5.46,16.85,2.96,true);
    solarWing(-7.74,-4.8,-.11);solarWing(7.74,-4.8,.11);
    return {spawn:[-.15,10.65],yaw:.025,bounds:[-1.36,1.36,4.78,16.53],camera:{height:2.08,distance:4.30,pitch:-.058,fov:53},establishing:{position:[-11.4,10.35,15.80],lookAt:[0,1.20,.65],fov:44}};
  }
  function moonTerrain(){
    const w=84,div=88,geo=new T.PlaneGeometry(w,w,div,div);geo.rotateX(-Math.PI/2);
    const p=geo.attributes.position,craters=[[-13,8,4.3,.71],[13,10,5.7,.83],[-21,-9,6.1,1.1],[16,-13,6.0,1.2],[4,-23,9.2,.95],[-23,22,6.5,.72],[21,-1,4.5,.7]];
    for(let j=0;j<p.count;j++){const x=p.getX(j),z=p.getZ(j);let y=-.23+(.14*Math.sin(.6*x+.18*z)+.17*Math.sin(z*.73-x*.14)+.075*Math.sin(x*1.83+z*1.13));
      for(const [cx,cz,r,d] of craters){const q=Math.hypot(x-cx,z-cz)/r;y+=d*(1.03*Math.exp(-(((q-1)/.18)**2))-.83*Math.exp(-(q**4)*2));}
      const openPath=Math.min(1,Math.max(0,(Math.abs(x)-1.5)/1.5));y=-.17+(y+.17)*openPath;
      const boundary=Math.max(0,Math.min(1,(Math.hypot(x,z)-18)/20));y+=boundary*(1.2+2.8*Math.abs(Math.sin(.16*x+.08*z)*Math.cos(.11*z)));
      p.setY(j,y);
    }geo.computeVertexNormals();mesh(group,geo,surface('terrain',13,13));
    for(let k=0;k<58;k++){const a=k*2.399+1.25,r=8+(k*47%109)/8,x=Math.sin(a)*r,z=Math.cos(a)*r;
      if(Math.abs(x)<2.9&&z>2)continue;
      const o=mesh(group,geom('stone'+(k%4),()=>new T.IcosahedronGeometry(1,k%3===0?1:0)),surface('terrain',2,1,k%3===0?'#b3ada6':'#a49d98'),x,-.13,z);
      const s=.11+(k*17%29)*.018;o.scale.set(s*1.32,s*.63,s);o.rotation.set(k*.12,k*.74,k*.22);
    }
  }
  function moonExterior(){
    moonTerrain();const hull=surface('exteriorHull',3,2);
    taperedDome(group,0,-.13,-.63,6.42,4.08,6.42,hull,{cut:.345,cutHeight:2.98,openTop:.35});
    const topY=-.13+4.08*Math.sqrt(1-.35*.35);
    ring(group,0,topY,-.63,6.42*.35,.14,edge);taperedDome(group,0,topY-.03,-.63,2.18,.51,2.18,skyGlass);
    disc(group,0,topY-.1,-.63,2.18,.065,metal);
    if(C.tex('roomView')){const photo=mesh(group,new T.CircleGeometry(2.11,56),photographed('roomView'),0,topY-.05,-.63);photo.rotation.x=-Math.PI/2;}
    function lunarWindow(x,z,r,h,start,end,base,top,axisY){
      if(!C.tex('exteriorBay'))return;
      const p=[],uv=[],tri=[],up=[],lo=[],columns=23,rows=7;
      for(let i=0;i<=columns;i++){
        const a=start+(end-start)*i/columns;
        for(let j=0;j<=rows;j++){
          const ratio=base+(top-base)*j/rows,hr=r*Math.sqrt(1-ratio*ratio)+.052;
          const point=[x+Math.sin(a)*hr,axisY+h*ratio,z+Math.cos(a)*hr];
          p.push(...point);uv.push(i/columns,j/rows);
          if(j===0)lo.push(point);if(j===rows)up.push(point);
          if(j<rows&&i<columns){
            const ix=i*(rows+1)+j;tri.push(ix,ix+rows+1,ix+1,ix+1,ix+rows+1,ix+rows+2);
          }
        }
      }
      const panel=new T.BufferGeometry();panel.setAttribute('position',new T.Float32BufferAttribute(p,3));panel.setAttribute('uv',new T.Float32BufferAttribute(uv,2));panel.setIndex(tri);panel.computeVertexNormals();
      mesh(group,panel,photographed('exteriorBay'));tubeStrip(group,up,.043,edge);tubeStrip(group,lo,.041,edge);
    }
    for(const [a,b] of [[-1.78,-.46],[.46,1.78],[2.35,3.95]])lunarWindow(0,-.63,6.42,4.08,a,b,.20,.62,-.13);
    for(const [x,z,r] of [[-7.2,-1.65,3.9],[6.97,-2.35,3.7],[-4.1,-7.0,3.4],[4.28,-7.9,3.25]]){
      const h=r*.61;const qty=.49;const yc=-.15+h*Math.sqrt(1-qty*qty);
      taperedDome(group,x,-.15,z,r,h,r,hull,{openTop:qty});disc(group,x,yc-.21,z,r*qty,.17,metal);
      taperedDome(group,x,yc-.11,z,r*qty,.35,r*qty,skyGlass);ring(group,x,yc-.05,z,r*qty,.074,edge);
      for(let i=0;i<6;i++){const a=tau*i/6;box(group,x+Math.sin(a)*r*qty*.91,yc-.035,z+Math.cos(a)*r*qty*.91,.06,.22,.06,glow());}
      for(const [a,b] of [[-1.84,.27],[.44,2.44]])lunarWindow(x,z,r,h,a,b,.19,.68,-.15);
    }
    const port=grp(group,0,0,5.04);
    rim(port,0,1.36,-.76,4.24,3.16,1.31,3.21,2.72,.86,1.2,skin,.075);
    frontRoom(5.58);deck(group,0,11.57,3.27,11.14,surface('tread',2,6));
    // Low crater-retaining walls embrace a descending approach, with recessed footlights.
    for(const side of [-1,1]){
      const path=grp(group,side*2.02,0,10.50,side*.056);
      box(path,0,.28,0,.60,.57,9.8,hull);box(path,0,.59,0,.65,.057,9.89,skin);
      for(let j=0;j<5;j++)box(path,-side*.31,.34,-4.2+j*2.05,.042,.09,.38,glow());
    }
    return {spawn:[.24,10.2],yaw:-.035,bounds:[-1.42,1.42,5.05,16.76],camera:{height:1.91,distance:3.95,pitch:-.053,fov:52},establishing:{position:[-11.40,5.30,15.80],lookAt:[0,1.05,-.50],fov:43}};
  }
  function saturnExterior(){
    const r=7.23,cz=-1.85;
    for(const y of [.02,.26,2.81,3.02]){
      horizontalBand(group,0,y,cz,r-1.06,r+1.18,surface('exteriorHull',2,2));
      ring(group,0,y,cz,r+1.15,y<1?.12:.16,skin);ring(group,0,y,cz,r-1.02,.12,metal);
    }
    for(const [y,rimR] of [[.07,r+1.24],[.39,r+1.10],[2.66,r+1.1],[3.03,r+1.29]])ring(group,0,y,cz,rimR,.049,edge);
    const num=40;
    for(let i=0;i<num;i++){
      const a=(i+.5)*tau/num;if(Math.min(a,tau-a)<.17)continue;
      const f=grp(group,Math.sin(a)*(r+1.12),0,cz+Math.cos(a)*(r+1.12),a);
      const span=2*(r+1.12)*Math.tan(Math.PI/num);
      const gl=box(f,0,1.52,-.022,span-.04,2.24,.06,skyGlass);gl.renderOrder=1;
      box(f,-span/2,1.56,0,.082,2.42,.11,edge);box(f,0,1.08,.03,span,.052,.07,metal);
      box(f,0,2.47,-.22,span-.13,.045,.14,glow());
      box(f,0,1.45,-1.51,span+.11,2.62,.12,skin);
      if(C.tex('exteriorBay'))facePhoto(f,'exteriorBay',0,1.51,-.39,span+.016,2.31,.012,[(i%4)/4,0,(i%4+1)/4,1]);
      if(i%2===0)framedCover(f,i%20,0,1.52,-1.42,span*.80,1.26);
    }
    for(let i=0;i<3;i++){const a=(i+1/6)*tau/3,g=grp(group,0,0,cz,a);const len=r-1.05;
      box(g,0,.62,len/2,1.0,.48,len,metal);box(g,0,1.31,len/2,1.02,.79,len,skyGlass);box(g,0,1.78,len/2,1.10,.16,len,skin);
      for(let j=0;j<5;j++)box(g,0,1.27,.8+j*1.1,1.10,.89,.067,edge);
    }
    disc(group,0,1.01,cz,2.02,1.75,skin);ring(group,0,1.84,cz,1.93,.11,edge);
    taperedDome(group,0,1.81,cz,1.97,.70,1.97,skin);disc(group,0,2.51,cz,.42,.10,edge);
    frontRoom(cz+r+1.25);approach(cz+r+1.57,18.12,2.94,true);
    return {spawn:[-.14,12.2],yaw:.025,bounds:[-1.33,1.33,cz+r+.84,17.87],camera:{height:2.14,distance:4.38,pitch:-.070,fov:53},establishing:{position:[-10.9,11.6,16.9],lookAt:[0,1.12,-.4],fov:42}};
  }
  function hub(){
    const r=8.02,n=12,half=Math.PI/n,span=2*r*Math.tan(half);
    disc(group,0,-.095,0,r/Math.cos(half)+.13,.19,floor,96);
    for(const rad of [4.95,7.36])horizontalBand(group,0,.008,0,rad-.018,rad+.018,edge);
    horizontalBand(group,0,.011,0,4.972,4.989,glow(moon?'#eadcc3':saturn?'#ffe1a6':'#c2dfed'));
    const height=4.11;
    const inner=moon?3.38:saturn?2.84:2.85;
    // Ring of ceiling and open oculus: visible sky is the scene background; the
    // ring itself has real depth and can be seen from every position in the hall.
    let rimHeight=height;
    if(moon){
      // The excavated ceiling rises continuously from the outer concrete wall
      // to the thick oculus reveal, rather than looking like a flat orbital lid.
      const radial=[r/Math.cos(half)+.17,r-.1,6.9,5.5,4.1,inner+.3,inner];
      const heights=[height-.06,height-.02,4.44,4.79,5.09,5.30,5.33],p=[],uv=[],tri=[];
      for(let j=0;j<radial.length;j++)for(let i=0;i<=80;i++){const a=i/80*tau,rad=radial[j];p.push(rad*Math.sin(a),heights[j],rad*Math.cos(a));uv.push(i/80*4,j/(radial.length-1));}
      for(let j=0;j<radial.length-1;j++)for(let i=0;i<80;i++){const z=j*81+i;tri.push(z,z+1,z+81,z+1,z+82,z+81);}
      const roof=new T.BufferGeometry();roof.setAttribute('position',new T.Float32BufferAttribute(p,3));roof.setAttribute('uv',new T.Float32BufferAttribute(uv,2));roof.setIndex(tri);roof.computeVertexNormals();
      const raw=surface('shell',2,1,'#fff7e7').clone();raw.side=T.DoubleSide;mesh(group,roof,raw);rimHeight=5.33;
    }else{
      const top=horizontalBand(group,0,height,0,inner,r/Math.cos(half)+.22,ceiling);top.material=ceiling.clone();top.material.side=T.DoubleSide;
    }
    for(const [radius,y,thick,m] of [[inner,rimHeight-.085,.13,edge],[inner+.21,rimHeight-.04,.055,metal],[inner+.49,rimHeight-.014,.036,edge],[r-.19,height-.10,.083,edge]])ring(group,0,y,0,radius,thick,m);
    if(!moon)ring(group,0,height-.095,0,inner+.25,.026,glow(saturn?'#f8dcb4':'#d3e5fb'));
    // Five entry openings occupy a shallow fan of the rotunda. Each has a
    // small real anteroom with its own floor, art and warm practical light.
    for(let k=-2;k<10;k++){
      const a=k*tau/n,station=grp(group,r*Math.sin(a),0,-r*Math.cos(a),-a);
      if(k<=2 || k===6){
        const returning=k===6,slot=k+2,absolute=Math.min(19,(C.page||0)*5+slot),cx=returning?0:-.45;
        const pw=returning?1.87:1.76,ph=2.58,opening=moon?.67:saturn?.28:.48;
        // Make the opening part of the wall's silhouette, with no opaque skin
        // behind the door. Thick jambs from both sides remain visible obliquely.
        const wshape=new T.Shape(),l=-span/2,rr=span/2,ox=cx-pw/2,ex=cx+pw/2,o=opening;
        wshape.moveTo(l,0);wshape.lineTo(ox,0);wshape.lineTo(ox,ph-o);wshape.quadraticCurveTo(ox,ph,ox+o,ph);
        wshape.lineTo(ex-o,ph);wshape.quadraticCurveTo(ex,ph,ex,ph-o);wshape.lineTo(ex,0);wshape.lineTo(rr,0);wshape.lineTo(rr,height+.02);wshape.lineTo(l,height+.02);wshape.closePath();
        mesh(station,shapeGeo(wshape,.39,.020,span,height,height/2),skin,0,0,-.37);
        const kind=returning?'back':'room';hatch(station,cx,ph/2,-.095,pw-.06,ph-.025,kind,returning?undefined:slot);
        collisionAt(station,(l+ox)/2,-.16,ox-l,.46);collisionAt(station,(ex+rr)/2,-.16,rr-ex,.46);
        const depth=1.84,bg=surface('shell',1,1,moon?'#d7c5ac':'#dacdb9');
        box(station,cx,.014,-depth/2,pw+.42,.075,depth+.36,floor);
        for(const side of [-1,1])box(station,cx+side*(pw/2+.063),1.43,-depth/2,.15,2.93,depth+.27,bg);
        box(station,cx,2.79,-depth/2,pw+.13,.14,depth+.27,ceiling);
        box(station,cx,1.4,-depth,pw+.26,2.88,.12,bg);
        collisionAt(station,cx,-depth+.04,pw,.16);
        if(!returning){
          if(C.tex('roomView')){
            plane(station,cx,1.41,-depth+.069,pw+.135,2.75,photographed('roomView'));
            const sidewall=grp(station,cx-(pw/2+.002),0,-depth*.51,Math.PI/2);
            framedCover(sidewall,absolute,0,1.43,.01,.64,.82);
          }else framedCover(station,absolute,cx,1.47,-depth+.068,1.19,1.38);
          const poster=framedCover(station,absolute,1.38,1.58,.12,.78,.99);
          targets.push({mesh:poster,kind:'room',index:slot});
          title(station,String(absolute+1).padStart(2,'0'),cx,3.08,.27,.63,.34,saturn?'#ffe3ac':'#514d40');
          title(station,C.rooms[absolute]?.title||'전시실',1.37,.87,.18,.96,.17,saturn?'#fae6c5':'#48473e');
        }else{
          title(station,'승강장으로',cx,3.05,.20,1.37,.27,saturn?'#f2d6aa':'#4a4a42');
          const p=plane(station,cx,1.28,-depth+.063,1.28,2.3,photographed('door'));
          targets.push({mesh:p,kind:'back'});
        }
        lamp(station,cx,2.60,-depth+.10,.85);
        for(const side of [-1,1])box(station,cx+side*(pw/2-.04),.44,-depth*.55,.026,.05,depth*.76,glow());
      }else{
        if(saturn || (!moon && [3,9].includes(k))){
          const iw=span-.40,ih=2.54,cy=1.94;
          box(station,0,(cy-ih*.5)*.5,-.09,span,cy-ih*.5,.31,skin);
          box(station,0,(height+cy+ih/2)/2,-.09,span,height-cy-ih/2,.31,skin);
          rim(station,0,cy,-.13,span,ih+.27,.18,iw,ih,.13,.28,metal,.016);
          const pane=plane(station,0,cy,-.140,iw,ih,skyGlass);pane.renderOrder=1;
          for(const x of [-span*.26,span*.26])box(station,x,cy,0,.047,ih,.17,edge);
          box(station,0,.88,.32,span,.075,.088,edge);
        }else{
          box(station,0,height/2,-.09,span,height,.36,skin);
          if(k%2===0){littleGlazing(station,0,2.12,.11,1.42,.62);lamp(station,0,2.69,.14,.8);}
        }
        collisionAt(station,0,-.01,span,.36);
      }
      // Accent fittings: each station has a foot cove and high mounting rail.
      for(const q of [-1,1]){
        box(station,q*(span*.5-.05),1.9,.045,.075,3.78,.105,moon?skin:edge);
        box(station,q*(span*.44),.12,.102,.39,.045,.08,glow());
      }
      box(station,0,3.76,-.005,span,.13,.22,skin);
    }
    // Low seating kept away from the player spawn and circulation. No mesh is
    // replaced by a flat hall image; seating, bronzed rails and windows parallax.
    if(moon){
      disc(group,2.35,.26,.54,1.48,.50,oakSeat);ring(group,2.35,.49,.54,1.31,.16,oakSeat);
      disc(group,2.35,.54,.54,1.22,.14,oakSeat);
      solids.push({x:2.35,z:.54,w:2.75,d:2.75});
    }else for(const sign of [-1,1]){
      const seat=grp(group,sign*5.93,0,1.08,sign*Math.PI/2);
      rounded(seat,0,.38,0,2.18,.37,.66,.165,oakSeat,.065);
      box(seat,0,.105,.25,1.86,.20,.45,dark);
      rounded(seat,0,.71,-.11,2.18,.56,.22,.17,oakSeat,.056);
      collisionAt(seat,0,.22,2.37,.90);
    }
    return {spawn:moon?[-1.20,2.35]:[-1.55,1.98],yaw:moon?.17:.18,bounds:[-8.13,8.13,-9.49,9.49],
      camera:moon?{height:1.72,pitch:.018,distance:3.92,fov:55}:undefined};
  }
  function ringPromenade(){
    // A traversable segment of Saturn's orbital ring. Gallery portals occupy the
    // inboard side; the entire outer wall faces space through tall segmented glass.
    const cx=-12.1,cz=4.15,ri=12,ro=18.25,delta=.244,n=10,start=-.56,end=start+n*delta,H=3.84;
    const place=(radius,a)=>[cx+radius*Math.cos(a),cz-radius*Math.sin(a)];
    const archAt=(radius,a,inward=false)=>{
      const [x,z]=place(radius,a);return grp(group,x,0,z,(inward?-Math.PI/2:Math.PI/2)+a);
    };
    const top=horizontalBand(group,cx,H,cz,ri-.24,ro+.24,ceiling,start,end);top.material=ceiling.clone();top.material.side=T.DoubleSide;
    horizontalBand(group,cx,.003,cz,ri-.23,ro+.14,surface('floor',3,3),start,end);
    for(const r of [ri+.18,ri+.88,ro-.27])horizontalBand(group,cx,.011,cz,r-.015,r+.015,edge,start,end);
    for(const r of [ri+.17,ri+.53,ro-.18]){
      const pts=[];for(let i=0;i<=40;i++){const [x,z]=place(r,start+(end-start)*i/40);pts.push([x,H-.06,z]);}
      tubeStrip(group,pts,r===ri+.53?.024:.079,r===ri+.53?glow():edge);
    }
    for(let k=0;k<n;k++){
      const a=start+(k+.5)*delta,wall=archAt(ri,a),span=2*ri*Math.tan(delta/2),outer=archAt(ro,a,true),ow=2*ro*Math.tan(delta/2);
      const active=k>=2&&k<=6,returning=k===8;
      if(active||returning){
        const slot=k-2,idx=5*(C.page||0)+slot,pw=1.58,ph=2.55,x=-.29;
        // Distinct deep brass-wrapped piers, independent lintel and an actual
        // walk-in recess let the side of every portal read in the long axial view.
        const l=-span/2,rr=span/2,xl=x-pw/2,xr=x+pw/2;
        box(wall,(l+xl)/2,H/2,-.11,xl-l,H,.38,skin);
        box(wall,(xr+rr)/2,H/2,-.11,rr-xr,H,.38,skin);
        box(wall,x,(H+ph)/2,-.11,pw,H-ph,.38,skin);
        collisionAt(wall,(l+xl)/2,-.12,xl-l,.41);collisionAt(wall,(xr+rr)/2,-.12,rr-xr,.41);
        hatch(wall,x,ph/2,-.118,pw-.035,ph-.035,returning?'back':'room',returning?undefined:slot);
        for(const s of [-1,1]){
          box(wall,x+s*(pw/2+.05),1.34,-.86,.10,2.68,1.7,metal);
          box(wall,x+s*(pw/2+.005),.12,-.86,.028,.043,1.62,glow());
        }
        box(wall,x,.026,-.86,pw+.08,.065,1.78,floor);
        box(wall,x,2.62,-.86,pw+.14,.135,1.78,edge);
        box(wall,x,1.29,-1.72,pw+.14,2.57,.12,skin);
        collisionAt(wall,x,-1.71,pw+.1,.14);
        if(returning){
          const p=plane(wall,x,1.24,-1.648,1.38,2.38,photographed('door'));targets.push({mesh:p,kind:'back'});
          title(wall,'승강장으로',x,3.04,.175,.97,.19,'#ffe7b9');
        }else{
          if(C.tex('roomView')){
            plane(wall,x,1.31,-.67,pw+.07,2.61,photographed('roomView'));
            for(const s of [-1,1]){
              const side=grp(wall,x+s*(pw*.5-.02),0,-.335,-s*Math.PI/2);
              facePhoto(side,'roomView',0,1.31,0,.72,2.61,.007,s===-1?[0,0,.20,1]:[.80,0,1,1]);
            }
          }
          else framedCover(wall,idx,x,1.39,-1.641,.99,1.05);
        const p=framedCover(wall,idx,1.12,1.48,.13,.51,.78);targets.push({mesh:p,kind:'room',index:slot});
          title(wall,String(idx+1).padStart(2,'0'),x,3.03,.232,.43,.26,'#ffe6ad');
          title(wall,C.rooms[idx]?.title||'전시실',1.03,.91,.22,.70,.13,'#ffe6b9');
        }
        lamp(wall,x,2.47,-1.615,.60);
      }else{
        box(wall,0,H/2,-.09,span,H,.34,skin);collisionAt(wall,0,-.1,span,.34);
        for(const s of [-1,1]){box(wall,s*span*.29,1.6,.12,.018,2.51,.046,edge);}
      }
      if(!active&&!returning)box(wall,0,.16,.072,span,.22,.20,metal);
      box(wall,0,3.47,.092,span,.17,.32,metal);
      const iw=ow-.13,ih=3.1,cy=1.96;
      rim(outer,0,cy,-.07,ow,ih+.17,.11,iw,ih,.045,.14,metal,.025);
      const glass=plane(outer,0,cy,-.096,iw,ih,skyGlass);glass.renderOrder=1;
      box(outer,0,.20,0,ow,.4,.24,skin);box(outer,0,H-.13,.005,ow,.27,.29,skin);
      box(outer,0,.85,.14,ow,.08,.083,edge);
      for(const s of [-1,1])box(outer,s*(ow*.5-.045),1.97,0,.072,3.61,.13,edge);
      collisionAt(outer,0,0,ow,.23);
      const [fx,fz]=place((ri+ro)/2,a);const rafter=grp(group,fx,H-.10,fz,Math.PI/2+a);
      box(rafter,0,0,0,.075,.12,ro-ri,metal);
      box(rafter,0,-.061,0,.032,.025,ro-ri-.40,glow());
    }
    for(const a of [start,end]){
      const [xx,zz]=place((ri+ro)/2,a);const endcap=grp(group,xx,0,zz,a);
      box(endcap,0,H/2,0,ro-ri+.32,H,.22,skin);collisionAt(endcap,0,0,ro-ri+.32,.25);
      const side=a===start?-1:1; const facing=grp(endcap,0,0,side*.145,side===1?0:Math.PI);
      facePhoto(facing,'exteriorBay',0,1.92,0,2.82,1.55,.20);lamp(facing,0,2.97,.402);
    }
    const a=.075,[sx,sz]=place(ri+3.15,a);
    return {spawn:[sx,sz],yaw:-.84,bounds:[cx+ro*Math.cos(end)-2.6,cx+ro+.55,cz-ro-.55,cz-ro*Math.sin(start)+.55],
      camera:{height:1.78,distance:3.19,pitch:-.065,fov:57}};
  }
  function stationSky(){
    if(stage==='hub'&&!saturn)return;
    const starfield=!moon&&!saturn?C.tex('starfield'):null,original=starfield||C.tex('sky');if(!original)return;
    const m=original.clone();m.mapping=T.UVMapping;m.needsUpdate=true;
    const geometry=new T.SphereGeometry(175,112,56),pos=geometry.attributes.position,uv=geometry.attributes.uv;
    if(saturn){
      const direction=stage==='hub'?new T.Vector3(.07,.02,-1):new T.Vector3(.85,-.22,-.50);
      direction.normalize();
      const around=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.atan2(-direction.z,direction.x));
      around.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.asin(direction.y)));
      const v=new T.Vector3(),scale=stage==='hub'?.54:.23;
      for(let i=0;i<pos.count;i++){
        uv.setX(i,1-uv.getX(i));v.fromBufferAttribute(pos,i).normalize();
        const x=v.x,k=scale*scale,denom=1+x+k*(1-x);
        v.set((1+x-k*(1-x))/denom,2*scale*v.y/denom,2*scale*v.z/denom).applyQuaternion(around).multiplyScalar(175);
        pos.setXYZ(i,v.x,v.y,v.z);
      }
    }else if(moon){
      const sourceHorizon=.637,realHorizon=.488;
      for(let i=0;i<uv.count;i++){
        const v=uv.getY(i),h=v<realHorizon?v*sourceHorizon/realHorizon:sourceHorizon+(v-realHorizon)*(1-sourceHorizon)/(1-realHorizon);
        uv.setXY(i,1-uv.getX(i),h);
      }
    }else if(starfield&&C.tex('globe')){
      for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));
      const globeMap=C.tex('globe').clone();globeMap.mapping=T.UVMapping;globeMap.needsUpdate=true;
      const world=mesh(group,new T.SphereGeometry(55,96,64),new T.MeshStandardMaterial({map:globeMap,roughness:1,metalness:0,emissive:'#071426'}),57,-80,-46);
      world.rotation.set(.16,1.37,-.20);world.castShadow=false;world.receiveShadow=false;world.raycast=()=>{};
      for(const [r,color,opacity] of [[55.18,'#a5d6f5',1],[55.48,'#6fa8e4',.51],[55.74,'#5a8fdf',.22]]){
        const halo=mesh(group,new T.SphereGeometry(r,80,56),new T.MeshBasicMaterial({color,side:T.BackSide,transparent:true,opacity,depthWrite:false,toneMapped:false}),57,-80,-46);
        halo.raycast=()=>{};halo.renderOrder=-11;
      }
    }else{
      // The Earth panorama is photographed from low orbit, with ocean at nadir
      // and a real horizon all around it. Remap angular distance from that
      // nadir: this keeps the diameter and the fine photographic limb together.
      const nadir=new T.Vector3(0,-1,0),facing=new T.Vector3(.37,-.79,-.50).normalize();
      const rotation=new T.Quaternion().setFromUnitVectors(nadir,facing);
      const v=new T.Vector3(),s=.202,k=s*s;
      for(let i=0;i<pos.count;i++){
        uv.setX(i,1-uv.getX(i));v.fromBufferAttribute(pos,i).normalize();
        const y=-v.y,d=1+y+k*(1-y);
        v.set(2*s*v.x/d,-(1+y-k*(1-y))/d,2*s*v.z/d).applyQuaternion(rotation).multiplyScalar(175);
        pos.setXYZ(i,v.x,v.y,v.z);
      }
    }
    const panorama=mesh(group,geometry,new T.MeshBasicMaterial({map:m,side:T.BackSide,depthWrite:false,toneMapped:false,fog:false}));
    panorama.raycast=()=>{};panorama.renderOrder=-20;
  }
  const result=stage==='hub'?(saturn?ringPromenade():hub()):moon?moonExterior():saturn?saturnExterior():earthExterior();
  stationSky();
  return {...result,solids,targets};
}
