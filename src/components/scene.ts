import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ---------- Types ----------

export interface SceneAPI {
  setProgress(p: number): void;
  setFinish(id: string): void;
  setPackSize(i: number): void;
  render(): void;
  dispose(): void;
}

// ---------- Constants ----------

const FINISH_COLORS: Record<string, number> = {
  silver: 0xc0c0c0,
  gold: 0xd4a44c,
  black: 0x2d2d2d,
};

const PACK_COUNTS = [100, 250, 1000];
const MAX_INSTANCES = 1000;

const PAPER_COUNT = 5;
const PAPER_WIDTH = 22;
const PAPER_HEIGHT = 30;
const PAPER_THICKNESS = 0.15;
const PAPER_GAP = 0.25;

const FACTS = [
  "Holds up to 50 sheets",
  "Grade 304 stainless steel",
  "Infinitely reusable",
  "100% recyclable",
  "No batteries required",
];

// ---------- Geometry helpers ----------

/** Canvas texture for a paper sheet */
function createPaperTexture(text: string, index: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 700;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle =
    index === 0
      ? "#FFFEF7"
      : `hsl(${40 + index * 3}, ${15 - index * 2}%, ${98 - index}%)`;
  ctx.fillRect(0, 0, 512, 700);

  ctx.strokeStyle = "rgba(0,0,0,0.04)";
  ctx.lineWidth = 1;
  for (let y = 80; y < 700; y += 28) {
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(462, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#1C1917";
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, 256, 380);

  ctx.fillStyle = "#a8a29e";
  ctx.font = "20px sans-serif";
  ctx.fillText(`${index + 1} / ${FACTS.length}`, 256, 650);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Pre-generate random transforms for instances inside the box */
function generateBoxTransforms(count: number, boxW: number, boxH: number, boxD: number): THREE.Matrix4[] {
  const transforms: THREE.Matrix4[] = [];
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const instanceScale = 0.35; // scale each clip inside box

  for (let i = 0; i < count; i++) {
    // Random position within box interior (with some padding)
    const pad = 1.5;
    pos.set(
      (Math.random() - 0.5) * (boxW - pad * 2),
      -boxH / 2 + 0.5 + Math.random() * (boxH - 1.5),
      (Math.random() - 0.5) * (boxD - pad * 2),
    );

    // Random orientation
    euler.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    quat.setFromEuler(euler);

    scale.setScalar(instanceScale);

    const mat4 = new THREE.Matrix4();
    mat4.compose(pos, quat, scale);
    transforms.push(mat4);
  }
  return transforms;
}

// ---------- Lerp helpers ----------

function rangeProgress(p: number, lo: number, hi: number): number {
  return Math.max(0, Math.min(1, (p - lo) / (hi - lo)));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpV3(
  target: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
) {
  target.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// ---------- Scene init ----------

export function initScene(canvas: HTMLCanvasElement): SceneAPI {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  camera.position.set(0, 0, 60);

  // ---- Lighting ----
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(5, 10, 15);
  dirLight.castShadow = true;
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.5);
  rimLight.position.set(-5, -5, -10);
  scene.add(rimLight);

  // ---- Paperclip (loaded from glTF) ----
  // Hero clip — single instance used in phases 1–7
  const clipGroup = new THREE.Group();
  scene.add(clipGroup);

  let clipMaterials: THREE.MeshStandardMaterial[] = [];
  let clipLoaded = false;

  // Instanced clips for box fill — created once glTF geometry is available
  let instancedClips: THREE.InstancedMesh | null = null;
  let instancedMat: THREE.MeshStandardMaterial | null = null;

  const CLIP_SCALE = 1200;

  const boxW = 26,
    boxH = 8,
    boxD = 34;

  // Pre-generate transforms for all 1000 possible instances
  const boxTransforms = generateBoxTransforms(MAX_INSTANCES, boxW, boxH, boxD);

  const loader = new GLTFLoader();
  loader.load("/models/scene.gltf", (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(CLIP_SCALE);

    // Correct orientation
    model.rotation.x = Math.PI / 2;
    model.rotation.y = Math.PI / 2;
    model.rotation.z = 0;

    // Collect materials for recoloring the hero clip
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        const mat = mesh.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              clipMaterials.push(m as THREE.MeshStandardMaterial);
            }
          });
        } else if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          clipMaterials.push(mat as THREE.MeshStandardMaterial);
        }
      }
    });

    clipGroup.add(model);
    clipLoaded = true;

    // ---- Create InstancedMesh from the loaded geometry ----
    // Find the first mesh in the glTF to extract geometry
    let sourceGeo: THREE.BufferGeometry | null = null;
    let sourceMat: THREE.MeshStandardMaterial | null = null;
    model.traverse((child) => {
      if (!sourceGeo && (child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        sourceGeo = mesh.geometry;
        const mat = mesh.material;
        if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          sourceMat = mat as THREE.MeshStandardMaterial;
        }
      }
    });

    if (sourceGeo) {
      // Clone material so instanced clips can be recolored independently if needed
      instancedMat = new THREE.MeshStandardMaterial({
        color: 0xc0c0c0,
        metalness: sourceMat ? sourceMat.metalness : 0.9,
        roughness: sourceMat ? sourceMat.roughness : 0.15,
      });
      if (sourceMat && sourceMat.map) instancedMat.map = sourceMat.map;
      if (sourceMat && sourceMat.metalnessMap) instancedMat.metalnessMap = sourceMat.metalnessMap;
      if (sourceMat && sourceMat.roughnessMap) instancedMat.roughnessMap = sourceMat.roughnessMap;

      instancedClips = new THREE.InstancedMesh(sourceGeo, instancedMat, MAX_INSTANCES);
      instancedClips.count = PACK_COUNTS[currentPackIndex];
      instancedClips.castShadow = true;
      instancedClips.visible = false;

      // Apply the same orientation correction as the hero clip
      // We bake model rotation + scale into each instance matrix
      const modelMatrix = new THREE.Matrix4();
      modelMatrix.makeRotationFromEuler(new THREE.Euler(Math.PI / 2, Math.PI / 2, 0));
      modelMatrix.scale(new THREE.Vector3(CLIP_SCALE, CLIP_SCALE, CLIP_SCALE));

      const composed = new THREE.Matrix4();
      for (let i = 0; i < MAX_INSTANCES; i++) {
        composed.multiplyMatrices(boxTransforms[i], modelMatrix);
        instancedClips.setMatrixAt(i, composed);
      }
      instancedClips.instanceMatrix.needsUpdate = true;

      boxGroup.add(instancedClips);
    }
  });

  // ---- Paper sheets ----
  const papers: THREE.Mesh[] = [];
  const paperMaterials: THREE.MeshStandardMaterial[][] = [];
  const paperTextures: THREE.CanvasTexture[] = [];

  for (let i = 0; i < PAPER_COUNT; i++) {
    const tex = createPaperTexture(FACTS[i], i);
    paperTextures.push(tex);

    const geo = new THREE.BoxGeometry(
      PAPER_WIDTH,
      PAPER_HEIGHT,
      PAPER_THICKNESS,
    );
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0xfefefe }),
      new THREE.MeshStandardMaterial({ color: 0xfefefe }),
      new THREE.MeshStandardMaterial({ color: 0xfefefe }),
      new THREE.MeshStandardMaterial({ color: 0xfefefe }),
      new THREE.MeshStandardMaterial({ map: tex }),
      new THREE.MeshStandardMaterial({ color: 0xfafafa }),
    ];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.visible = false;
    mesh.castShadow = true;
    scene.add(mesh);
    papers.push(mesh);
    paperMaterials.push(mats);
  }

  // ---- Box group ----
  const boxGroup = new THREE.Group();
  boxGroup.visible = false;
  scene.add(boxGroup);

  const boxMat = new THREE.MeshStandardMaterial({
    color: 0x3b3b3b,
    roughness: 0.6,
    metalness: 0.2,
  });

  const bottomGeo = new THREE.BoxGeometry(boxW, 0.5, boxD);
  const bottom = new THREE.Mesh(bottomGeo, boxMat);
  bottom.position.y = -boxH / 2;
  boxGroup.add(bottom);

  const sideGeo = new THREE.BoxGeometry(0.5, boxH, boxD);
  const leftWall = new THREE.Mesh(sideGeo, boxMat);
  leftWall.position.set(-boxW / 2, 0, 0);
  boxGroup.add(leftWall);
  const rightWall = new THREE.Mesh(sideGeo, boxMat);
  rightWall.position.set(boxW / 2, 0, 0);
  boxGroup.add(rightWall);

  const frontBackGeo = new THREE.BoxGeometry(boxW, boxH, 0.5);
  const frontWall = new THREE.Mesh(frontBackGeo, boxMat);
  frontWall.position.set(0, 0, boxD / 2);
  boxGroup.add(frontWall);
  const backWall = new THREE.Mesh(frontBackGeo, boxMat);
  backWall.position.set(0, 0, -boxD / 2);
  boxGroup.add(backWall);

  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, boxH / 2, -boxD / 2);
  boxGroup.add(lidPivot);

  const lidGeo = new THREE.BoxGeometry(boxW + 1, 0.5, boxD + 1);
  const lidMesh = new THREE.Mesh(lidGeo, boxMat);
  lidMesh.position.set(0, 0.25, (boxD + 1) / 2);
  lidPivot.add(lidMesh);

  // ---- State ----
  let progress = 0;
  let currentFinish = "silver";
  let currentPackIndex = 0;

  const clipCenter = new THREE.Vector3(0, 0, 0);
  const clipWithPapers = new THREE.Vector3(0, 5, PAPER_COUNT * PAPER_GAP + 1);
  const clipFloating = new THREE.Vector3(15, 5, 0);
  const clipOnBox = new THREE.Vector3(12, 15, 0);
  const clipFinal = new THREE.Vector3(12, 12, 0);

  const boxStartPos = new THREE.Vector3(0, -40, 0);
  const boxCenterPos = new THREE.Vector3(0, -5, 0);
  const boxFinalPos = new THREE.Vector3(-5, -5, 0);

  // ---- Resize ----
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

  /** Show/hide the instanced clips inside the box */
  function updateInstancedClips(visible: boolean) {
    if (instancedClips) {
      instancedClips.visible = visible;
    }
  }

  // ---- Progress-driven animation ----
  function updateScene() {
    const p = progress;
    const time = Date.now() * 0.001;

    // --- Phase 1: Hero (0–15%) — clip spinning centered ---
    if (p <= 0.15) {
      const t = rangeProgress(p, 0, 0.15);
      clipGroup.visible = true;
      clipGroup.position.copy(clipCenter);
      clipGroup.position.z = lerp(10, 0, smoothstep(t));
      clipGroup.rotation.y = time * 0.5;
      clipGroup.rotation.x = Math.sin(time) * 0.15;
      clipGroup.scale.setScalar(1);

      papers.forEach((pp) => (pp.visible = false));
      boxGroup.visible = false;
      updateInstancedClips(false);
    }

    // --- Phase 2: Papers slide on (15–30%) ---
    else if (p <= 0.3) {
      const t = rangeProgress(p, 0.15, 0.3);
      clipGroup.visible = true;
      lerpV3(clipGroup.position, clipCenter, clipWithPapers, smoothstep(t));
      clipGroup.rotation.y = lerp(clipGroup.rotation.y, 0, 0.1);
      clipGroup.rotation.x = lerp(clipGroup.rotation.x, 0, 0.1);
      clipGroup.rotation.z = 0;

      for (let i = 0; i < PAPER_COUNT; i++) {
        const paperT = rangeProgress(t, i / PAPER_COUNT, (i + 1) / PAPER_COUNT);
        papers[i].visible = paperT > 0;
        if (paperT > 0) {
          const st = smoothstep(Math.min(paperT * 2, 1));
          papers[i].position.set(
            lerp(-40, (Math.random() - 0.5) * 0.3, st),
            lerp(0, (Math.random() - 0.5) * 0.3, st),
            i * PAPER_GAP,
          );
          papers[i].rotation.set(
            0,
            0,
            lerp(-0.3, (Math.random() - 0.5) * 0.02, st),
          );
        }
      }
      boxGroup.visible = false;
      updateInstancedClips(false);
    }

    // --- Phase 3: Papers peel off revealing facts (30–50%) ---
    else if (p <= 0.5) {
      const t = rangeProgress(p, 0.3, 0.5);
      clipGroup.visible = true;
      clipGroup.position.copy(clipWithPapers);

      for (let i = 0; i < PAPER_COUNT; i++) {
        papers[i].visible = true;
        const peelStart = i / PAPER_COUNT;
        const peelT = rangeProgress(t, peelStart, peelStart + 0.4);
        const st = smoothstep(peelT);

        const realIndex = PAPER_COUNT - 1 - i;
        papers[realIndex].position.x = lerp(0, 35, st);
        papers[realIndex].position.z = realIndex * PAPER_GAP;
        papers[realIndex].rotation.z = lerp(0, 0.15, st);
      }
      boxGroup.visible = false;
      updateInstancedClips(false);
    }

    // --- Phase 4: Papers settle, clip floats free (50–65%) ---
    else if (p <= 0.65) {
      const t = rangeProgress(p, 0.5, 0.65);
      const st = smoothstep(t);
      clipGroup.visible = true;
      lerpV3(clipGroup.position, clipWithPapers, clipFloating, st);
      clipGroup.rotation.y = t * Math.PI * 0.5;

      for (let i = 0; i < PAPER_COUNT; i++) {
        papers[i].visible = true;
        papers[i].position.x = lerp(papers[i].position.x, -10, st * 0.3);
        papers[i].position.y = lerp(
          papers[i].position.y,
          -10 + i * 0.3,
          st * 0.3,
        );
        papers[i].position.z = i * PAPER_GAP;
        papers[i].rotation.z = lerp(
          papers[i].rotation.z,
          (i - 2) * 0.04,
          st * 0.3,
        );
      }
      boxGroup.visible = false;
      updateInstancedClips(false);
    }

    // --- Phase 5: Box appears, clips fill in, lid closes (65–80%) ---
    else if (p <= 0.8) {
      const t = rangeProgress(p, 0.65, 0.8);
      const st = smoothstep(t);

      clipGroup.visible = true;
      lerpV3(clipGroup.position, clipFloating, clipOnBox, st);
      clipGroup.rotation.y = Math.PI * 0.5 + t * Math.PI * 0.25;
      clipGroup.rotation.x = Math.sin(time) * 0.05;

      boxGroup.visible = true;
      lerpV3(boxGroup.position, boxStartPos, boxCenterPos, st);

      // Show instanced clips inside box once box is mostly visible
      const clipsVisible = t > 0.3;
      updateInstancedClips(clipsVisible);

      const lidT = rangeProgress(t, 0.6, 1.0);
      lidPivot.rotation.x = lerp(-Math.PI * 0.6, 0, smoothstep(lidT));

      // Fade out paper sheets
      for (let i = 0; i < PAPER_COUNT; i++) {
        const slideT = rangeProgress(t, 0.2, 0.7);
        const sst = smoothstep(slideT);
        papers[i].visible = slideT < 0.9;
        papers[i].position.x = lerp(papers[i].position.x, 0, sst * 0.4);
        papers[i].position.y = lerp(
          papers[i].position.y,
          boxCenterPos.y,
          sst * 0.4,
        );
        papers[i].scale.setScalar(lerp(1, 0.5, sst));
      }
    }

    // --- Phase 6: Product config (80–95%) ---
    else if (p <= 0.95) {
      const t = rangeProgress(p, 0.8, 0.95);
      clipGroup.visible = true;
      clipGroup.position.copy(clipOnBox);
      clipGroup.rotation.y = Math.PI * 0.75 + Math.sin(time * 0.5) * 0.1;
      clipGroup.rotation.x = Math.sin(time * 0.7) * 0.05;

      boxGroup.visible = true;
      lerpV3(boxGroup.position, boxCenterPos, boxFinalPos, smoothstep(t));
      lidPivot.rotation.x = 0;
      updateInstancedClips(true);

      papers.forEach((pp) => (pp.visible = false));
    }

    // --- Phase 7: Final shot (95–100%) ---
    else {
      clipGroup.visible = true;
      clipGroup.position.copy(clipFinal);
      clipGroup.rotation.y = Math.PI * 0.75 + Math.sin(time * 0.3) * 0.08;
      clipGroup.rotation.x = Math.cos(time * 0.4) * 0.04;

      boxGroup.visible = true;
      boxGroup.position.copy(boxFinalPos);
      lidPivot.rotation.x = 0;
      updateInstancedClips(true);

      papers.forEach((pp) => (pp.visible = false));
    }
  }

  function render() {
    updateScene();
    renderer.render(scene, camera);
  }

  // Initial render
  render();

  // ---- API ----
  return {
    setProgress(p: number) {
      progress = Math.max(0, Math.min(1, p));
    },

    setFinish(id: string) {
      if (FINISH_COLORS[id] !== undefined) {
        currentFinish = id;
        // Recolor hero clip materials
        clipMaterials.forEach((mat) => {
          mat.color.setHex(FINISH_COLORS[id]);
        });
        // Recolor instanced clips
        if (instancedMat) {
          instancedMat.color.setHex(FINISH_COLORS[id]);
        }
        boxMat.color.setHex(FINISH_COLORS[id]);
      }
    },

    setPackSize(i: number) {
      currentPackIndex = Math.max(0, Math.min(PACK_COUNTS.length - 1, i));
      // Update instance count to show correct number of clips
      if (instancedClips) {
        instancedClips.count = PACK_COUNTS[currentPackIndex];
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
      if (instancedClips) {
        instancedClips.dispose();
      }
      if (instancedMat) {
        instancedMat.dispose();
      }
      papers.forEach((p, i) => {
        p.geometry.dispose();
        paperMaterials[i].forEach((m) => m.dispose());
      });
      paperTextures.forEach((t) => t.dispose());
      bottomGeo.dispose();
      sideGeo.dispose();
      frontBackGeo.dispose();
      lidGeo.dispose();
      boxMat.dispose();
    },
  };
}
