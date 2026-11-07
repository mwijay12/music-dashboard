import * as THREE from "./vendor/three.module.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

const CITIES = [
  { name: "London", lat: 51.5, lon: -0.1 },
  { name: "Berlin", lat: 52.5, lon: 13.4 },
  { name: "Tokyo", lat: 35.7, lon: 139.7 },
  { name: "Los Angeles", lat: 34.0, lon: -118.2 },
  { name: "Sao Paulo", lat: -23.5, lon: -46.6 },
  { name: "New York", lat: 40.7, lon: -74.0 },
  { name: "Paris", lat: 48.9, lon: 2.35 },
  { name: "Sydney", lat: -33.9, lon: 151.2 },
];

const ARCS = [
  [0, 5],
  [2, 3],
  [1, 4],
  [0, 2],
  [5, 4],
];

const scenes = [];
let pointerX = 0;
let pointerY = 0;
let pointerActive = false;
let reduced = REDUCED.matches;
let started = false;

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,170,120,0.85)");
  grad.addColorStop(0.35, "rgba(240,120,70,0.32)");
  grad.addColorStop(1, "rgba(220,90,40,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const GLOW_TEXTURE = makeGlowTexture();

function baseRenderer(container) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);
  return renderer;
}

function orbShaderMaterial(colorA, colorB) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uAmp: { value: 0.16 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uAmp;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vNoise;

      void main() {
        vec3 p = position;
        float n = sin(p.x * 3.1 + uTime * 0.7) * sin(p.y * 3.6 - uTime * 0.55) * sin(p.z * 2.9 + uTime * 0.45);
        n += 0.34 * sin(p.x * 6.2 - uTime * 0.4) * sin(p.z * 5.1 + uTime * 0.32);
        vNoise = n;
        p += normal * n * uAmp;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vNoise;

      void main() {
        float fresnel = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.1);
        float mixv = clamp(vNoise * 0.5 + 0.5, 0.0, 1.0);
        vec3 color = mix(uColorB, uColorA, mixv);
        color += fresnel * uColorA * 0.9;
        color = mix(color, vec3(1.0, 0.9, 0.8), fresnel * 0.18);
        gl_FragColor = vec4(color, 0.94);
      }
    `,
  });
}

function createOrb(container) {
  const dark = container.closest(".on-repeat") !== null;
  const colorA = dark ? "#ff9d63" : "#e06a3c";
  const colorB = dark ? "#a8321a" : "#8c2f14";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
  camera.position.set(0, 0, 3.35);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.IcosahedronGeometry(1, 24);
  const material = orbShaderMaterial(colorA, colorB);
  const sphere = new THREE.Mesh(geometry, material);
  group.add(sphere);

  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.012, 3)),
    new THREE.LineBasicMaterial({
      color: new THREE.Color(colorA),
      transparent: true,
      opacity: dark ? 0.12 : 0.16,
    })
  );
  group.add(wire);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: GLOW_TEXTURE,
      color: new THREE.Color(colorA),
      transparent: true,
      opacity: dark ? 0.85 : 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glow.scale.set(3.4, 3.4, 1);
  glow.position.z = -0.6;
  scene.add(glow);

  const count = 260;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 1.35 + Math.random() * 0.85;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({
      color: new THREE.Color(colorA),
      size: 0.014,
      transparent: true,
      opacity: dark ? 0.7 : 0.45,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(particles);

  const renderer = baseRenderer(container);
  const state = {
    type: "orb",
    container,
    scene,
    camera,
    renderer,
    group,
    material,
    paused: false,
    time: Math.random() * 10,
    resize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    },
    update(dt, t) {
      if (!state.paused) state.time += dt;
      const time = state.time;
      material.uniforms.uTime.value = time;
      group.rotation.y += reduced ? 0 : dt * 0.22;
      group.rotation.x = Math.sin(time * 0.32) * 0.12 + pointerY * 0.12;
      group.rotation.z = Math.cos(time * 0.24) * 0.05;
      group.position.x = pointerX * 0.08;
      group.position.y = -pointerY * 0.06;
      particles.rotation.y -= reduced ? 0 : dt * 0.05;
      wire.rotation.y -= reduced ? 0 : dt * 0.08;
    },
  };
  state.resize();
  container.classList.add("is-ready");
  scenes.push(state);
  return state;
}

const CONTINENTS = [
  { lat: 48, lon: -100, latR: 26, lonR: 34 },
  { lat: 72, lon: -42, latR: 10, lonR: 16 },
  { lat: -12, lon: -60, latR: 24, lonR: 18 },
  { lat: 50, lon: 14, latR: 14, lonR: 22 },
  { lat: 4, lon: 20, latR: 30, lonR: 22 },
  { lat: 48, lon: 85, latR: 28, lonR: 52 },
  { lat: 16, lon: 102, latR: 14, lonR: 18 },
  { lat: -25, lon: 134, latR: 13, lonR: 22 },
];

function landMask(lat, lon) {
  for (const c of CONTINENTS) {
    const dLat = (lat - c.lat) / c.latR;
    const rawLon = Math.abs(((lon - c.lon + 540) % 360) - 180);
    const dLon = rawLon / c.lonR;
    const wobble =
      Math.sin(lat * 0.21 + lon * 0.13) * 0.14 +
      Math.cos(lat * 0.09 - lon * 0.11) * 0.12;
    if (dLat * dLat + dLon * dLon < 1 + wobble) return true;
  }
  return false;
}

function latLonToVec3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createGlobe(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
  camera.position.set(0, 0, 3.35);

  const group = new THREE.Group();
  group.rotation.z = -0.14;
  scene.add(group);

  const oceanPositions = [];
  const landPositions = [];
  const latStep = 5;
  const lonStep = 5;
  for (let lat = -85; lat <= 85; lat += latStep) {
    const circumference = Math.cos((lat * Math.PI) / 180);
    const count = Math.max(6, Math.round((360 / lonStep) * circumference));
    for (let i = 0; i < count; i += 1) {
      const lon = (i / count) * 360 - 180;
      const v = latLonToVec3(lat, lon, 1);
      if (landMask(lat, lon)) landPositions.push(v.x, v.y, v.z);
      else oceanPositions.push(v.x, v.y, v.z);
    }
  }

  const base = new THREE.Mesh(
    new THREE.SphereGeometry(0.995, 64, 64),
    new THREE.MeshBasicMaterial({ color: new THREE.Color("#1b100c") })
  );
  group.add(base);

  const oceanGeo = new THREE.BufferGeometry();
  oceanGeo.setAttribute("position", new THREE.Float32BufferAttribute(oceanPositions, 3));
  const ocean = new THREE.Points(
    oceanGeo,
    new THREE.PointsMaterial({
      color: new THREE.Color("#8c6a54"),
      size: 0.009,
      transparent: true,
      opacity: 0.28,
      sizeAttenuation: true,
      depthWrite: false,
    })
  );
  group.add(ocean);

  const dotsGeo = new THREE.BufferGeometry();
  dotsGeo.setAttribute("position", new THREE.Float32BufferAttribute(landPositions, 3));
  const dots = new THREE.Points(
    dotsGeo,
    new THREE.PointsMaterial({
      color: new THREE.Color("#f1dfc8"),
      size: 0.022,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      depthWrite: false,
    })
  );
  group.add(dots);

  const markerPositions = [];
  CITIES.forEach((city) => {
    const v = latLonToVec3(city.lat, city.lon, 1.008);
    markerPositions.push(v.x, v.y, v.z);
  });
  const markerGeo = new THREE.BufferGeometry();
  markerGeo.setAttribute("position", new THREE.Float32BufferAttribute(markerPositions, 3));
  const markers = new THREE.Points(
    markerGeo,
    new THREE.PointsMaterial({
      color: new THREE.Color("#ffb07c"),
      size: 0.06,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(markers);

  ARCS.forEach(([from, to]) => {
    const a = latLonToVec3(CITIES[from].lat, CITIES[from].lon, 1.004);
    const b = latLonToVec3(CITIES[to].lat, CITIES[to].lon, 1.004);
    const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(1.38);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const points = curve.getPoints(48);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: new THREE.Color("#ffb07c"),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    group.add(line);
  });

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.12, 64, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color("#ff8a4d") } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float intensity = pow(0.58 - dot(vNormal, vView), 3.2);
          gl_FragColor = vec4(uColor, 1.0) * clamp(intensity, 0.0, 1.0);
        }
      `,
    })
  );
  group.add(atmosphere);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: GLOW_TEXTURE,
      color: new THREE.Color("#ff8a4d"),
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glow.scale.set(3.2, 3.2, 1);
  glow.position.z = -0.8;
  scene.add(glow);

  const renderer = baseRenderer(container);
  const state = {
    type: "globe",
    container,
    scene,
    camera,
    renderer,
    group,
    markers,
    time: 0,
    resize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    },
    update(dt, t) {
      if (!reduced) state.time += dt;
      group.rotation.y += reduced ? 0 : dt * 0.075;
      group.rotation.x = pointerY * 0.1;
      group.rotation.z = -0.14 + pointerX * 0.04;
      const pulse = 1 + Math.sin(t * 2.4) * 0.18;
      markers.material.size = 0.06 * pulse;
      markers.material.opacity = 0.8 + Math.sin(t * 2.4) * 0.15;
    },
  };
  state.resize();
  container.classList.add("is-ready");
  scenes.push(state);
  return state;
}

function initScenes() {
  if (started) return;
  started = true;
  if (!hasWebGL()) {
    document.querySelectorAll("[data-orb], [data-globe]").forEach((el) => {
      el.classList.add("is-fallback");
    });
    return;
  }

  document.querySelectorAll("[data-orb]").forEach((container) => {
    try {
      createOrb(container);
    } catch (error) {
      console.warn("Timbre: orb scene unavailable", error);
      container.classList.add("is-fallback");
    }
  });

  document.querySelectorAll("[data-globe]").forEach((container) => {
    try {
      createGlobe(container);
    } catch (error) {
      console.warn("Timbre: globe scene unavailable", error);
      container.classList.add("is-fallback");
    }
  });

  const resizeAll = () => scenes.forEach((scene) => scene.resize());
  window.addEventListener("resize", resizeAll, { passive: true });

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => resizeAll());
    scenes.forEach((scene) => observer.observe(scene.container));
  }

  window.addEventListener(
    "pointermove",
    (event) => {
      pointerActive = true;
      pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      pointerY = (event.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true }
  );

  REDUCED.addEventListener("change", (event) => {
    reduced = event.matches;
  });

  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    if (document.visibilityState === "visible") {
      for (const scene of scenes) {
        const el = scene.container;
        const rect = el.getBoundingClientRect();
        const visible =
          el.offsetParent !== null &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > -80 &&
          rect.top < window.innerHeight + 80;
        if (!visible) continue;
        if (scene.camera.aspect === 1 && rect.width && rect.height) {
          scene.resize();
        }
        scene.update(dt, t);
        scene.renderer.render(scene.scene, scene.camera);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function setOrbPaused(paused) {
  scenes.forEach((scene) => {
    if (scene.type === "orb") scene.paused = Boolean(paused);
  });
}

function setReducedMotion(value) {
  reduced = Boolean(value);
}

function resizeScenes() {
  scenes.forEach((scene) => scene.resize());
}

export { initScenes, setOrbPaused, setReducedMotion, resizeScenes, hasWebGL };
