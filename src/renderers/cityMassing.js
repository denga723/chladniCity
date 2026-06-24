import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FlyControls } from "three/addons/controls/FlyControls.js";
import { evaluateMixedField } from "../patterns.js";

const PLATE_HALF = 3.15;

const DEFAULT_CITY = {
  grid: 96, // G x G parcels
  lotFill: 0.82, // footprint fraction of a cell (gap = streets)
  heightScale: 2.4,
  bandWidth: 0.35, // nodal corridor width
  baseHeight: 0.06,
  invert: false, // false: tall ON nodal lines; true: tall in blocks
  morphSpeed: 6.0 // height lerp rate
};

export class CityRenderer {
  constructor(container, state) {
    this.container = container;
    this.frequencyHz = state.frequencyHz;

    // City params — seeded from shared state so the UI sliders stay in sync.
    const city = { ...DEFAULT_CITY, ...(state.city ?? {}) };
    this.grid = city.grid;
    this.lotFill = city.lotFill;
    this.heightScale = city.heightScale;
    this.bandWidth = city.bandWidth;
    this.baseHeight = city.baseHeight;
    this.invert = city.invert;
    this.morphSpeed = city.morphSpeed;

    this.mesh = null;
    this.dummy = new THREE.Object3D();
    this.current = null; // Float32Array(grid*grid)
    this.target = null;
    this.lastT = performance.now();
  }

  async init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0b0c);
    this.scene.fog = new THREE.Fog(0x0a0b0c, 8, 22);

    const aspect = this._aspect();
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
    this.camera.position.set(6.5, 6.0, 6.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true // needed so captureFrame() can read the canvas
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.append(this.renderer.domElement);

    this.controlMode = "orbit";
    this._controlsPaused = false;
    this._setControls("orbit");

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 8, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xaecbff, 0.25);
    fill.position.set(-6, 4, -3);
    this.scene.add(fill);

    // faint ground plane (the "site")
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(PLATE_HALF * 2.05, PLATE_HALF * 2.05),
      new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.001;
    this.scene.add(ground);

    this._buildMesh(this.grid);
    this.updateFrequency(this.frequencyHz);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();

    this._loop = () => {
      this._raf = requestAnimationFrame(this._loop);
      this.animate();
    };
    this._loop();
  }

  _aspect() {
    const r = this.container.getBoundingClientRect();
    return Math.max(1, r.width) / Math.max(1, r.height);
  }

  _buildMesh(grid) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    this.grid = grid;
    const count = grid * grid;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // pivot at base so scaling Y grows upward
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.85, metalness: 0.0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.current = new Float32Array(count);
    this.target = new Float32Array(count);
  }

  _hash01(i, j) {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  _smoothstep(e0, e1, x) {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  computeTargetHeights() {
    const G = this.grid;
    for (let j = 0; j < G; j++) {
      const ny = ((j + 0.5) / G) * 2 - 1;
      for (let i = 0; i < G; i++) {
        const nx = ((i + 0.5) / G) * 2 - 1;
        const a = Math.abs(evaluateMixedField(nx, ny, this.frequencyHz)) / 2;
        const core = this.invert
          ? this._smoothstep(0, this.bandWidth, a)
          : 1 - this._smoothstep(0, this.bandWidth, a);
        const h = (this.baseHeight + core * (0.4 + 0.6 * this._hash01(i, j))) * this.heightScale;
        this.target[j * G + i] = h;
      }
    }
  }

  updateFrequency(hz) {
    this.frequencyHz = hz;
    this.computeTargetHeights();
  }

  animate() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const k = Math.min(1, dt * this.morphSpeed);

    const G = this.grid;
    const span = PLATE_HALF * 2;
    const cell = span / G;
    const fp = cell * this.lotFill;

    for (let j = 0; j < G; j++) {
      const z = -PLATE_HALF + (j + 0.5) * cell;
      for (let i = 0; i < G; i++) {
        const idx = j * G + i;
        this.current[idx] += (this.target[idx] - this.current[idx]) * k;
        const h = Math.max(0.0001, this.current[idx]);
        const x = -PLATE_HALF + (i + 0.5) * cell;
        this.dummy.position.set(x, 0, z);
        this.dummy.scale.set(fp, h, fp);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(idx, this.dummy.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    if (!this._controlsPaused) {
      // FlyControls integrates movement over time; OrbitControls takes no arg.
      if (this.controlMode === "fly") this.controls.update(dt);
      else this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }

  _setControls(mode) {
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    this.controlMode = mode;

    if (mode === "fly") {
      const fly = new FlyControls(this.camera, this.renderer.domElement);
      fly.movementSpeed = 4; // world units / second
      fly.rollSpeed = 0.5;
      fly.dragToLook = true; // look only while dragging (no pointer lock — iframe-safe)
      fly.autoForward = false;
      this.controls = fly;
    } else {
      const orbit = new OrbitControls(this.camera, this.renderer.domElement);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.08;
      orbit.target.set(0, 0.4, 0);
      orbit.maxPolarAngle = Math.PI * 0.49; // stay above the ground plane
      orbit.minDistance = 1.5;
      orbit.maxDistance = 30;
      orbit.enablePan = true;
      orbit.screenSpacePanning = false;
      this.controls = orbit;
    }
  }

  setControlMode(mode) {
    const next = mode === "fly" ? "fly" : "orbit";
    if (next === this.controlMode) return;
    this._setControls(next);
  }

  pauseControls() {
    this._controlsPaused = true;
  }

  resumeControls() {
    this._controlsPaused = false;
  }

  // --- City param setters (wired to the UI) ---
  setGrid(g) {
    this._buildMesh(Math.max(16, Math.min(160, g | 0)));
    this.computeTargetHeights();
  }
  setLotFill(v) {
    this.lotFill = Math.min(1, Math.max(0.1, v));
  }
  setHeightScale(v) {
    this.heightScale = Math.max(0.1, v);
    this.computeTargetHeights();
  }
  setBandWidth(v) {
    this.bandWidth = Math.min(1, Math.max(0.02, v));
    this.computeTargetHeights();
  }
  setInvert(b) {
    this.invert = !!b;
    this.computeTargetHeights();
  }

  // Render the current camera view and return a PNG data URL, preserving the
  // on-screen aspect ratio. Used by the AI stylize panel. Restores after.
  captureFrame(maxSize = 1024) {
    const r = this.renderer;
    const prevSize = new THREE.Vector2();
    r.getSize(prevSize);
    const aspect = Math.max(0.0001, prevSize.x) / Math.max(0.0001, prevSize.y);

    let w;
    let h;
    if (aspect >= 1) {
      w = maxSize;
      h = Math.round(maxSize / aspect);
    } else {
      h = maxSize;
      w = Math.round(maxSize * aspect);
    }

    // Camera aspect already matches the container (== w/h), so no distortion.
    r.setSize(w, h, false);
    r.render(this.scene, this.camera);
    const url = r.domElement.toDataURL("image/png");

    // Restore the on-screen size so the next frame is unaffected.
    r.setSize(prevSize.x, prevSize.y, false);
    r.render(this.scene, this.camera);
    return url;
  }

  // --- Particle-renderer lifecycle no-ops (kept so the shared swap logic in
  //     main.js can call the same surface on every renderer) ---
  setParticleSpeed() {}
  setParticleSize() {}
  setParticleOffset() {}
  setParticleBlur() {}
  async setParticleCount() {}
  async resetParticles() {}

  resize() {
    const r = this.container.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height));
    this.camera.aspect = this._aspect();
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
