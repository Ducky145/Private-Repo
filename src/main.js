import * as BABYLON from '@babylonjs/core';

class GameEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.engine = new BABYLON.Engine(canvas, true);
        this.scene = null;
        this.camera = null;
        this.blocks = [];
        this.selectedColor = '#FF6B6B';
        this.gridSize = 1;
        this.maxBlocks = 10000;
        this.blockMaterial = null;
        
        this.init();
    }
    
    init() {
        // Create scene
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color3(0.2, 0.2, 0.25);
        this.scene.collisionsEnabled = true;
        
        // Setup camera
        this.camera = new BABYLON.UniversalCamera('camera', new BABYLON.Vector3(0, 15, -30));
        this.camera.attachControl(this.canvas, true);
        this.camera.speed = 0.3;
        this.camera.angularSensibility = 1000;
        this.camera.checkCollisions = true;
        
        // Lighting
        const light1 = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(1, 1, 0), this.scene);
        light1.intensity = 0.8;
        
        const light2 = new BABYLON.PointLight('light2', new BABYLON.Vector3(-10, 20, -10), this.scene);
        light2.intensity = 0.6;
        light2.range = 100;
        
        // Ground
        const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 200, height: 200 }, this.scene);
        const groundMat = new BABYLON.StandardMaterial('groundMat', this.scene);
        groundMat.diffuse = new BABYLON.Color3(0.3, 0.3, 0.35);
        ground.material = groundMat;
        ground.checkCollisions = true;
        
        // Physics
        this.scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), new BABYLON.CannonJSPlugin());
        
        // Setup input
        this.setupInput();
        
        // Render loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
            this.updateStats();
        });
        
        window.addEventListener('resize', () => this.engine.resize());
    }
    
    setupInput() {
        const keys = {};
        
        window.addEventListener('keydown', (e) => {
            keys[e.key.toLowerCase()] = true;
            
            if (e.key.toLowerCase() === 'r') this.clearAll();
            if (e.key.toLowerCase() === 'p') this.togglePhysics();
        });
        
        window.addEventListener('keyup', (e) => {
            keys[e.key.toLowerCase()] = false;
        });
        
        // Camera movement
        this.engine.onBeforeRenderObservable.add(() => {
            const moveSpeed = 0.5;
            if (keys['w']) this.camera.position.z -= moveSpeed;
            if (keys['s']) this.camera.position.z += moveSpeed;
            if (keys['a']) this.camera.position.x -= moveSpeed;
            if (keys['d']) this.camera.position.x += moveSpeed;
            if (keys[' ']) this.camera.position.y += moveSpeed;
            if (keys['control']) this.camera.position.y -= moveSpeed;
        });
        
        // Mouse click
        this.canvas.addEventListener('click', (e) => {
            if (e.button === 0) this.placeBlock();
            if (e.button === 2) this.removeBlock();
        });
        
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Color picker
        document.querySelectorAll('.colorOption').forEach(option => {
            option.addEventListener('click', (e) => {
                document.querySelectorAll('.colorOption').forEach(o => o.classList.remove('active'));
                e.target.classList.add('active');
                this.selectedColor = e.target.dataset.color;
                document.getElementById('currentColor').style.background = this.selectedColor;
            });
        });
    }
    
    placeBlock() {
        if (this.blocks.length >= this.maxBlocks) return;
        
        const origin = this.camera.position;
        const direction = BABYLON.Vector3.Normalize(
            BABYLON.Vector3.TransformCoordinates(
                new BABYLON.Vector3(0, 0, 1),
                BABYLON.Matrix.RotationYawPitchRoll(this.camera.rotation.y, this.camera.rotation.x, 0)
            )
        );
        
        const hit = this.scene.pickWithRay(new BABYLON.Ray(origin, direction, 100));
        
        if (hit && hit.hit) {
            const hitPoint = hit.hit.getAbsolutePosition();
            const gridPos = new BABYLON.Vector3(
                Math.round(hitPoint.x / this.gridSize) * this.gridSize,
                Math.round(hitPoint.y / this.gridSize) * this.gridSize + 1,
                Math.round(hitPoint.z / this.gridSize) * this.gridSize
            );
            
            this.createBlock(gridPos);
        }
    }
    
    createBlock(position) {
        const block = BABYLON.MeshBuilder.CreateBox('block', { size: this.gridSize }, this.scene);
        block.position = position;
        
        const mat = new BABYLON.StandardMaterial(`mat_${this.blocks.length}`, this.scene);
        mat.diffuse = this.hexToColor3(this.selectedColor);
        mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        block.material = mat;
        
        block.checkCollisions = true;
        
        this.blocks.push(block);
        document.getElementById('blockCount').textContent = this.blocks.length;
    }
    
    removeBlock() {
        const origin = this.camera.position;
        const direction = BABYLON.Vector3.Normalize(
            BABYLON.Vector3.TransformCoordinates(
                new BABYLON.Vector3(0, 0, 1),
                BABYLON.Matrix.RotationYawPitchRoll(this.camera.rotation.y, this.camera.rotation.x, 0)
            )
        );
        
        const hit = this.scene.pickWithRay(new BABYLON.Ray(origin, direction, 100));
        
        if (hit && hit.hit && hit.hit.name.startsWith('block')) {
            const index = this.blocks.indexOf(hit.hit);
            if (index > -1) {
                hit.hit.dispose();
                this.blocks.splice(index, 1);
                document.getElementById('blockCount').textContent = this.blocks.length;
            }
        }
    }
    
    clearAll() {
        this.blocks.forEach(block => block.dispose());
        this.blocks = [];
        document.getElementById('blockCount').textContent = 0;
    }
    
    togglePhysics() {
        if (this.scene.getPhysicsEngine().isEnabled) {
            this.scene.disablePhysicsEngine();
        } else {
            this.scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), new BABYLON.CannonJSPlugin());
        }
    }
    
    hexToColor3(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? new BABYLON.Color3(
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ) : new BABYLON.Color3(1, 1, 1);
    }
    
    updateStats() {
        const fps = this.engine.getFps().toFixed(0);
        document.getElementById('fps').textContent = fps;
    }
}

// Initialize game
window.addEventListener('load', () => {
    const canvas = document.getElementById('renderCanvas');
    new GameEngine(canvas);
});
