// AI Stylize panel — turns the City render into a finished illustration via
// Google's Gemini "Flash Image" model, called directly from the browser.
//
// Fully client-side: the user's API key lives only in localStorage and is sent
// only to Google's endpoint. No backend of our own.

const MODEL = "gemini-2.5-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const LS_KEY = "chladni.ai.key";
const LS_PROMPT = "chladni.ai.prompt";
const LS_REF = "chladni.ai.ref";

const DEFAULT_PROMPT =
  "Image 1 is a STYLE reference painting. Image 2 is a plain 3D massing render of a city. " +
  "Redraw Image 2 as a polished finished illustration in the exact art style, color palette, " +
  "materials and lighting of Image 1 — glossy candy-striped retro-future towers, neon glow, " +
  "dark tiled ground plane with light trails, 1980s airbrush look. Keep the same building " +
  "layout, skyline silhouette and camera angle as Image 2. High detail, cinematic.";

export function createStylizer(root, { getFrame }) {
  let overlay = null;
  let els = null;

  function build() {
    overlay = document.createElement("div");
    overlay.className = "ai-modal";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="ai-dialog" role="dialog" aria-modal="true" aria-label="AI Stylize">
        <div class="ai-head">
          <strong>AI Stylize — City</strong>
          <button class="ai-close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="ai-body">
          <div class="ai-col ai-settings">
            <label class="ai-field">
              <span>Gemini API key</span>
              <input id="ai-key" type="password" autocomplete="off" placeholder="AIza…" />
              <small>Stored only in your browser. Get one at aistudio.google.com/apikey</small>
            </label>
            <div class="ai-field">
              <span>Style reference</span>
              <div class="ai-ref">
                <img id="ai-ref-img" alt="Style reference preview" />
                <div class="ai-ref-actions">
                  <button class="secondary-button" id="ai-ref-pick" type="button">Upload image…</button>
                  <button class="secondary-button" id="ai-ref-clear" type="button">Clear</button>
                  <input id="ai-ref-file" type="file" accept="image/*" hidden />
                </div>
              </div>
            </div>
            <label class="ai-field">
              <span>Prompt</span>
              <textarea id="ai-prompt" rows="5"></textarea>
            </label>
            <button class="mute-button ai-generate" id="ai-generate" type="button">Generate</button>
            <div class="ai-status" id="ai-status" role="status"></div>
          </div>
          <div class="ai-col ai-output">
            <div class="ai-canvas" id="ai-canvas">
              <span class="ai-placeholder">The stylized city will appear here.</span>
            </div>
            <a class="secondary-button ai-download" id="ai-download" download="chladni-city.png" hidden>Download PNG</a>
          </div>
        </div>
      </div>
    `;
    root.append(overlay);

    els = {
      dialog: overlay.querySelector(".ai-dialog"),
      close: overlay.querySelector(".ai-close"),
      key: overlay.querySelector("#ai-key"),
      refImg: overlay.querySelector("#ai-ref-img"),
      refPick: overlay.querySelector("#ai-ref-pick"),
      refClear: overlay.querySelector("#ai-ref-clear"),
      refFile: overlay.querySelector("#ai-ref-file"),
      prompt: overlay.querySelector("#ai-prompt"),
      generate: overlay.querySelector("#ai-generate"),
      status: overlay.querySelector("#ai-status"),
      canvas: overlay.querySelector("#ai-canvas"),
      download: overlay.querySelector("#ai-download")
    };

    // Restore persisted state.
    els.key.value = localStorage.getItem(LS_KEY) ?? "";
    els.prompt.value = localStorage.getItem(LS_PROMPT) ?? DEFAULT_PROMPT;
    setRefPreview(localStorage.getItem(LS_REF) ?? "");

    els.key.addEventListener("change", () => localStorage.setItem(LS_KEY, els.key.value.trim()));
    els.prompt.addEventListener("change", () => localStorage.setItem(LS_PROMPT, els.prompt.value));

    els.refPick.addEventListener("click", () => els.refFile.click());
    els.refFile.addEventListener("change", async () => {
      const file = els.refFile.files?.[0];
      if (!file) return;
      const dataUrl = await fileToDataUrl(file);
      localStorage.setItem(LS_REF, dataUrl);
      setRefPreview(dataUrl);
    });
    els.refClear.addEventListener("click", () => {
      localStorage.removeItem(LS_REF);
      setRefPreview("");
    });

    els.close.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overlay.hidden) close();
    });

    els.generate.addEventListener("click", generate);
  }

  function setRefPreview(dataUrl) {
    if (dataUrl) {
      els.refImg.src = dataUrl;
      els.refImg.style.display = "block";
    } else {
      els.refImg.removeAttribute("src");
      els.refImg.style.display = "none";
    }
  }

  function setStatus(message, kind = "") {
    els.status.textContent = message;
    els.status.className = `ai-status ${kind}`;
  }

  async function generate() {
    const apiKey = els.key.value.trim();
    if (!apiKey) {
      setStatus("Enter your Gemini API key first.", "error");
      return;
    }

    const cityUrl = getFrame?.();
    if (!cityUrl) {
      setStatus("Switch to the City view first.", "error");
      return;
    }

    localStorage.setItem(LS_KEY, apiKey);
    localStorage.setItem(LS_PROMPT, els.prompt.value);

    els.generate.disabled = true;
    setStatus("Generating… (this can take 10–30s)", "busy");

    try {
      const refUrl = localStorage.getItem(LS_REF) ?? "";
      const parts = [{ text: els.prompt.value || DEFAULT_PROMPT }];
      if (refUrl) parts.push(dataUrlToInlinePart(refUrl)); // Image 1: style
      parts.push(dataUrlToInlinePart(cityUrl)); // Image 2: city render

      const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }] })
      });

      if (!response.ok) {
        const detail = await safeError(response);
        throw new Error(`${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`);
      }

      const json = await response.json();
      const outParts = json?.candidates?.[0]?.content?.parts ?? [];
      const imagePart = outParts.find((p) => p.inlineData?.data || p.inline_data?.data);
      const data = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;

      if (!data) {
        const text = outParts.find((p) => p.text)?.text;
        throw new Error(text ? `No image returned. Model said: ${text}` : "No image in the response.");
      }

      const resultUrl = `data:image/png;base64,${data}`;
      els.canvas.innerHTML = `<img src="${resultUrl}" alt="AI-stylized city" />`;
      els.download.href = resultUrl;
      els.download.hidden = false;
      setStatus("Done.", "ok");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed.", "error");
    } finally {
      els.generate.disabled = false;
    }
  }

  function open() {
    if (!overlay) build();
    overlay.hidden = false;
  }

  function close() {
    if (overlay) overlay.hidden = true;
  }

  return { open, close };
}

function dataUrlToInlinePart(dataUrl) {
  const match = /^data:(.+?);base64,(.*)$/.exec(dataUrl);
  const mimeType = match ? match[1] : "image/png";
  const data = match ? match[2] : dataUrl;
  return { inline_data: { mime_type: mimeType, data } };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function safeError(response) {
  try {
    const json = await response.json();
    return json?.error?.message ?? "";
  } catch {
    return "";
  }
}
