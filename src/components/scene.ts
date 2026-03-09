import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface SceneAPI {
  setProgress(p: number): void;
  setFinish(id: string): void;
  setPackSize(i: number): void;
  render(): void;
  dispose(): void;
}

const FINISH_COLORS: Record<string, number> = {
  silver: 0xc0c0c0,
  gold: 0xd4a44c,
  black: 0x2d2d2d,
};

const PACK_COUNTS = [100, 200, 400];
const MAX_INSTANCES = 400;
const CLIP_SCALE = 1200;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpV3(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, t: number) {
  out.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function easeOutBounce(t: number) {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}

function generatePileTransforms(count: number): THREE.Matrix4[] {
  const transforms: THREE.Matrix4[] = [];
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.pow(Math.random(), 0.5) * 12;
    pos.set(
      Math.cos(angle) * radius,
      0.5 + Math.random() * 3, // stacked above table
      Math.sin(angle) * radius, // centered at origin
    );
    // Lay flat: base rotation -π/2 on X to counter the model's upright orientation,
    // then small random tilt + free Y spin for variety
    euler.set(
      -Math.PI / 2 + (Math.random() - 0.5) * 0.4,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.4,
    );
    quat.setFromEuler(euler);
    scale.setScalar(0.6 + (Math.random() - 0.5) * 0.1);

    const mat4 = new THREE.Matrix4();
    mat4.compose(pos, quat, scale);
    transforms.push(mat4);
  }
  return transforms;
}

export function initScene(canvas: HTMLCanvasElement): SceneAPI {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
  dirLight.position.set(8, 20, 15);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  const sc = dirLight.shadow.camera;
  sc.near = 1; sc.far = 80; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30;
  scene.add(dirLight);
  const rim = new THREE.DirectionalLight(0x93c5fd, 0.4);
  rim.position.set(-10, 5, -15);
  scene.add(rim);

  // Table
  const tableGeo = new THREE.PlaneGeometry(200, 200);
  const tableMat = new THREE.MeshStandardMaterial({ color: 0xf5f0eb, roughness: 0.85 });
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.rotation.x = -Math.PI / 2;
  table.position.set(0, 0, 0); // centered at origin, seen from above
  table.receiveShadow = true;
  table.visible = false;
  scene.add(table);

  // Hero clip
  const clipGroup = new THREE.Group();
  scene.add(clipGroup);
  let clipMaterials: THREE.MeshStandardMaterial[] = [];

  // Instanced pile
  let instancedClips: THREE.InstancedMesh | null = null;
  let instancedMat: THREE.MeshStandardMaterial | null = null;
  const pileTransforms = generatePileTransforms(MAX_INSTANCES);

  const loader = new GLTFLoader();
  loader.load("/models/scene.gltf", (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(CLIP_SCALE);
    model.rotation.x = Math.PI / 2;
    model.rotation.y = Math.PI / 2;

    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        const mat = mesh.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial)
              clipMaterials.push(m as THREE.MeshStandardMaterial);
          });
        } else if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          clipMaterials.push(mat as THREE.MeshStandardMaterial);
        }
      }
    });
    clipGroup.add(model);

    // Build instanced pile mesh
    let sourceGeo: THREE.BufferGeometry | null = null;
    let sourceMat: THREE.MeshStandardMaterial | null = null;
    model.traverse((child) => {
      if (!sourceGeo && (child as THREE.Mesh).isMesh) {
        sourceGeo = (child as THREE.Mesh).geometry;
        const m = (child as THREE.Mesh).material;
        if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial)
          sourceMat = m as THREE.MeshStandardMaterial;
      }
    });

    if (sourceGeo) {
      instancedMat = new THREE.MeshStandardMaterial({
        color: 0xc0c0c0,
        metalness: sourceMat ? sourceMat.metalness : 0.9,
        roughness: sourceMat ? sourceMat.roughness : 0.15,
        transparent: true,
        opacity: 0,
      });
      if (sourceMat?.map) instancedMat.map = sourceMat.map;
      if (sourceMat?.metalnessMap) instancedMat.metalnessMap = sourceMat.metalnessMap;
      if (sourceMat?.roughnessMap) instancedMat.roughnessMap = sourceMat.roughnessMap;

      instancedClips = new THREE.InstancedMesh(sourceGeo, instancedMat, MAX_INSTANCES);
      instancedClips.count = PACK_COUNTS[currentPackIndex] - 1;
      instancedClips.castShadow = true;
      instancedClips.receiveShadow = true;
      instancedClips.visible = false;

      const modelMatrix = new THREE.Matrix4();
      modelMatrix.makeRotationFromEuler(new THREE.Euler(Math.PI / 2, Math.PI / 2, 0));
      modelMatrix.scale(new THREE.Vector3(CLIP_SCALE, CLIP_SCALE, CLIP_SCALE));

      const composed = new THREE.Matrix4();
      for (let i = 0; i < MAX_INSTANCES; i++) {
        composed.multiplyMatrices(pileTransforms[i], modelMatrix);
        instancedClips.setMatrixAt(i, composed);
      }
      instancedClips.instanceMatrix.needsUpdate = true;
      scene.add(instancedClips);
    }
  });

  // State
  let progress = 0;
  let currentFinish = "silver";
  let currentPackIndex = 0;

  // Key positions
  const camHero = new THREE.Vector3(0, 0, 60);
  const camBirdseye = new THREE.Vector3(0, 70, 0);   // directly above pile center
  const lookHero = new THREE.Vector3(0, 0, 0);
  const lookBirdseye = new THREE.Vector3(0, 0, -2);   // looking straight down
  const clipOnPile = new THREE.Vector3(0, 4, 0);      // lands on top of pile
  const tmpLook = new THREE.Vector3();

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  function updateScene() {
    const p = progress;
    const time = Date.now() * 0.001;

    // PHASE 1: Hero spin (0 – 0.6)
    if (p <= 0.6) {
      const spin = p === 0 ? time * 0.5 : Math.PI * 2 * (p / 0.6);

      camera.position.copy(camHero);
      camera.lookAt(lookHero);

      clipGroup.visible = true;
      clipGroup.position.set(0, 0, 0);
      clipGroup.rotation.set(0, spin, 0);
      clipGroup.scale.setScalar(1);

      table.visible = false;
      if (instancedClips) instancedClips.visible = false;
    }

    // PHASE 2: Camera rises to bird's eye, pile fades in, clip drops onto pile (0.6 – 1.0)
    else {
      table.visible = true;
      if (instancedClips) instancedClips.visible = true;

      const t = clamp01((p - 0.6) / 0.4);
      const st = smoothstep(t);

      // Camera rises from front to bird's eye
      lerpV3(camera.position, camHero, camBirdseye, st);
      lerpV3(tmpLook, lookHero, lookBirdseye, st);
      camera.lookAt(tmpLook);

      // Pile fades in during first half
      const fadeT = clamp01(t / 0.5);
      if (instancedMat) instancedMat.opacity = smoothstep(fadeT);

      // Hero clip: shrink + lay flat + drop onto pile
      clipGroup.visible = true;
      const heroScale = lerp(1, 0.55, st);
      clipGroup.scale.setScalar(heroScale);

      if (t < 0.6) {
        // Falling phase: move to pile, rotate to lay flat
        const fallT = easeOutBounce(clamp01(t / 0.6));
        clipGroup.position.set(
          lerp(0, clipOnPile.x, fallT),
          lerp(0, clipOnPile.y, fallT),
          lerp(0, clipOnPile.z, fallT),
        );
        clipGroup.rotation.x = lerp(0, -Math.PI / 2, smoothstep(fallT));
        clipGroup.rotation.y = lerp(Math.PI * 2, Math.PI * 0.3, fallT);
        clipGroup.rotation.z = lerp(0, 0.15, fallT);
      } else {
        // Settled on pile
        clipGroup.position.copy(clipOnPile);
        clipGroup.rotation.set(-Math.PI / 2, Math.PI * 0.3, 0.15);
      }
    }
  }

  function render() {
    updateScene();
    renderer.render(scene, camera);
  }

  render();

  return {
    setProgress(p: number) { progress = clamp01(p); },

    setFinish(id: string) {
      if (FINISH_COLORS[id] !== undefined) {
        currentFinish = id;
        clipMaterials.forEach((mat) => mat.color.setHex(FINISH_COLORS[id]));
        if (instancedMat) instancedMat.color.setHex(FINISH_COLORS[id]);
      }
    },

    setPackSize(i: number) {
      currentPackIndex = Math.max(0, Math.min(PACK_COUNTS.length - 1, i));
      if (instancedClips) {
        instancedClips.count = Math.max(1, PACK_COUNTS[currentPackIndex] - 1);
      }
    },

    render,

    dispose() {
      window.removeEventListener("resize", resize);
      renderer.dispose();
      clipGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      if (instancedClips) instancedClips.dispose();
      if (instancedMat) instancedMat.dispose();
      tableGeo.dispose();
      tableMat.dispose();
    },
  };
}
