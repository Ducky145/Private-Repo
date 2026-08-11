<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Mini Block City (Browser)</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    html,body { height:100%; margin:0; overflow:hidden; background:#87CEEB; font-family: Arial, Helvetica, sans-serif; }
    #overlay {
      position:absolute; left:8px; top:8px; background: rgba(255,255,255,0.9); color:#111; padding:8px; border-radius:6px;
      font-size:13px; z-index:5;
    }
    #hotbar { position:absolute; left:50%; transform:translateX(-50%); bottom:12px; display:flex; gap:8px; z-index:5; }
    .slot { width:64px; height:64px; background:rgba(255,255,255,0.85); border:2px solid rgba(0,0,0,0.25); display:flex; align-items:center; justify-content:center; font-weight:700; cursor:pointer; }
    .sel { border-color:gold; box-shadow:0 0 12px rgba(255,200,0,0.6); }
    #msg { position:absolute; right:10px; top:10px; background:rgba(0,0,0,0.4); color:#fff; padding:8px; border-radius:6px; font-size:13px; z-index:5; }
    #canvasContainer { width:100%; height:100%; }
  </style>
</head>
<body>
  <div id="overlay">Click the view to lock mouse. WASD + mouse to move. Space jump. Left-click break, Right-click place. Keys 1–5 choose block.</div>
  <div id="msg">Mini Block City</div>
  <div id="hotbar"></div>
  <div id="canvasContainer"></div>

  <!-- Three.js and pointer lock controls -->
  <script src="https://cdn.jsdelivr.net/npm/three@0.154.0/build/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.154.0/examples/js/controls/PointerLockControls.js"></script>

  <script>
  // Basic settings
  const WORLD_W = 24; // x-size
  const WORLD_D = 24; // z-size
  const WORLD_H = 10; // y-size
  const BLOCK_SIZE = 1;
  const REACH = 6;

  // Block palette
  const PALETTE = [
    {id:0, name:'Air', color:null},
    {id:1, name:'Asphalt', color:0x2b2b2b},
    {id:2, name:'Concrete', color:0x9e9e9e},
    {id:3, name:'Brick', color:0xb24a3a},
    {id:4, name:'Glass', color:0x7ed1ff, opacity:0.6},
    {id:5, name:'Grass', color:0x3caf2f}
  ];
  const HOTBAR = [1,2,3,4,5];

  // Scene
  const container = document.getElementById('canvasContainer');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 500);
  camera.position.set(WORLD_W/2, 6, WORLD_D+6);

  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(50,80,20);
  scene.add(sun);

  // Controls
  const controls = new THREE.PointerLockControls(camera, renderer.domElement);
  document.addEventListener('click', () => { if(!controls.isLocked) controls.lock(); });
  scene.add(controls.getObject());

  // Simple player physics
  const player = { vx:0, vy:0, onGround:false, speed:6, height:1.8 };

  // World data: 3D array
  const world = new Uint8Array(WORLD_W * WORLD_H * WORLD_D);
  function idx(x,y,z){ return y*WORLD_W*WORLD_D + z*WORLD_W + x; }

  // Create a simple city: roads and buildings
  function generateCity(seed){
    // clear
    world.fill(0);
    // grid roads every 6 blocks
    const ROAD_SP = 6;
    for(let z=0; z<WORLD_D; z++){
      for(let x=0; x<WORLD_W; x++){
        const gx = x, gz = z;
        if(gx % ROAD_SP === 0 || gz % ROAD_SP === 0){
          world[idx(x,0,z)] = 1; // asphalt
          // sidewalks
          [[1,0],[ -1,0 ], [0,1],[0,-1]].forEach(o=>{
            const sx = x+o[0], sz = z+o[1];
            if(sx>=0 && sx<WORLD_W && sz>=0 && sz<WORLD_D && world[idx(sx,0,sz)]===0){
              world[idx(sx,0,sz)] = 2; // concrete
            }
          });
        } else {
          // small chance of park grass
          if(Math.random() < 0.03) world[idx(x,0,z)] = 5;
        }
      }
    }
    // place buildings in lots between roads
    for(let lotZ=0; lotZ<WORLD_D; lotZ+=ROAD_SP){
      for(let lotX=0; lotX<WORLD_W; lotX+=ROAD_SP){
        // skip some lots
        if(Math.random() < 0.15) continue;
        const sx = lotX+1 + Math.floor(Math.random()*(ROAD_SP-3));
        const sz = lotZ+1 + Math.floor(Math.random()*(ROAD_SP-3));
        const bw = 1 + Math.floor(Math.random()*(Math.max(1,ROAD_SP-3)));
        const bd = 1 + Math.floor(Math.random()*(Math.max(1,ROAD_SP-3)));
        const height = 2 + Math.floor(Math.random()*6);
        const matType = (Math.random()<0.5)?3:2;
        for(let z=sz; z<Math.min(WORLD_D, sz+bd); z++){
          for(let x=sx; x<Math.min(WORLD_W, sx+bw); x++){
            for(let y=1; y<=height; y++){
              // top occasional glass windows
              if(y === Math.floor(height/2) && Math.random()<0.25) world[idx(x,y,z)] = 4;
              else world[idx(x,y,z)] = matType;
            }
          }
        }
      }
    }
  }

  generateCity();

  // Create meshes: keep a map of meshes per block position for simplicity (small world)
  const blockGroup = new THREE.Group();
  scene.add(blockGroup);
  const cubeGeo = new THREE.BoxGeometry(BLOCK_SIZE,BLOCK_SIZE,BLOCK_SIZE);

  function buildWorldMeshes(){
    // remove previous
    while(blockGroup.children.length) {
      const c = blockGroup.children.pop();
      c.geometry.dispose();
      if(c.material.map) c.material.map.dispose();
      c.material.dispose();
    }
    // add meshes
    for(let y=0;y<WORLD_H;y++){
      for(let z=0; z<WORLD_D; z++){
        for(let x=0; x<WORLD_W; x++){
          const b = world[idx(x,y,z)];
          if(b === 0) continue;
          const info = PALETTE.find(p=>p.id===b);
          const matOpts = {color: info.color || 0xffffff};
          if(info.opacity) matOpts.transparent = true, matOpts.opacity = info.opacity;
          const mat = new THREE.MeshStandardMaterial(matOpts);
          const m = new THREE.Mesh(cubeGeo, mat);
          m.position.set(x*BLOCK_SIZE + BLOCK_SIZE/2, y*BLOCK_SIZE + BLOCK_SIZE/2, z*BLOCK_SIZE + BLOCK_SIZE/2);
          m.userData = {x,y,z, id:b};
          blockGroup.add(m);
        }
      }
    }
  }
  buildWorldMeshes();

  // Ground plane for fallback
  const groundMat = new THREE.MeshBasicMaterial({visible:false});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500,500), groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -1;
  scene.add(ground);

  // Raycaster
  const ray = new THREE.Raycaster();

  // Hotbar UI
  const hotbar = document.getElementById('hotbar');
  let selected = 0;
  function buildHotbar(){
    hotbar.innerHTML = '';
    for(let i=0;i<HOTBAR.length;i++){
      const id = HOTBAR[i];
      const info = PALETTE.find(p=>p.id===id);
      const div = document.createElement('div');
      div.className = 'slot' + (i===selected ? ' sel' : '');
      div.innerHTML = `<div style="text-align:center">${i+1}<br>${info.name}</div>`;
      div.onclick = ()=>{ selected = i; updateHotbar(); };
      hotbar.appendChild(div);
    }
  }
  function updateHotbar(){
    Array.from(hotbar.children).forEach((c,idx)=> c.className = 'slot' + (idx===selected ? ' sel' : ''));
  }
  buildHotbar();

  // Interaction functions
  function getLookRay(){
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    ray.set(origin, dir);
    return ray;
  }

  function pickBlock(){
    const r = getLookRay();
    const hits = r.intersectObjects(blockGroup.children, false);
    if(hits.length) return hits[0]; // contains object, point, face, distance, instanceId
    return null;
  }

  function breakBlock(){
    const hit = pickBlock();
    if(!hit) return;
    const obj = hit.object;
    const {x,y,z} = obj.userData;
    world[idx(x,y,z)] = 0;
    buildWorldMeshes();
  }

  function placeBlock(){
    const hit = pickBlock();
    if(!hit) return;
    // compute face normal to add adjacent
    const faceIndex = hit.faceIndex;
    const triFace = Math.floor(faceIndex / 2) % 6;
    const normals = [
      new THREE.Vector3(1,0,0), new THREE.Vector3(-1,0,0),
      new THREE.Vector3(0,1,0), new THREE.Vector3(0,-1,0),
      new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,-1)
    ];
    const n = normals[triFace];
    const tx = hit.object.userData.x + n.x;
    const ty = hit.object.userData.y + n.y;
    const tz = hit.object.userData.z + n.z;
    if(tx < 0 || tx >= WORLD_W || tz < 0 || tz >= WORLD_D || ty < 0 || ty >= WORLD_H) return;
    if(world[idx(tx,ty,tz)] !== 0) return;
    world[idx(tx,ty,tz)] = HOTBAR[selected];
    buildWorldMeshes();
  }

  // Mouse listeners
  renderer.domElement.addEventListener('pointerdown', (e)=>{
    if(!controls.isLocked) return;
    if(e.button === 0) breakBlock();
    else if(e.button === 2) placeBlock();
  });
  // disable context menu
  window.addEventListener('contextmenu', e=>e.preventDefault());

  // Keyboard input
  const keys = {};
  window.addEventListener('keydown', e=>{
    keys[e.code] = true;
    // hotbar 1-5
    if(e.code.startsWith('Digit')){
      const d = parseInt(e.code.slice(5));
      if(!isNaN(d) && d>=1 && d<=HOTBAR.length){ selected = d-1; updateHotbar(); }
    }
  });
  window.addEventListener('keyup', e=> keys[e.code] = false);

  // Simple collision: check the block below player's feet
  function playerGroundCheck(pos){
    // sample a bit below player's feet
    const px = Math.floor(pos.x / BLOCK_SIZE);
    const pz = Math.floor(pos.z / BLOCK_SIZE);
    const py = Math.floor((pos.y - player.height/2) / BLOCK_SIZE);
    if(px < 0 || px >= WORLD_W || pz < 0 || pz >= WORLD_D || py < 0) return false;
    // if any block at py or below, treat as ground
    for(let y = py; y >= 0; y--){
      if(world[idx(px,y,pz)] !== 0) return y;
    }
    return -1;
  }

  // Resize
  window.addEventListener('resize', onResize);
  function onResize(){
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
  }

  // Game loop
  let prev = performance.now();
  function animate(){
    const now = performance.now();
    const dt = Math.min(0.05, (now - prev)/1000);
    prev = now;

    // movement
    const move = new THREE.Vector3();
    const forward = (keys['KeyW']?1:0) - (keys['KeyS']?1:0);
    const strafe  = (keys['KeyD']?1:0) - (keys['KeyA']?1:0);
    if(forward || strafe){
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0; dir.normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
      move.add(dir.multiplyScalar(forward));
      move.add(right.multiplyScalar(strafe));
      if(move.length() > 0) move.normalize();
      move.multiplyScalar(player.speed * dt);
      controls.getObject().position.add(move);
    }

    // gravity
    player.vy -= 9.8 * dt;
    controls.getObject().position.y += player.vy * dt;

    // ground collision
    const groundY = playerGroundCheck(controls.getObject().position);
    if(groundY >= 0){
      const targetY = (groundY+1)*BLOCK_SIZE + player.height/2;
      if(controls.getObject().position.y <= targetY){
        controls.getObject().position.y = targetY;
        player.vy = 0;
        player.onGround = true;
      } else {
        player.onGround = false;
      }
    } else {
      player.onGround = false;
      if(controls.getObject().position.y < -10){
        // respawn
        controls.getObject().position.set(WORLD_W/2, 6, WORLD_D+6);
        player.vy = 0;
      }
    }

    // jump
    if(keys['Space'] && player.onGround){
      player.vy = 6;
      player.onGround = false;
    }

    // small day-night color shift
    const t = (now*0.00005) % 1;
    scene.background = new THREE.Color(0x87CEEB).lerp(new THREE.Color(0x071029), 1 - Math.abs(Math.sin(t*Math.PI*2))*0.7);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  // initial camera placement above the world
  controls.getObject().position.set(WORLD_W/2, 6, WORLD_D+6);

  // build initial scene and start loop
  buildWorldMeshes();
  animate();

  // Small helper: position camera over world on double click
  window.addEventListener('dblclick', ()=>{
    controls.getObject().position.set(WORLD_W/2, 6, WORLD_D+6);
  });

  // prevent UI selection interference
  renderer.domElement.style.touchAction = 'none';

  </script>
</body>
</html>
