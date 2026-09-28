import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createBoard(host, onSquare, onFailure) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.minDistance = 11; controls.maxDistance = 24;
  controls.minPolarAngle = .15; controls.maxPolarAngle = Math.PI / 2.65;
  controls.target.set(0, 0, 0);
  const hemi = new THREE.HemisphereLight(0xf4ffe1, 0x374530, 2.6); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2cf, 3.2); key.position.set(-4, 10, 4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 }); key.shadow.bias = -.001; key.shadow.normalBias = .025; scene.add(key);
  const fill = new THREE.DirectionalLight(0xd4efaf, 2); fill.position.set(5, 5, -7); scene.add(fill);
  const tiles = [], pieces = new THREE.Group(), markers = new THREE.Group(); scene.add(pieces, markers);
  const stone = new THREE.MeshStandardMaterial({ color: 0x263525, roughness: .65, metalness: .22 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x9eac77, roughness: .38, metalness: .55 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeee8cb, roughness: .29, metalness: .13 });
  const black = new THREE.MeshStandardMaterial({ color: 0x33422d, roughness: .26, metalness: .25 });
  function box(w, h, d, material, y) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.y = y; mesh.receiveShadow = true; scene.add(mesh); return mesh; }
  box(8.8, .34, 8.8, stone, -.24); box(8.86, .055, 8.86, trim, -.33); box(8.96, .13, 8.96, stone, -.44);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .24 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.53; ground.receiveShadow = true; scene.add(ground);
  const tileGeometry = new THREE.BoxGeometry(.996, .12, .996);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const material = new THREE.MeshStandardMaterial({ color: (row + col) % 2 ? 0x62764d : 0xc3c9a5, roughness: .62, metalness: .04 });
    const mesh = new THREE.Mesh(tileGeometry, material); mesh.position.set(col - 3.5, -.035, row - 3.5); mesh.receiveShadow = true;
    mesh.userData.square = 'abcdefgh'[col] + (8 - row); mesh.userData.base = material.color.clone(); tiles.push(mesh); scene.add(mesh);
  }
  // Procedural Staunton silhouettes share geometry between all pieces.
  const profiles = {
    p: [[0,0],[.26,0],[.29,.055],[.27,.12],[.19,.17],[.15,.23],[.12,.42],[.18,.48],[.17,.53],[0,.54]],
    r: [[0,0],[.3,0],[.32,.06],[.28,.16],[.21,.2],[.2,.58],[.27,.65],[.28,.81],[0,.81]],
    n: [[0,0],[.3,0],[.31,.07],[.27,.15],[.2,.21],[.17,.34],[0,.36]],
    b: [[0,0],[.3,0],[.32,.06],[.28,.14],[.2,.2],[.13,.6],[.23,.66],[.2,.73],[.12,.76],[0,.78]],
    q: [[0,0],[.32,0],[.34,.07],[.3,.15],[.22,.21],[.14,.7],[.24,.76],[.23,.82],[.17,.85],[.26,1.07],[0,1.07]],
    k: [[0,0],[.33,0],[.35,.07],[.3,.16],[.22,.22],[.15,.75],[.24,.82],[.23,.9],[.16,.93],[.18,1.08],[0,1.08]]
  };
  const geos = Object.fromEntries(Object.entries(profiles).map(([type, points]) => [type, new THREE.LatheGeometry(points.map(([x,y]) => new THREE.Vector2(x,y)), 32)]));
  const sphere = new THREE.SphereGeometry(1, 20, 16);
  const rookTop = new THREE.BoxGeometry(.16, .16, .17);
  const crossV = new THREE.BoxGeometry(.10,.34,.10), crossH = new THREE.BoxGeometry(.30,.095,.10);
  const knightShape = new THREE.Shape();
  knightShape.moveTo(-.22,.3); knightShape.lineTo(-.22,.62); knightShape.lineTo(-.15,.92); knightShape.lineTo(-.09,1.15); knightShape.lineTo(.015,1.05); knightShape.lineTo(.10,1.08); knightShape.lineTo(.16,.91); knightShape.lineTo(.35,.75); knightShape.lineTo(.31,.61); knightShape.lineTo(.07,.65); knightShape.lineTo(.02,.48); knightShape.lineTo(.18,.3); knightShape.closePath();
  const knightGeo = new THREE.ExtrudeGeometry(knightShape, { depth: .22, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .035, bevelThickness: .035 }); knightGeo.translate(0,0,-.11);
  function mesh(geometry, material, parent, x=0,y=0,z=0, scale) { const m = new THREE.Mesh(geometry, material); m.position.set(x,y,z); if(scale) m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  function piece(type, color) {
    const group = new THREE.Group(), material = color === 'w' ? white : black;
    mesh(geos[type], material, group);
    if(type === 'p') mesh(sphere,material,group,0,.67,0,[.19,.19,.19]);
    if(type === 'b') { const head = mesh(sphere,material,group,0,.94,0,[.18,.26,.18]); head.rotation.z = -.18; mesh(sphere,trim,group,0,1.2,0,[.055,.055,.055]); }
    if(type === 'r') for(let i=0;i<6;i++){const angle=i*Math.PI/3;const m=mesh(rookTop,material,group,Math.cos(angle)*.21,.86,Math.sin(angle)*.21);m.rotation.y=-angle;}
    if(type === 'q') { for(let i=0;i<7;i++){const a=i*Math.PI*2/7;mesh(sphere,material,group,Math.cos(a)*.22,1.09,Math.sin(a)*.22,[.065,.085,.065]);} mesh(sphere,trim,group,0,1.15,0,[.085,.10,.085]); }
    if(type === 'k') {mesh(crossV,material,group,0,1.25);mesh(crossH,material,group,0,1.28);}
    if(type === 'n') {mesh(knightGeo,material,group); group.rotation.y = color==='w' ? 0 : Math.PI; mesh(sphere,trim,group,.10,.91,.135,[.027,.027,.014]); mesh(sphere,trim,group,.10,.91,-.135,[.027,.027,.014]);}
    return group;
  }
  function label(text, x,z,rotation=0) {
    const canvas = document.createElement('canvas'); canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#aab68e';ctx.font='28px Segoe UI';ctx.textAlign='center';ctx.fillText(text,32,42);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(.26,.26),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));m.rotation.set(-Math.PI/2,0,rotation);m.position.set(x,-.058,z);scene.add(m);
  }
  for(let i=0;i<8;i++){label('abcdefgh'[i],i-3.5,4.2);label(String(8-i),-4.2,i-3.5);label('abcdefgh'[7-i],3.5-i,-4.2,Math.PI);}
  let requested=false, visible=true, lost=false;
  function render(){requested=false;if(visible&&!lost)renderer.render(scene,camera);}
  function invalidate(){if(!requested){requested=true;requestAnimationFrame(render);}}
  controls.addEventListener('change',invalidate);
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();invalidate();}
  new ResizeObserver(resize).observe(host);
  function reset(flipped=false){const distance=host.clientWidth<500?18.8:16.8;camera.position.set(flipped?-1.3:1.3,distance*.78,flipped?-distance*.75:distance*.75);controls.target.set(0,0,0);controls.update();resize();}
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(); let start;
  renderer.domElement.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>6)return; start=null;
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);
    const hits=ray.intersectObjects([...tiles,...pieces.children],true);
    if(hits.length){let target=hits[0].object;while(target&&!target.userData.square)target=target.parent;if(target)onSquare(target.userData.square);}
  });
  renderer.domElement.addEventListener('webglcontextlost', e=>{e.preventDefault();lost=true;onFailure();});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{lost=false;invalidate();});
  const markerGeo=new THREE.CylinderGeometry(.105,.105,.025,24),markerMat=new THREE.MeshBasicMaterial({color:0xdaf599});
  let previousBoard='';
  function update(game,selected,legal,last){
    const placement=game.fen().split(' ')[0];
    if(placement!==previousBoard){pieces.clear();for(const row of game.board())for(const p of row)if(p){const object=piece(p.type,p.color);object.position.set(p.square.charCodeAt(0)-97-3.5,.03,8-Number(p.square[1])-3.5);object.userData.square=p.square;pieces.add(object);}previousBoard=placement;}
    markers.clear();for(const tile of tiles){tile.material.color.copy(tile.userData.base);const sq=tile.userData.square;if(last&&(last.from===sq||last.to===sq))tile.material.color.lerp(new THREE.Color(0xcce588),.32);if(sq===selected)tile.material.color.setHex(0xc4e885);if(legal.includes(sq)){const dot=new THREE.Mesh(markerGeo,markerMat);dot.position.copy(tile.position);dot.position.y=.065;markers.add(dot);}}
    invalidate();
  }
  document.addEventListener('visibilitychange',()=>{visible=!document.hidden&&!host.hidden;if(visible)invalidate();});
  reset();
  return { update, reset, setVisible(value){visible=value;host.hidden=!value;if(value)resize();} };
}
