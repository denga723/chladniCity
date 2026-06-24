import "./styles.css";
import { createAudioController } from "./audio.js";
import { createInterface } from "./ui.js";
import { WebGPUChladniRenderer } from "./renderers/webgpuParticles.js";
import { WebGLFallbackRenderer } from "./renderers/webglFallback.js";
import { CityRenderer } from "./renderers/cityMassing.js";

const DEFAULT_FREQUENCY = 1820;
const DEFAULT_PARTICLE_COUNT = 300000;
const DEFAULT_PARTICLE_SPEED = 0.2;
const DEFAULT_PARTICLE_SIZE = 0.02;
const DEFAULT_PARTICLE_OFFSET = 0.03;
const DEFAULT_PARTICLE_BLUR = 0.05;
const FALLBACK_PARTICLE_CAP = 50000;
const WEBGPU_RENDERER = "webgpu";
const WEBGL_RENDERER = "webgl";
const CITY_RENDERER = "city";

const DEFAULT_CITY = {
  grid: 96,
  lotFill: 0.82,
  heightScale: 2.4,
  bandWidth: 0.35,
  baseHeight: 0.06,
  invert: false,
  morphSpeed: 6.0
};

const appState = {
  frequencyHz: DEFAULT_FREQUENCY,
  particleCount: DEFAULT_PARTICLE_COUNT,
  particleSpeed: DEFAULT_PARTICLE_SPEED,
  particleSize: DEFAULT_PARTICLE_SIZE,
  particleOffset: DEFAULT_PARTICLE_OFFSET,
  particleBlur: DEFAULT_PARTICLE_BLUR,
  muted: true,
  rendererMode: "WebGPU",
  isFallback: false,
  view: WEBGPU_RENDERER,
  city: { ...DEFAULT_CITY }
};

const root = document.querySelector("#app");
root.addEventListener("contextmenu", (event) => event.preventDefault());

const audio = createAudioController(appState.frequencyHz);

let activeRenderer = null;
let ui = null;
const rendererParticleCounts = {
  [WEBGPU_RENDERER]: DEFAULT_PARTICLE_COUNT,
  [WEBGL_RENDERER]: FALLBACK_PARTICLE_CAP
};

startApp().catch((error) => {
  console.error(error);
  root.innerHTML = `
    <section class="app-error">
      <div>
        <h1>Unable to start Chladni Cymatics</h1>
        <p>${error instanceof Error ? error.message : "The renderer failed to initialize."}</p>
      </div>
    </section>
  `;
});

async function startApp() {
  ui = createInterface(root, appState, {
    onFrequencyChange: (frequencyHz) => {
      appState.frequencyHz = frequencyHz;
      audio.setFrequency(frequencyHz);
      activeRenderer?.updateFrequency(frequencyHz);
    },
    onParticleCountChange: async (particleCount) => {
      const requestedCount = Number(particleCount);
      const rendererKey = getActiveRendererKey();
      rendererParticleCounts[rendererKey] = clampParticleCountForRenderer(rendererKey, requestedCount);
      const actualCount = await activeRenderer.setParticleCount(rendererParticleCounts[rendererKey]);
      appState.particleCount = actualCount ?? rendererParticleCounts[rendererKey];
      rendererParticleCounts[rendererKey] = appState.particleCount;
      ui.updateParticleCount(appState.particleCount);
      return appState.particleCount;
    },
    onParticleSpeedChange: (particleSpeed) => {
      appState.particleSpeed = particleSpeed;
      activeRenderer?.setParticleSpeed(particleSpeed);
    },
    onParticleSizeChange: (particleSize) => {
      appState.particleSize = particleSize;
      activeRenderer?.setParticleSize(particleSize);
    },
    onParticleOffsetChange: (particleOffset) => {
      appState.particleOffset = particleOffset;
      activeRenderer?.setParticleOffset(particleOffset);
    },
    onParticleBlurChange: (particleBlur) => {
      appState.particleBlur = particleBlur;
      activeRenderer?.setParticleBlur(particleBlur);
    },
    onMutedChange: async (muted) => {
      appState.muted = muted;
      await audio.setMuted(muted);
    },
    onToneRestart: async () => {
      await audio.restartTone();
    },
    onResetParticles: async () => {
      const actualCount = await activeRenderer.resetParticles();
      appState.particleCount = actualCount ?? appState.particleCount;
      rendererParticleCounts[getActiveRendererKey()] = appState.particleCount;
      return appState.particleCount;
    },
    onRendererToggle: async () => {
      const nextRenderer = appState.isFallback ? WEBGPU_RENDERER : WEBGL_RENDERER;
      await switchRenderer(nextRenderer);
    },
    onViewChange: async (mode) => {
      const nextView = normalizeView(mode);
      if (nextView === appState.view) return;
      await switchRenderer(nextView);
    },
    onCityGridChange: (grid) => {
      appState.city.grid = Number(grid);
      activeRenderer?.setGrid?.(appState.city.grid);
    },
    onCityLotFillChange: (lotFill) => {
      appState.city.lotFill = Number(lotFill);
      activeRenderer?.setLotFill?.(appState.city.lotFill);
    },
    onCityHeightChange: (heightScale) => {
      appState.city.heightScale = Number(heightScale);
      activeRenderer?.setHeightScale?.(appState.city.heightScale);
    },
    onCityBandWidthChange: (bandWidth) => {
      appState.city.bandWidth = Number(bandWidth);
      activeRenderer?.setBandWidth?.(appState.city.bandWidth);
    },
    onCityInvertChange: (invert) => {
      appState.city.invert = Boolean(invert);
      activeRenderer?.setInvert?.(appState.city.invert);
    }
  });

  activeRenderer = await createAndInitRenderer(ui.sceneRoot, appState, WEBGPU_RENDERER);
  activeRenderer.updateFrequency(appState.frequencyHz);
  activeRenderer.setParticleSpeed(appState.particleSpeed);
  activeRenderer.setParticleSize(appState.particleSize);
  activeRenderer.setParticleOffset(appState.particleOffset);
  activeRenderer.setParticleBlur(appState.particleBlur);
  ui.updateStatus(appState.rendererMode, appState.isFallback);
  ui.updateParticleCount(appState.particleCount);
  ui.updateParticleSpeed(appState.particleSpeed);
  ui.updateParticleSize(appState.particleSize);
  ui.updateParticleOffset(appState.particleOffset);
  ui.updateParticleBlur(appState.particleBlur);
  ui.updateView?.(appState.view);

  window.chladniApp = {
    state: appState,
    setFrequency(frequencyHz) {
      appState.frequencyHz = frequencyHz;
      ui.updateFrequency(frequencyHz);
      audio.setFrequency(frequencyHz);
      activeRenderer.updateFrequency(frequencyHz);
    },
    async setParticleCount(particleCount) {
      const rendererKey = getActiveRendererKey();
      rendererParticleCounts[rendererKey] = clampParticleCountForRenderer(rendererKey, Number(particleCount));
      const actualCount = await activeRenderer.setParticleCount(rendererParticleCounts[rendererKey]);
      appState.particleCount = actualCount ?? rendererParticleCounts[rendererKey];
      rendererParticleCounts[rendererKey] = appState.particleCount;
      ui.updateParticleCount(appState.particleCount);
    },
    setParticleSpeed(particleSpeed) {
      appState.particleSpeed = Number(particleSpeed);
      ui.updateParticleSpeed(appState.particleSpeed);
      activeRenderer.setParticleSpeed(appState.particleSpeed);
    },
    setParticleSize(particleSize) {
      appState.particleSize = Number(particleSize);
      ui.updateParticleSize(appState.particleSize);
      activeRenderer.setParticleSize(appState.particleSize);
    },
    setParticleOffset(particleOffset) {
      appState.particleOffset = Number(particleOffset);
      ui.updateParticleOffset(appState.particleOffset);
      activeRenderer.setParticleOffset(appState.particleOffset);
    },
    setParticleBlur(particleBlur) {
      appState.particleBlur = Number(particleBlur);
      ui.updateParticleBlur(appState.particleBlur);
      activeRenderer.setParticleBlur(appState.particleBlur);
    },
    async setRendererMode(rendererMode) {
      await switchRenderer(rendererMode === WEBGL_RENDERER ? WEBGL_RENDERER : WEBGPU_RENDERER);
    },
    async setView(mode) {
      const nextView = normalizeView(mode);
      if (nextView === appState.view) return;
      await switchRenderer(nextView);
      ui.updateView?.(appState.view);
    },
    setCityGrid(grid) {
      appState.city.grid = Number(grid);
      ui.updateCityGrid?.(appState.city.grid);
      activeRenderer?.setGrid?.(appState.city.grid);
    },
    setCityLotFill(lotFill) {
      appState.city.lotFill = Number(lotFill);
      ui.updateCityLotFill?.(appState.city.lotFill);
      activeRenderer?.setLotFill?.(appState.city.lotFill);
    },
    setCityHeight(heightScale) {
      appState.city.heightScale = Number(heightScale);
      ui.updateCityHeight?.(appState.city.heightScale);
      activeRenderer?.setHeightScale?.(appState.city.heightScale);
    },
    setCityBandWidth(bandWidth) {
      appState.city.bandWidth = Number(bandWidth);
      ui.updateCityBandWidth?.(appState.city.bandWidth);
      activeRenderer?.setBandWidth?.(appState.city.bandWidth);
    },
    setCityInvert(invert) {
      appState.city.invert = Boolean(invert);
      ui.updateCityInvert?.(appState.city.invert);
      activeRenderer?.setInvert?.(appState.city.invert);
    }
  };
}

function normalizeView(mode) {
  if (mode === WEBGL_RENDERER) return WEBGL_RENDERER;
  if (mode === CITY_RENDERER) return CITY_RENDERER;
  return WEBGPU_RENDERER;
}

async function switchRenderer(rendererMode) {
  if (appState.view !== CITY_RENDERER) {
    rendererParticleCounts[getActiveRendererKey()] = appState.particleCount;
  }
  activeRenderer?.dispose();
  ui.sceneRoot.innerHTML = "";

  activeRenderer = await createAndInitRenderer(ui.sceneRoot, appState, rendererMode);
  activeRenderer.updateFrequency(appState.frequencyHz);
  // Particle setters are no-ops on the City renderer; guard with ?. all the same.
  activeRenderer.setParticleSpeed?.(appState.particleSpeed);
  activeRenderer.setParticleSize?.(appState.particleSize);
  activeRenderer.setParticleOffset?.(appState.particleOffset);
  activeRenderer.setParticleBlur?.(appState.particleBlur);
  ui.updateStatus(appState.rendererMode, appState.isFallback);
  ui.updateParticleCount(appState.particleCount);
  ui.updateView?.(appState.view);
}

async function createAndInitRenderer(container, state, preferredRenderer) {
  if (preferredRenderer === CITY_RENDERER) {
    state.view = CITY_RENDERER;
    state.rendererMode = "City";
    state.isFallback = false;
    const cityRenderer = new CityRenderer(container, state);
    await cityRenderer.init();
    return cityRenderer;
  }

  if (preferredRenderer === WEBGPU_RENDERER && navigator.gpu) {
    try {
      state.rendererMode = "WebGPU";
      state.isFallback = false;
      state.view = WEBGPU_RENDERER;
      state.particleCount = rendererParticleCounts[WEBGPU_RENDERER];
      const renderer = new WebGPUChladniRenderer(container, state);
      await renderer.init();
      return renderer;
    } catch (error) {
      console.warn("WebGPU renderer failed, using WebGL fallback.", error);
      container.innerHTML = "";
    }
  }

  state.rendererMode = "WebGL2";
  state.isFallback = true;
  state.view = WEBGL_RENDERER;
  state.particleCount = rendererParticleCounts[WEBGL_RENDERER];
  const fallbackRenderer = new WebGLFallbackRenderer(container, state);
  await fallbackRenderer.init();
  return fallbackRenderer;
}

function getActiveRendererKey() {
  return appState.isFallback ? WEBGL_RENDERER : WEBGPU_RENDERER;
}

function clampParticleCountForRenderer(rendererKey, particleCount) {
  const count = Number.isFinite(particleCount) ? particleCount : DEFAULT_PARTICLE_COUNT;
  return rendererKey === WEBGL_RENDERER ? Math.min(count, FALLBACK_PARTICLE_CAP) : count;
}
