import { MAX_FREQUENCY, MIN_FREQUENCY, PATTERN_MODES } from "./patterns.js";

const MIN_PARTICLES = 5000;
const WEBGPU_MAX_PARTICLES = 500000;
const WEBGL_MAX_PARTICLES = 50000;
const MIN_PARTICLE_SPEED = 0.1;
const MAX_PARTICLE_SPEED = 3;
const MIN_PARTICLE_SIZE = 0.004;
const MAX_PARTICLE_SIZE = 0.05;
const MIN_PARTICLE_OFFSET = 0;
const MAX_PARTICLE_OFFSET = 0.2;
const MIN_PARTICLE_BLUR = 0;
const MAX_PARTICLE_BLUR = 1;
const DIAL_START_DEGREES = 140;
const DIAL_SWEEP_DEGREES = 260;
const DIAL_END_DEGREES = DIAL_START_DEGREES + DIAL_SWEEP_DEGREES;
const DIAL_RADIUS = 142;

export function createInterface(root, initialState, handlers) {
  root.innerHTML = `
    <main class="app-shell">
      <section class="stage" aria-label="Chladni cymatics plate">
        <div id="scene-root" class="scene-root"></div>
        <div class="status-pill" id="renderer-status"></div>
      </section>
      <aside class="control-panel" aria-label="Cymatics controls">
        <div class="dial" id="frequency-dial" role="slider" aria-label="Frequency" tabindex="0"
          aria-valuemin="${MIN_FREQUENCY}" aria-valuemax="${MAX_FREQUENCY}" aria-valuenow="${Math.round(initialState.frequencyHz)}">
          <svg class="dial-svg" viewBox="0 0 320 320" aria-hidden="true">
            <circle class="dial-base" cx="160" cy="160" r="${DIAL_RADIUS}"></circle>
            <circle class="dial-arc" id="dial-arc" cx="160" cy="160" r="${DIAL_RADIUS}"></circle>
            <g id="dial-ticks"></g>
            <circle class="dial-knob" id="dial-knob" cx="160" cy="30" r="17"></circle>
          </svg>
          <div class="dial-center">
            <strong id="dial-center-frequency">${Math.round(initialState.frequencyHz)}</strong>
            <span>Hz</span>
          </div>
        </div>
        <div class="section-heading">View</div>
        <div class="view-selector" id="view-selector" role="group" aria-label="View mode">
          <button class="view-button" type="button" data-view="webgpu">Sand · GPU</button>
          <button class="view-button" type="button" data-view="webgl">Sand · CPU</button>
          <button class="view-button" type="button" data-view="city">City</button>
        </div>
        <div class="section-heading">Presets</div>
        <div class="preset-strip" id="preset-strip" aria-label="Frequency presets">
          ${PATTERN_MODES.map((mode) => `<button class="preset-button" type="button" data-frequency="${mode.frequency}">${mode.frequency}</button>`).join("")}
        </div>
        <div id="sand-controls" class="view-controls">
          <div class="particle-control">
            <div class="control-row">
              <label for="particle-count">Particles</label>
              <output id="particle-count-output">${formatParticleCount(initialState.particleCount)}</output>
            </div>
            <input id="particle-count" class="particle-slider" type="range" min="${MIN_PARTICLES}" max="${WEBGPU_MAX_PARTICLES}" step="5000" value="${initialState.particleCount}" />
          </div>
          <div class="range-control">
            <div class="control-row">
              <label for="particle-speed">Speed</label>
              <output id="particle-speed-output">${formatParticleSpeed(initialState.particleSpeed)}</output>
            </div>
            <input id="particle-speed" class="control-slider" type="range" min="${MIN_PARTICLE_SPEED}" max="${MAX_PARTICLE_SPEED}" step="0.05" value="${initialState.particleSpeed}" />
          </div>
          <div class="range-control">
            <div class="control-row">
              <label for="particle-size">Size</label>
              <output id="particle-size-output">${formatParticleSize(initialState.particleSize)}</output>
            </div>
            <input id="particle-size" class="control-slider" type="range" min="${MIN_PARTICLE_SIZE}" max="${MAX_PARTICLE_SIZE}" step="0.001" value="${initialState.particleSize}" />
          </div>
          <div class="range-control">
            <div class="control-row">
              <label for="particle-offset">Offset</label>
              <output id="particle-offset-output">${formatParticleOffset(initialState.particleOffset)}</output>
            </div>
            <input id="particle-offset" class="control-slider" type="range" min="${MIN_PARTICLE_OFFSET}" max="${MAX_PARTICLE_OFFSET}" step="0.005" value="${initialState.particleOffset}" />
          </div>
          <div class="range-control">
            <div class="control-row">
              <label for="particle-blur">Blur</label>
              <output id="particle-blur-output">${formatParticleBlur(initialState.particleBlur)}</output>
            </div>
            <input id="particle-blur" class="control-slider" type="range" min="${MIN_PARTICLE_BLUR}" max="${MAX_PARTICLE_BLUR}" step="0.01" value="${initialState.particleBlur}" />
          </div>
          <div class="full-row">
            <button class="secondary-button" id="reset-sand" type="button">Reset Sand</button>
          </div>
        </div>
        <div id="city-controls" class="view-controls" hidden>
          <div class="range-control">
            <div class="control-row">
              <label for="city-grid">Grid</label>
              <output id="city-grid-output">${formatCityGrid(initialState.city.grid)}</output>
            </div>
            <input id="city-grid" class="control-slider" type="range" min="16" max="160" step="8" value="${initialState.city.grid}" />
          </div>
          <div class="range-control">
            <div class="control-row">
              <label for="city-lot-fill">Lot fill</label>
              <output id="city-lot-fill-output">${formatCityFraction(initialState.city.lotFill)}</output>
            </div>
            <input id="city-lot-fill" class="control-slider" type="range" min="0.1" max="1" step="0.01" value="${initialState.city.lotFill}" />
          </div>
          <div class="range-control">
            <div class="control-row">
              <label for="city-height">Height</label>
              <output id="city-height-output">${formatCityHeight(initialState.city.heightScale)}</output>
            </div>
            <input id="city-height" class="control-slider" type="range" min="0.1" max="6" step="0.1" value="${initialState.city.heightScale}" />
          </div>
          <div class="range-control">
            <div class="control-row">
              <label for="city-band-width">Band width</label>
              <output id="city-band-width-output">${formatCityFraction(initialState.city.bandWidth)}</output>
            </div>
            <input id="city-band-width" class="control-slider" type="range" min="0.02" max="1" step="0.01" value="${initialState.city.bandWidth}" />
          </div>
          <div class="full-row">
            <button class="secondary-button" id="city-invert" type="button" aria-pressed="${initialState.city.invert}">${formatCityInvertLabel(initialState.city.invert)}</button>
          </div>
          <div class="full-row">
            <button class="mute-button" id="city-stylize" type="button">AI Stylize ✨</button>
          </div>
        </div>
        <button class="mute-button" id="mute-button" type="button" aria-pressed="${!initialState.muted}">
          <span id="mute-label">${initialState.muted ? "Unmute Tone" : "Mute Tone"}</span>
        </button>
      </aside>
    </main>
  `;

  const sceneRoot = root.querySelector("#scene-root");
  const dial = root.querySelector("#frequency-dial");
  const arc = root.querySelector("#dial-arc");
  const knob = root.querySelector("#dial-knob");
  const ticks = root.querySelector("#dial-ticks");
  const centerValue = root.querySelector("#dial-center-frequency");
  const particleSlider = root.querySelector("#particle-count");
  const particleOutput = root.querySelector("#particle-count-output");
  const speedSlider = root.querySelector("#particle-speed");
  const speedOutput = root.querySelector("#particle-speed-output");
  const sizeSlider = root.querySelector("#particle-size");
  const sizeOutput = root.querySelector("#particle-size-output");
  const offsetSlider = root.querySelector("#particle-offset");
  const offsetOutput = root.querySelector("#particle-offset-output");
  const blurSlider = root.querySelector("#particle-blur");
  const blurOutput = root.querySelector("#particle-blur-output");
  const presetStrip = root.querySelector("#preset-strip");
  const resetSandButton = root.querySelector("#reset-sand");
  const viewSelector = root.querySelector("#view-selector");
  const viewButtons = Array.from(viewSelector.querySelectorAll("[data-view]"));
  const sandControls = root.querySelector("#sand-controls");
  const cityControls = root.querySelector("#city-controls");
  const cityGridSlider = root.querySelector("#city-grid");
  const cityGridOutput = root.querySelector("#city-grid-output");
  const cityLotFillSlider = root.querySelector("#city-lot-fill");
  const cityLotFillOutput = root.querySelector("#city-lot-fill-output");
  const cityHeightSlider = root.querySelector("#city-height");
  const cityHeightOutput = root.querySelector("#city-height-output");
  const cityBandWidthSlider = root.querySelector("#city-band-width");
  const cityBandWidthOutput = root.querySelector("#city-band-width-output");
  const cityInvertButton = root.querySelector("#city-invert");
  const cityStylizeButton = root.querySelector("#city-stylize");
  const muteButton = root.querySelector("#mute-button");
  const muteLabel = root.querySelector("#mute-label");
  const rendererStatus = root.querySelector("#renderer-status");

  let frequencyHz = initialState.frequencyHz;
  let muted = initialState.muted;
  let cityInvert = initialState.city.invert;
  let currentView = initialState.view ?? "webgpu";
  let pointerActive = false;
  let controlsBusy = false;

  renderTicks(ticks);
  updateFrequencyVisuals(frequencyHz);
  updateStatus(initialState.rendererMode, initialState.isFallback);
  updateView(currentView);

  dial.addEventListener("pointerdown", (event) => {
    pointerActive = true;
    dial.setPointerCapture(event.pointerId);
    updateFrequencyFromPointer(event);
  });

  dial.addEventListener("pointermove", (event) => {
    if (!pointerActive) return;
    updateFrequencyFromPointer(event);
  });

  dial.addEventListener("pointerup", (event) => {
    pointerActive = false;
    dial.releasePointerCapture(event.pointerId);
  });

  dial.addEventListener("pointercancel", () => {
    pointerActive = false;
  });

  dial.addEventListener("keydown", (event) => {
    const coarse = event.shiftKey ? 250 : 25;

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      setFrequency(Math.min(MAX_FREQUENCY, frequencyHz + coarse), true);
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      setFrequency(Math.max(MIN_FREQUENCY, frequencyHz - coarse), true);
    }
  });

  particleSlider.addEventListener("input", () => {
    const count = Number(particleSlider.value);
    particleOutput.textContent = formatParticleCount(count);
  });

  particleSlider.addEventListener("change", async () => {
    const count = Number(particleSlider.value);
    setControlsBusy(true);
    try {
      const actualCount = await handlers.onParticleCountChange(count);
      if (actualCount) {
        particleSlider.value = actualCount;
        particleOutput.textContent = formatParticleCount(actualCount);
      }
    } finally {
      setControlsBusy(false);
    }
  });

  speedSlider.addEventListener("input", () => {
    const speed = Number(speedSlider.value);
    speedOutput.textContent = formatParticleSpeed(speed);
    handlers.onParticleSpeedChange(speed);
  });

  sizeSlider.addEventListener("input", () => {
    const size = Number(sizeSlider.value);
    sizeOutput.textContent = formatParticleSize(size);
    handlers.onParticleSizeChange(size);
  });

  offsetSlider.addEventListener("input", () => {
    const offset = Number(offsetSlider.value);
    offsetOutput.textContent = formatParticleOffset(offset);
    handlers.onParticleOffsetChange(offset);
  });

  blurSlider.addEventListener("input", () => {
    const blur = Number(blurSlider.value);
    blurOutput.textContent = formatParticleBlur(blur);
    handlers.onParticleBlurChange(blur);
  });

  sceneRoot.addEventListener("click", async (event) => {
    // In City view the canvas is for orbiting, not random-preset cycling.
    if (controlsBusy || currentView === "city" || event.target?.tagName !== "CANVAS") return;
    await applyPresetFrequency(getRandomPresetFrequency(frequencyHz));
  });

  presetStrip.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-frequency]");
    if (!button || controlsBusy) return;

    await applyPresetFrequency(Number(button.dataset.frequency));
  });

  resetSandButton.addEventListener("click", resetParticles);

  async function resetParticles() {
    setControlsBusy(true);
    try {
      const actualCount = await handlers.onResetParticles();
      if (actualCount) {
        particleSlider.value = actualCount;
        particleOutput.textContent = formatParticleCount(actualCount);
      }
    } finally {
      setControlsBusy(false);
    }
  }

  async function applyPresetFrequency(nextFrequency) {
    const isSameFrequency = normalizeFrequency(nextFrequency) === frequencyHz;
    setFrequency(nextFrequency, true);
    const resetPromise = resetParticles();

    if (isSameFrequency) {
      await handlers.onToneRestart();
    }

    await resetPromise;
  }

  viewSelector.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-view]");
    if (!button || controlsBusy) return;
    const view = button.dataset.view;
    if (view === currentView) return;

    setControlsBusy(true);
    try {
      await handlers.onViewChange?.(view);
    } finally {
      setControlsBusy(false);
    }
  });

  cityGridSlider.addEventListener("input", () => {
    cityGridOutput.textContent = formatCityGrid(Number(cityGridSlider.value));
  });

  // Grid changes rebuild the InstancedMesh, so only commit on release (change).
  cityGridSlider.addEventListener("change", () => {
    handlers.onCityGridChange?.(Number(cityGridSlider.value));
  });

  cityLotFillSlider.addEventListener("input", () => {
    const value = Number(cityLotFillSlider.value);
    cityLotFillOutput.textContent = formatCityFraction(value);
    handlers.onCityLotFillChange?.(value);
  });

  cityHeightSlider.addEventListener("input", () => {
    const value = Number(cityHeightSlider.value);
    cityHeightOutput.textContent = formatCityHeight(value);
    handlers.onCityHeightChange?.(value);
  });

  cityBandWidthSlider.addEventListener("input", () => {
    const value = Number(cityBandWidthSlider.value);
    cityBandWidthOutput.textContent = formatCityFraction(value);
    handlers.onCityBandWidthChange?.(value);
  });

  cityInvertButton.addEventListener("click", () => {
    cityInvert = !cityInvert;
    updateCityInvertVisual();
    handlers.onCityInvertChange?.(cityInvert);
  });

  cityStylizeButton.addEventListener("click", () => {
    handlers.onStylize?.();
  });

  muteButton.addEventListener("click", async () => {
    muted = !muted;
    updateMute();
    muteButton.disabled = true;
    try {
      await handlers.onMutedChange(muted);
    } finally {
      muteButton.disabled = false;
    }
  });

  function updateFrequencyFromPointer(event) {
    const rect = dial.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const angle = Math.atan2(y, x);
    const progress = angleToProgress(angle);
    const nextFrequency = MIN_FREQUENCY + progress * (MAX_FREQUENCY - MIN_FREQUENCY);
    setFrequency(nextFrequency, true);
  }

  function setFrequency(nextFrequency, emit) {
    frequencyHz = normalizeFrequency(nextFrequency);
    updateFrequencyVisuals(frequencyHz);

    if (emit) {
      handlers.onFrequencyChange(frequencyHz);
    }
  }

  function updateFrequencyVisuals(nextFrequency) {
    const progress = (nextFrequency - MIN_FREQUENCY) / (MAX_FREQUENCY - MIN_FREQUENCY);
    const angle = progressToAngle(progress);
    const point = polarToCartesian(160, 160, DIAL_RADIUS, angle);
    const circumference = 2 * Math.PI * DIAL_RADIUS;
    const visibleLength = circumference * DIAL_SWEEP_DEGREES / 360 * progress;

    arc.style.strokeDasharray = `${visibleLength} ${circumference}`;
    arc.style.strokeDashoffset = "0";
    knob.setAttribute("cx", point.x);
    knob.setAttribute("cy", point.y);
    centerValue.textContent = Math.round(nextFrequency);
    dial.setAttribute("aria-valuenow", Math.round(nextFrequency));
  }

  function updateMute() {
    muteButton.setAttribute("aria-pressed", String(!muted));
    muteLabel.textContent = muted ? "Unmute Tone" : "Mute Tone";
    muteButton.classList.toggle("is-live", !muted);
  }

  return {
    sceneRoot,
    updateFrequency: (nextFrequency) => setFrequency(nextFrequency, false),
    updateParticleCount: (count) => {
      particleSlider.value = count;
      particleOutput.textContent = formatParticleCount(count);
    },
    updateParticleSpeed: (speed) => {
      speedSlider.value = speed;
      speedOutput.textContent = formatParticleSpeed(speed);
    },
    updateParticleSize: (size) => {
      sizeSlider.value = size;
      sizeOutput.textContent = formatParticleSize(size);
    },
    updateParticleOffset: (offset) => {
      offsetSlider.value = offset;
      offsetOutput.textContent = formatParticleOffset(offset);
    },
    updateParticleBlur: (blur) => {
      blurSlider.value = blur;
      blurOutput.textContent = formatParticleBlur(blur);
    },
    updateView,
    updateCityGrid: (grid) => {
      cityGridSlider.value = grid;
      cityGridOutput.textContent = formatCityGrid(Number(grid));
    },
    updateCityLotFill: (lotFill) => {
      cityLotFillSlider.value = lotFill;
      cityLotFillOutput.textContent = formatCityFraction(Number(lotFill));
    },
    updateCityHeight: (heightScale) => {
      cityHeightSlider.value = heightScale;
      cityHeightOutput.textContent = formatCityHeight(Number(heightScale));
    },
    updateCityBandWidth: (bandWidth) => {
      cityBandWidthSlider.value = bandWidth;
      cityBandWidthOutput.textContent = formatCityFraction(Number(bandWidth));
    },
    updateCityInvert: (invert) => {
      cityInvert = Boolean(invert);
      updateCityInvertVisual();
    },
    updateStatus
  };

  function updateView(view) {
    currentView = view ?? currentView;
    const isCity = currentView === "city";
    sandControls.hidden = isCity;
    cityControls.hidden = !isCity;
    viewButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === currentView);
      button.setAttribute("aria-pressed", String(button.dataset.view === currentView));
    });
  }

  function updateCityInvertVisual() {
    cityInvertButton.textContent = formatCityInvertLabel(cityInvert);
    cityInvertButton.setAttribute("aria-pressed", String(cityInvert));
    cityInvertButton.classList.toggle("is-active", cityInvert);
  }

  function updateStatus(rendererMode, isFallback) {
    particleSlider.max = String(isFallback ? WEBGL_MAX_PARTICLES : WEBGPU_MAX_PARTICLES);
    rendererStatus.textContent = rendererMode;
    rendererStatus.classList.toggle("is-fallback", isFallback);
  }

  function setControlsBusy(isBusy) {
    controlsBusy = isBusy;
    particleSlider.disabled = isBusy;
    speedSlider.disabled = isBusy;
    sizeSlider.disabled = isBusy;
    offsetSlider.disabled = isBusy;
    blurSlider.disabled = isBusy;
    resetSandButton.disabled = isBusy;
    cityGridSlider.disabled = isBusy;
    cityLotFillSlider.disabled = isBusy;
    cityHeightSlider.disabled = isBusy;
    cityBandWidthSlider.disabled = isBusy;
    cityInvertButton.disabled = isBusy;
    viewButtons.forEach((button) => {
      button.disabled = isBusy;
    });
    presetStrip.querySelectorAll("button").forEach((button) => {
      button.disabled = isBusy;
    });
  }
}

function getRandomPresetFrequency(currentFrequency) {
  const availableModes = PATTERN_MODES.filter((mode) => mode.frequency !== currentFrequency);
  const modes = availableModes.length > 0 ? availableModes : PATTERN_MODES;
  const index = Math.floor(Math.random() * modes.length);
  return modes[index].frequency;
}

function normalizeFrequency(frequencyHz) {
  return Math.round(Math.min(MAX_FREQUENCY, Math.max(MIN_FREQUENCY, frequencyHz)));
}

function renderTicks(group) {
  const labels = [
    { frequency: MIN_FREQUENCY, label: "345" },
    { frequency: 1000, label: "1k" },
    { frequency: 2000, label: "2k" },
    { frequency: 3000, label: "3k" },
    { frequency: 4000, label: "4k" },
    { frequency: 5000, label: "5k" },
    { frequency: MAX_FREQUENCY, label: "6k" }
  ];

  for (const mark of labels) {
    const progress = (mark.frequency - MIN_FREQUENCY) / (MAX_FREQUENCY - MIN_FREQUENCY);
    const angle = progressToAngle(progress);
    const outer = polarToCartesian(160, 160, 124, angle);
    const inner = polarToCartesian(160, 160, 109, angle);
    const label = polarToCartesian(160, 160, 84, angle);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", inner.x);
    line.setAttribute("y1", inner.y);
    line.setAttribute("x2", outer.x);
    line.setAttribute("y2", outer.y);
    line.setAttribute("class", "dial-tick");
    group.append(line);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", label.x);
    text.setAttribute("y", label.y);
    text.setAttribute("class", "dial-label");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.textContent = mark.label;
    group.append(text);
  }
}

function progressToAngle(progress) {
  return (DIAL_START_DEGREES + progress * DIAL_SWEEP_DEGREES) * (Math.PI / 180);
}

function angleToProgress(angle) {
  let degrees = angle * (180 / Math.PI);
  if (degrees < 0) degrees += 360;

  const endModulo = DIAL_END_DEGREES % 360;

  if (degrees < endModulo) {
    degrees += 360;
  }

  if (degrees < DIAL_START_DEGREES) {
    const distanceToStart = DIAL_START_DEGREES - degrees;
    const distanceToEnd = degrees + 360 - DIAL_END_DEGREES;
    degrees = distanceToStart <= distanceToEnd ? DIAL_START_DEGREES : DIAL_END_DEGREES;
  }

  const clamped = Math.min(DIAL_END_DEGREES, Math.max(DIAL_START_DEGREES, degrees));
  return (clamped - DIAL_START_DEGREES) / DIAL_SWEEP_DEGREES;
}

function polarToCartesian(cx, cy, radius, angle) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
}

function formatParticleCount(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  return `${Math.round(value / 1000)}k`;
}

function formatParticleSpeed(value) {
  return `${Number(value).toFixed(2)}x`;
}

function formatParticleSize(value) {
  return Number(value).toFixed(3);
}

function formatParticleOffset(value) {
  return Number(value).toFixed(3);
}

function formatParticleBlur(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function formatCityGrid(value) {
  const grid = Math.round(Number(value));
  return `${grid}×${grid}`;
}

function formatCityFraction(value) {
  return Number(value).toFixed(2);
}

function formatCityHeight(value) {
  return `${Number(value).toFixed(1)}x`;
}

function formatCityInvertLabel(invert) {
  return invert ? "Tall in blocks" : "Tall on lines";
}
