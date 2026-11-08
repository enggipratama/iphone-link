// Settings, theme, crop, trackpad, and keyboard controls
// Extracted from app.js

function toggleSettings(open) {
  const controlPane = document.querySelector("#control-pane");
  const btnSettings = document.querySelector("#btn-settings");
  const appRoot = document.querySelector("#app-root");
  if (!controlPane) return;
  const isHidden = controlPane.hidden;
  const shouldOpen = open !== undefined ? open : isHidden;
  isDrawerOpen = shouldOpen;
  window.isDrawerOpen = shouldOpen;
  controlPane.hidden = !shouldOpen;
  controlPane.classList.toggle("open", shouldOpen);
  controlPane.classList.toggle("is-open", shouldOpen);
  controlPane.setAttribute("aria-hidden", String(!shouldOpen));
  btnSettings?.classList.toggle("active", shouldOpen);
  appRoot?.classList.toggle("drawer-open", shouldOpen);

  // Tahap 91: Dispatch resize to mirror iframe & window so layout updates smoothly
  window.dispatchEvent(new Event("resize"));
  const iframe = document.getElementById("screen-view");
  if (iframe && iframe.contentWindow) {
    [0, 60, 150].forEach((ms) => {
      setTimeout(() => {
        try {
          iframe.contentWindow.dispatchEvent(new Event("resize"));
          iframe.contentWindow.postMessage({ type: "resize" }, "*");
        } catch (_) { }
      }, ms);
    });
  }

  try {
    const isLand = Boolean(window.isLandscapeMode || (typeof isLandscapeMode !== "undefined" && isLandscapeMode) || appRoot?.classList.contains("is-landscape"));
    if (window.pywebview?.api?.set_orientation) {
      window.pywebview.api.set_orientation(isLand, shouldOpen);
    } else if (window.pywebview?.api?.set_drawer) {
      window.pywebview.api.set_drawer(shouldOpen);
    }
  } catch (_) { }
}
window.toggleSettings = toggleSettings;

function setupEarlyControls() {
  try {
    const btnClose = document.querySelector("#win-close");
    if (btnClose && !btnClose._earlyBound) {
      btnClose._earlyBound = true;
      btnClose.addEventListener("click", () => {
        console.log("[DEBUG] Close button clicked");
        if (window.pywebview?.api?.close) {
          window.pywebview.api.close();
        } else {
          window.close();
        }
      });
    }

    const btnMin = document.querySelector("#win-min");
    if (btnMin && !btnMin._earlyBound) {
      btnMin._earlyBound = true;
      btnMin.addEventListener("click", () => {
        console.log("[DEBUG] Minimize button clicked");
        window.pywebview?.api?.minimize?.();
      });
      btnMin.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.pywebview?.api?.minimize_to_tray) {
          window.pywebview.api.minimize_to_tray();
        } else {
          window.pywebview?.api?.minimize?.();
        }
      });
    }

    const btnHide = document.querySelector("#btn-hide-to-tray");
    if (btnHide && !btnHide._earlyBound) {
      btnHide._earlyBound = true;
      btnHide.addEventListener("click", () => {
        if (window.pywebview?.api?.minimize_to_tray) {
          window.pywebview.api.minimize_to_tray();
        } else {
          window.pywebview?.api?.minimize?.();
        }
      });
    }

    const btnSet = document.querySelector("#btn-settings");
    if (btnSet && !btnSet._earlyBound) {
      btnSet._earlyBound = true;
      btnSet.addEventListener("click", (e) => {
        console.log("[DEBUG] Settings button clicked");
        e.preventDefault();
        toggleSettings();
      });
    }

    const btnCloseSet = document.querySelector("#close-settings");
    if (btnCloseSet && !btnCloseSet._earlyBound) {
      btnCloseSet._earlyBound = true;
      btnCloseSet.addEventListener("click", (e) => {
        e.preventDefault();
        toggleSettings(false);
      });
    }

    // Restart button
    const btnRestart = document.querySelector("#restart-screen");
    if (btnRestart && !btnRestart._earlyBound) {
      btnRestart._earlyBound = true;
      btnRestart.addEventListener("click", (e) => {
        e.preventDefault();
        fetch("/api/screen/restart", { method: "POST" }).catch(() => {});
      });
    }

    // Rotate button
    const btnRotate = document.querySelector("#btn-rotate-landscape");
    if (btnRotate && !btnRotate._earlyBound) {
      btnRotate._earlyBound = true;
      btnRotate.addEventListener("click", (e) => {
        e.preventDefault();
        document.body.classList.toggle("is-landscape");
      });
    }
  } catch (e) {
    console.error("[Tahap65-EarlyControlsError]", e);
  }
}


function applyCleanSlatePinGuard(settingsPayload) {
  if (!settingsPayload) return;
  const currentFolderInstanceId = String(settingsPayload.folderInstanceId || "");
  const isFreshFolder = Boolean(settingsPayload.isFreshFolder);
  const pinEl = document.querySelector("#input-unlock-pin");
  try {
    const savedInstanceId = localStorage.getItem("iphone_link_folder_instance_id") || "";
    if (isFreshFolder || !currentFolderInstanceId || savedInstanceId !== currentFolderInstanceId) {
      localStorage.removeItem("iphone_link_unlock_pin");
      localStorage.removeItem("pane-unlock-pin");
      if (pinEl) pinEl.value = "";
      if (currentFolderInstanceId) {
        localStorage.setItem("iphone_link_folder_instance_id", currentFolderInstanceId);
      }
    } else {
      const savedPin =
        localStorage.getItem("iphone_link_unlock_pin") ||
        localStorage.getItem("pane-unlock-pin") ||
        "";
      if (pinEl) pinEl.value = savedPin;
    }
  } catch (_) {
    if (pinEl) pinEl.value = "";
  }
}

// Persistent Settings via /api/settings (Tahap 69: Isolated per-property safe parsing)
async function fetchUserSettings() {
  try {
    const res = await getJson("/api/settings");
    if (!res) return;
    try { applyCleanSlatePinGuard(res); } catch (_) { }
    if (res.crop) {
      try {
        currentCrop = {
          top: Math.max(0, Math.min(120, parseInt(res.crop.top, 10) || 0)),
          bottom: Math.max(0, Math.min(120, parseInt(res.crop.bottom, 10) || 0)),
          left: Math.max(0, Math.min(120, parseInt(res.crop.left, 10) || 0)),
          right: Math.max(0, Math.min(120, parseInt(res.crop.right, 10) || 0)),
        };
        localStorage.setItem("pane-crop-edges", JSON.stringify(currentCrop));
        applyCrop(currentCrop, true);
      } catch (_) { }
    }
    if (res.fitMode) {
      try { applyFitMode(res.fitMode); } catch (_) { }
    }
    if (res.autoRotate !== undefined) {
      try { applyAutoRotateSetting(res.autoRotate, false); } catch (_) { }
    }
    if (res.theme) {
      try { applyTheme(res.theme); } catch (_) { }
    }
    if (res.trackpadSpeed !== undefined) {
      try { applyTrackpadSpeed(res.trackpadSpeed, true); } catch (_) { }
    }
    if (
      res.crossPlatformShortcuts !== undefined ||
      res.pastePcClipboard !== undefined
    ) {
      try {
        applyKeyboardSettings(
          {
            crossPlatformShortcuts: res.crossPlatformShortcuts,
            pastePcClipboard: res.pastePcClipboard,
          },
          true
        );
      } catch (_) { }
    }
    if (res.audioVolume !== undefined) {
      try {
        const volSlider = document.querySelector("#audio-vol-slider");
        const volVal = document.querySelector("#audio-vol-val");
        if (volSlider) volSlider.value = String(res.audioVolume);
        if (volVal) volVal.textContent = `${res.audioVolume}%`;
      } catch (_) { }
    }
  } catch (err) {
    console.warn("fetchUserSettings error:", err);
  }
}

async function saveUserSettings() {
  const btnSave = document.querySelector("#btn-save-crop");
  try {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = "Saving…";
    }
    localStorage.setItem("pane-crop-edges", JSON.stringify(currentCrop));
    localStorage.setItem("pane-fit-mode", currentFitMode);
    localStorage.setItem("pane-theme", currentTheme);

    await postJson("/api/settings", {
      crop: currentCrop,
      fitMode: currentFitMode,
      theme: currentTheme,
      trackpadSpeed: currentTrackpadSpeed,
      crossPlatformShortcuts: currentKeyboardSettings.crossPlatformShortcuts,
      pastePcClipboard: currentKeyboardSettings.pastePcClipboard,
    });

    applyCrop(currentCrop, true);

    if (btnSave) {
      btnSave.textContent = "✓ Crop Saved!";
      btnSave.classList.add("is-saved");
      setTimeout(() => {
        btnSave.textContent = "💾 Save Crop";
        btnSave.classList.remove("is-saved");
        btnSave.disabled = false;
      }, 1500);
    }
  } catch (err) {
    console.warn("saveUserSettings error:", err);
    if (btnSave) {
      btnSave.textContent = "Error saving";
      btnSave.disabled = false;
    }
  }
}

// Audio Sink UI & Management

function renderAudio(audio) {
  if (!audio) return;
  currentAudioState = { ...currentAudioState, ...audio };

  const isEnabled = Boolean(currentAudioState.enabled || currentAudioState.active);
  const btnTop = document.querySelector("#btn-audio-top");
  const iconOn = btnTop?.querySelector(".audio-icon-on");
  const iconOff = btnTop?.querySelector(".audio-icon-off");
  if (btnTop) {
    btnTop.classList.toggle("is-active", isEnabled);
    if (iconOn && iconOff) {
      iconOn.hidden = !isEnabled;
      iconOff.hidden = isEnabled;
      iconOn.style.display = isEnabled ? "block" : "none";
      iconOff.style.display = isEnabled ? "none" : "block";
    }
  }

  const badge = document.querySelector("#audio-status-badge");
  if (badge) {
    badge.classList.toggle("active", isEnabled);
    if (isEnabled) {
      badge.textContent = `● Active (${currentAudioState.device || "PC"})`;
    } else {
      badge.textContent = "○ Off / Muted";
    }
  }

  const btnDrawer = document.querySelector("#btn-audio-drawer");
  const textDrawer = document.querySelector("#audio-toggle-text");
  const iconDrawer = document.querySelector("#audio-toggle-icon");
  if (btnDrawer) {
    btnDrawer.classList.toggle("is-active", isEnabled);
    if (textDrawer) {
      textDrawer.textContent = isEnabled ? "Disable Audio Sink (Active)" : "Enable Audio Sink";
    }
    if (iconDrawer) {
      iconDrawer.textContent = isEnabled ? "🔇" : "🔊";
    }
  }

  const volSlider = document.querySelector("#audio-vol-slider");
  const volVal = document.querySelector("#audio-vol-val");
  if (volSlider && currentAudioState.volume !== undefined) {
    volSlider.value = String(currentAudioState.volume);
  }
  if (volVal && currentAudioState.volume !== undefined) {
    volVal.textContent = `${currentAudioState.volume}%`;
  }
}

async function toggleAudio(forcedState) {
  try {
    const shouldEnable = forcedState !== undefined ? forcedState : !currentAudioState.enabled;
    const res = await postJson("/api/audio/toggle", { enabled: shouldEnable });
    renderAudio(res);
  } catch (err) {
    console.warn("toggleAudio error:", err);
  }
}
window.trayToggleAudio = () => toggleAudio();

async function setAudioVolume(vol) {
  try {
    const res = await postJson("/api/audio/volume", { volume: parseInt(vol, 10) || 100 });
    if (res && res.volume !== undefined) {
      currentAudioState.volume = res.volume;
      const volVal = document.querySelector("#audio-vol-val");
      if (volVal) volVal.textContent = `${res.volume}%`;
    }
  } catch (err) {
    console.warn("setAudioVolume error:", err);
  }
}

function initAudioControls() {
  document.querySelector("#btn-audio-top")?.addEventListener("click", () => toggleAudio());
  document.querySelector("#btn-audio-drawer")?.addEventListener("click", () => toggleAudio());

  const volSlider = document.querySelector("#audio-vol-slider");
  const volVal = document.querySelector("#audio-vol-val");
  volSlider?.addEventListener("input", (e) => {
    if (volVal) volVal.textContent = `${e.target.value}%`;
  });
  volSlider?.addEventListener("change", (e) => {
    setAudioVolume(e.target.value);
  });

  document.querySelector("#btn-audio-pair")?.addEventListener("click", async () => {
    try {
      await postJson("/api/audio/pair", {});
    } catch (_) { }
  });
}

function syncThemeToIframe() {
  try {
    if (screenView && screenView.contentDocument) {
      screenView.contentDocument.documentElement.setAttribute("data-theme", currentTheme);
      screenView.contentDocument.body?.setAttribute("data-theme", currentTheme);
    }
  } catch (_) { }
  try {
    screenView?.contentWindow?.postMessage({ type: "set-theme", theme: currentTheme }, "*");
  } catch (_) { }
}

function applyTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);
  const appEl = document.querySelector("#app-root");
  appEl?.setAttribute("data-theme", currentTheme);
  localStorage.setItem("pane-theme", currentTheme);

  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    const active = btn.dataset.themeChoice === currentTheme;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-checked", String(active));
  });

  syncThemeToIframe();

  try {
    if (window.pywebview?.api?.set_theme) {
      window.pywebview.api.set_theme(currentTheme);
    }
  } catch (_) { }
}


// Tahap 80: Toast Notification is completely disabled (no-op) for 100% clean display
function showToastNotification(text, duration = 2200) {
  return;
}
window.showToastNotification = showToastNotification;

function updateRotateModeBadge(isOn) {
  const badge = document.querySelector("#rotate-mode-badge");
  const btnRot = document.querySelector("#btn-rotate-landscape");
  if (badge) {
    badge.textContent = isOn ? "Auto" : "";
    if (!isOn) {
      badge.style.setProperty("display", "none", "important");
    } else {
      badge.style.display = "";
    }
  }
  if (btnRot) {
    btnRot.classList.toggle("is-auto-rotate-on", Boolean(isOn));
  }
}
window.updateRotateModeBadge = updateRotateModeBadge;



function applyAutoRotateSetting(enabled, userTriggered = false) {
  autoRotateEnabled = Boolean(enabled);
  try {
    localStorage.setItem("pane-auto-rotate", String(autoRotateEnabled));
  } catch (_) { }
  document.querySelectorAll("[data-auto-rotate-choice]").forEach((btn) => {
    const choice = (btn.dataset.autoRotateChoice || "").toLowerCase();
    const isThisActive = (choice === "on" || choice === "true" || choice === "1") ? autoRotateEnabled : !autoRotateEnabled;
    btn.classList.toggle("is-active", isThisActive);
    btn.classList.toggle("active", isThisActive);
    btn.setAttribute("aria-checked", String(isThisActive));
  });
  updateRotateModeBadge(autoRotateEnabled);
  if (userTriggered) {
    showToastNotification(autoRotateEnabled ? "🔄 Auto-Rotate: ON" : "🔄 Auto-Rotate: OFF");
  }
  try {
    screenView?.contentWindow?.postMessage({
      type: "set-auto-rotate",
      enabled: autoRotateEnabled,
    }, "*");
  } catch (_) { }
}

function initAutoRotateControls() {
  document.querySelectorAll("[data-auto-rotate-choice]").forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      const choice = (btn.dataset.autoRotateChoice || "").toLowerCase();
      const targetEnabled = (choice === "on" || choice === "true" || choice === "1");
      applyAutoRotateSetting(targetEnabled, true);
    };
  });
  applyAutoRotateSetting(autoRotateEnabled, false);
}

function applyFitMode(mode) {
  const choice = (mode === "contain" || mode === "fill") ? mode : "autofit";
  currentFitMode = choice;
  try {
    localStorage.setItem("pane-fit-mode", currentFitMode);
  } catch (_) { }
  document.querySelectorAll("[data-fit-choice]").forEach((btn) => {
    const active = btn.dataset.fitChoice === currentFitMode;
    btn.classList.toggle("is-active", active);
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-checked", String(active));
  });
  if (currentFitMode === "autofit" && lastDeviceDimensions) {
    handleDeviceDimensions(lastDeviceDimensions.width, lastDeviceDimensions.height);
  }
  try {
    screenView?.contentWindow?.postMessage({ type: "set-fit-mode", mode: currentFitMode }, "*");
  } catch (_) { }
}

function applyCrop(crop, syncInputs = false) {
  currentCrop = {
    top: Math.max(0, Math.min(120, parseInt(crop?.top, 10) || 0)),
    bottom: Math.max(0, Math.min(120, parseInt(crop?.bottom, 10) || 0)),
    left: Math.max(0, Math.min(120, parseInt(crop?.left, 10) || 0)),
    right: Math.max(0, Math.min(120, parseInt(crop?.right, 10) || 0)),
  };
  localStorage.setItem("pane-crop-edges", JSON.stringify(currentCrop));

  if (syncInputs) {
    ["top", "bottom", "left", "right"].forEach((side) => {
      const slider = document.querySelector(`#crop-${side}-slider`);
      const numInput = document.querySelector(`#crop-${side}-num`);
      if (slider) slider.value = String(currentCrop[side]);
      if (numInput) numInput.value = String(currentCrop[side]);
    });
  }

  try {
    screenView?.contentWindow?.postMessage({ type: "set-crop", crop: currentCrop }, "*");
  } catch (_) { }
}

function initCropControls() {
  ["top", "bottom", "left", "right"].forEach((side) => {
    const slider = document.querySelector(`#crop-${side}-slider`);
    const numInput = document.querySelector(`#crop-${side}-num`);

    if (slider) {
      slider.value = String(currentCrop[side]);
      slider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10) || 0;
        if (numInput) numInput.value = String(val);
        currentCrop[side] = val;
        applyCrop(currentCrop, false);
      });
    }

    if (numInput) {
      numInput.value = String(currentCrop[side]);
      const handleNumChange = (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val)) val = 0;
        val = Math.max(0, Math.min(120, val));
        e.target.value = String(val);
        if (slider) slider.value = String(val);
        currentCrop[side] = val;
        applyCrop(currentCrop, false);
      };
      numInput.addEventListener("input", handleNumChange);
      numInput.addEventListener("change", handleNumChange);
    }
  });

  const btnSave = document.querySelector("#btn-save-crop");
  btnSave?.addEventListener("click", saveUserSettings);

  const btnReset = document.querySelector("#btn-reset-crop");
  btnReset?.addEventListener("click", async () => {
    applyCrop(DEFAULT_CROP, true);
    try {
      await postJson("/api/settings", { crop: DEFAULT_CROP });
    } catch (_) { }
  });
}

function applyTrackpadSpeed(speed, syncInputs = false) {
  let val = parseInt(speed, 10);
  if (isNaN(val)) val = 100;
  val = Math.max(30, Math.min(200, val));
  currentTrackpadSpeed = val;
  localStorage.setItem("pane-trackpad-speed", String(currentTrackpadSpeed));

  if (syncInputs) {
    const slider = document.querySelector("#trackpad-speed-slider");
    const numInput = document.querySelector("#trackpad-speed-num");
    if (slider) slider.value = String(currentTrackpadSpeed);
    if (numInput) numInput.value = String(currentTrackpadSpeed);
  }

  document.querySelectorAll("[data-speed-choice]").forEach((btn) => {
    const choice = parseInt(btn.dataset.speedChoice, 10);
    const active = choice === currentTrackpadSpeed;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-checked", String(active));
  });

  try {
    screenView?.contentWindow?.postMessage(
      { type: "set-trackpad-speed", speed: currentTrackpadSpeed },
      "*"
    );
  } catch (_) { }
}

async function saveTrackpadSpeed() {
  const btnSave = document.querySelector("#btn-save-speed");
  try {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = "Saving…";
    }
    localStorage.setItem("pane-trackpad-speed", String(currentTrackpadSpeed));

    await postJson("/api/settings", {
      trackpadSpeed: currentTrackpadSpeed,
    });

    applyTrackpadSpeed(currentTrackpadSpeed, true);

    if (btnSave) {
      btnSave.textContent = "✓ Speed Saved!";
      btnSave.classList.add("is-saved");
      setTimeout(() => {
        btnSave.textContent = "💾 Save Speed";
        btnSave.classList.remove("is-saved");
        btnSave.disabled = false;
      }, 1500);
    }
  } catch (err) {
    console.warn("saveTrackpadSpeed error:", err);
    if (btnSave) {
      btnSave.textContent = "Error saving";
      btnSave.disabled = false;
    }
  }
}

function initTrackpadSpeedControls() {
  const slider = document.querySelector("#trackpad-speed-slider");
  const numInput = document.querySelector("#trackpad-speed-num");

  if (slider) {
    slider.value = String(currentTrackpadSpeed);
    slider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10) || 100;
      if (numInput) numInput.value = String(val);
      applyTrackpadSpeed(val, false);
    });
  }

  if (numInput) {
    numInput.value = String(currentTrackpadSpeed);
    const handleNumChange = (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val)) val = 100;
      val = Math.max(30, Math.min(200, val));
      e.target.value = String(val);
      if (slider) slider.value = String(val);
      applyTrackpadSpeed(val, false);
    };
    numInput.addEventListener("input", handleNumChange);
    numInput.addEventListener("change", handleNumChange);
  }

  document.querySelectorAll("[data-speed-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const choice = parseInt(btn.dataset.speedChoice, 10);
      if (!isNaN(choice)) {
        applyTrackpadSpeed(choice, true);
      }
    });
  });

  const btnSave = document.querySelector("#btn-save-speed");
  btnSave?.addEventListener("click", saveTrackpadSpeed);
}

function applyKeyboardSettings(settings, syncInputs = false) {
  if (settings) {
    if (settings.crossPlatformShortcuts !== undefined) {
      currentKeyboardSettings.crossPlatformShortcuts = Boolean(settings.crossPlatformShortcuts);
    }
    if (settings.pastePcClipboard !== undefined) {
      currentKeyboardSettings.pastePcClipboard = Boolean(settings.pastePcClipboard);
    }
  }

  window.HandsetKeyboardSettings = currentKeyboardSettings;
  localStorage.setItem("pane-shortcuts", String(currentKeyboardSettings.crossPlatformShortcuts));
  localStorage.setItem("pane-paste-pc", String(currentKeyboardSettings.pastePcClipboard));

  if (syncInputs) {
    document.querySelectorAll("[data-shortcut-choice]").forEach((btn) => {
      const active = (btn.dataset.shortcutChoice === "true") === currentKeyboardSettings.crossPlatformShortcuts;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", String(active));
    });

    document.querySelectorAll("[data-paste-pc-choice]").forEach((btn) => {
      const active = (btn.dataset.pastePcChoice === "true") === currentKeyboardSettings.pastePcClipboard;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", String(active));
    });
  }

  try {
    screenView?.contentWindow?.postMessage(
      { type: "set-keyboard-settings", settings: currentKeyboardSettings },
      "*"
    );
  } catch (_) { }
}

async function saveKeyboardSettings() {
  try {
    await postJson("/api/settings", {
      crossPlatformShortcuts: currentKeyboardSettings.crossPlatformShortcuts,
      pastePcClipboard: currentKeyboardSettings.pastePcClipboard,
    });
  } catch (err) {
    console.warn("saveKeyboardSettings error:", err);
  }
}

function initKeyboardSettingsControls() {
  document.querySelectorAll("[data-shortcut-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyKeyboardSettings({ crossPlatformShortcuts: btn.dataset.shortcutChoice === "true" }, true);
      saveKeyboardSettings();
    });
  });

  document.querySelectorAll("[data-paste-pc-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyKeyboardSettings({ pastePcClipboard: btn.dataset.pastePcChoice === "true" }, true);
      saveKeyboardSettings();
    });
  });

  const COPY_IPHONE_LABEL = "📥 Copy iPhone Text (Alt+C)";
  const PASTE_PC_LABEL = "📋 Paste PC Text (Alt+V)";
  const CLEAR_COPY_CACHE_LABEL = "🧹 Clear Copy Cache (Alt+R)";
  const SCAN_QR_LABEL = "🔗 Grab Link (Alt+B)";

  window.triggerCopyIphoneTextWithFeedback = async function () {
    const btnCopyIphone = document.querySelector("#btn-copy-iphone-now");
    if (btnCopyIphone) {
      btnCopyIphone.disabled = true;
      btnCopyIphone.textContent = "⏳ Copying…";
    }
    try {
      if (typeof window.HandsetKeys?.flushTypedQueue === "function") {
        await window.HandsetKeys.flushTypedQueue();
      }
      const frameDataUrl = window.HandsetKeys?.captureMirrorCanvasDataUrl ? window.HandsetKeys.captureMirrorCanvasDataUrl() : null;
      const frameHistory = window.HandsetKeys?.getMirrorFrameHistory ? window.HandsetKeys.getMirrorFrameHistory() : [];
      let res;
      if (window.HandsetKeys?.triggerShortcut) {
        res = await window.HandsetKeys.triggerShortcut("copy", frameDataUrl, true, frameHistory);
      } else {
        res = await postJson("/api/keyboard/shortcut", { action: "copy", frameDataUrl, frameHistory, waitResult: true });
      }
      if (res?.autoClearedCache === true) {
        if (typeof window.clearOcrSessionMemory === "function") window.clearOcrSessionMemory();
        else window._ViewportHistory = [];
      }
      if (res?.text) {
        // Server has already written text directly to Windows PC clipboard via set_windows_clipboard_text().
        // Do NOT call navigator.clipboard.writeText() to avoid changing Windows clipboard sequence number!
        if (btnCopyIphone) {
          if (res?.source === "qr_bridge" || res?.source === "url_scanner") {
            btnCopyIphone.textContent = "✓ Link Copied to PC!";
          } else {
            btnCopyIphone.textContent = "✓ Copied to PC!";
          }
        }
      } else {
        if (btnCopyIphone) btnCopyIphone.textContent = "✓ Copied (iOS)";
      }
      if (btnCopyIphone) btnCopyIphone.classList.add("is-saved");
      return res;
    } catch (_) {
      if (btnCopyIphone) btnCopyIphone.textContent = "Copy Failed";
    } finally {
      setTimeout(() => {
        if (btnCopyIphone) {
          btnCopyIphone.textContent = COPY_IPHONE_LABEL;
          btnCopyIphone.classList.remove("is-saved");
          btnCopyIphone.disabled = false;
        }
      }, 1500);
    }
  };

  window.triggerPastePcTextWithFeedback = async function () {
    const btnPastePcNow = document.querySelector("#btn-paste-pc-now");
    if (btnPastePcNow) {
      btnPastePcNow.disabled = true;
      btnPastePcNow.textContent = "⏳ Pasting…";
    }
    try {
      if (window.HandsetKeys?.pasteFromPc) {
        await window.HandsetKeys.pasteFromPc(true);
      } else if (window.HandsetKeys?.triggerPasteFromPc) {
        await window.HandsetKeys.triggerPasteFromPc(false);
      } else {
        await postJson("/api/keyboard/paste", { force: true });
      }
      if (btnPastePcNow) {
        btnPastePcNow.textContent = "✓ Pasted!";
        btnPastePcNow.classList.add("is-saved");
      }
    } catch (_) {
      if (btnPastePcNow) btnPastePcNow.textContent = "Paste Failed";
    } finally {
      setTimeout(() => {
        if (btnPastePcNow) {
          btnPastePcNow.textContent = PASTE_PC_LABEL;
          btnPastePcNow.classList.remove("is-saved");
          btnPastePcNow.disabled = false;
        }
      }, 1200);
    }
  };

  window.triggerClearCopyCacheWithFeedback = async function () {
    const btnClearCache = document.querySelector("#btn-clear-copy-cache");
    if (btnClearCache) {
      btnClearCache.disabled = true;
      btnClearCache.textContent = "🧹 Clearing…";
    }
    try {
      window._ViewportHistory = [];
      const mirrorFrame = document.querySelector("#mirror-frame");
      if (mirrorFrame?.contentWindow) {
        mirrorFrame.contentWindow.postMessage({ type: "clear-viewport-history" }, "*");
        if (typeof mirrorFrame.contentWindow.clearViewportHistory === "function") {
          mirrorFrame.contentWindow.clearViewportHistory();
        } else if (typeof mirrorFrame.contentWindow.clearOcrSessionMemory === "function") {
          mirrorFrame.contentWindow.clearOcrSessionMemory();
        }
      }
      await Promise.allSettled([
        postJson("/api/keyboard/shortcut", { action: "clear-copy-cache" }),
        fetch("/api/ocr/clear-chunks", { method: "POST" }),
      ]);
      if (btnClearCache) {
        btnClearCache.textContent = "✓ Cache Cleared!";
        btnClearCache.classList.add("copied");
        btnClearCache.classList.add("is-saved");
      }
    } catch (_) {
      if (btnClearCache) btnClearCache.textContent = "Clear Failed";
    } finally {
      setTimeout(() => {
        if (btnClearCache) {
          btnClearCache.textContent = CLEAR_COPY_CACHE_LABEL || "🧹 Clear Copy Cache (Alt+R)";
          btnClearCache.classList.remove("copied");
          btnClearCache.classList.remove("is-saved");
          btnClearCache.disabled = false;
        }
      }, 1500);
    }
  };

  const btnPastePcNow = document.querySelector("#btn-paste-pc-now");
  btnPastePcNow?.addEventListener("click", () => {
    window.triggerPastePcTextWithFeedback();
  });

  const btnCopyIphone = document.querySelector("#btn-copy-iphone-now");
  btnCopyIphone?.addEventListener("click", () => {
    window.triggerCopyIphoneTextWithFeedback();
  });

  window.triggerScanQrLinkWithFeedback = async function () {
    const btnScanQr = document.querySelector("#btn-scan-qr-link");
    if (btnScanQr) {
      btnScanQr.disabled = true;
      btnScanQr.textContent = "⏳ Grabbing Copied Link…";
    }
    try {
      if (typeof window.HandsetKeys?.flushTypedQueue === "function") {
        await window.HandsetKeys.flushTypedQueue();
      }

      // Tahap 112: Single fast cycle (Capture -> Capture Head -> Close Spotlight IMMEDIATELY -> 1x batch OCR)
      // Step 1: Open Spotlight, paste clipboard, collapse selection with Right Arrow (handled in screen.py)
      await postJson("/api/device/spotlight-paste", {});

      // Step 2: frameTail = full clean paste frame (iPhone 17 Pro: whole multi-line URL; iPhone 11 Pro Max: Safari card + bottom bar tail)
      await new Promise((r) => setTimeout(r, 220));
      const frameTail = window.HandsetKeys?.captureMirrorCanvasDataUrl ? window.HandsetKeys.captureMirrorCanvasDataUrl() : null;

      // Step 3: Move cursor to head (Up Arrow + Cmd+Left, NO Cmd+A) and capture frameHead
      await postJson("/api/device/spotlight-move-head", {});
      await new Promise((r) => setTimeout(r, 180));
      const frameHead = window.HandsetKeys?.captureMirrorCanvasDataUrl ? window.HandsetKeys.captureMirrorCanvasDataUrl() : null;

      // Step 4: Close Spotlight RIGHT NOW (before OCR) so iPhone returns to the app in ~1.3s
      await postJson("/api/device/spotlight-close", {}).catch(() => { });

      // Step 5: Single OCR call with both frames
      const res = await postJson("/api/qr/scan", {
        frameDataUrl: frameTail || frameHead,
        tailFrameDataUrl: frameHead || frameTail,
        frames: [frameTail, frameHead].filter(Boolean),
        waitResult: true,
      });
      if (res?.ok && (res?.text || res?.extractedText)) {
        const textToCopy = res.text || res.extractedText;
        if (textToCopy && typeof document !== "undefined" && document.hasFocus() && navigator.clipboard?.writeText) {
          try {
            navigator.clipboard.writeText(textToCopy).catch(() => { });
          } catch (_) { }
        }
        if (btnScanQr) {
          btnScanQr.textContent = "✓ Link Copied to PC!";
          btnScanQr.classList.add("is-saved");
        }
      } else {
        if (btnScanQr) {
          btnScanQr.textContent = "⚠️ Link Belum Tersalin di iOS";
        }
      }
      return res;
    } catch (_) {
      if (btnScanQr) btnScanQr.textContent = "Grab Failed";
    } finally {
      setTimeout(() => {
        if (btnScanQr) {
          btnScanQr.textContent = SCAN_QR_LABEL;
          btnScanQr.classList.remove("is-saved");
          btnScanQr.disabled = false;
        }
      }, 1500);
    }
  };

  const btnClearCache = document.querySelector("#btn-clear-copy-cache");
  btnClearCache?.addEventListener("click", () => {
    window.triggerClearCopyCacheWithFeedback();
  });

  const btnScanQrLink = document.querySelector("#btn-scan-qr-link");
  btnScanQrLink?.addEventListener("click", () => {
    window.triggerScanQrLinkWithFeedback();
  });

  const btnQrSetupGuide = document.querySelector("#btn-qr-setup-guide");
  const qrSetupGuideBox = document.querySelector("#qr-setup-guide-box");
  btnQrSetupGuide?.addEventListener("click", () => {
    if (qrSetupGuideBox) {
      const isHidden = qrSetupGuideBox.style.display === "none" || !qrSetupGuideBox.style.display;
      qrSetupGuideBox.style.display = isHidden ? "block" : "none";
    }
  });

  // Global keydown on window to catch cross-platform shortcuts (Alt+C, Alt+V, Alt+R, Alt+G) with capture phase
  window.addEventListener(
    "keydown",
    (e) => {
      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === "KeyC" || e.key === "c" || e.key === "C")) {
        e.preventDefault();
        e.stopPropagation();
        window.triggerCopyIphoneTextWithFeedback();
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === "KeyV" || e.key === "v" || e.key === "V")) {
        e.preventDefault();
        e.stopPropagation();
        window.triggerPastePcTextWithFeedback();
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === "KeyR" || e.key === "r" || e.key === "R")) {
        e.preventDefault();
        e.stopPropagation();
        window.triggerClearCopyCacheWithFeedback();
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === "KeyB" || e.key === "b" || e.key === "B")) {
        e.preventDefault();
        e.stopPropagation();
        window.triggerScanQrLinkWithFeedback();
      }
    },
    true,
  );

  const btnToggleOnscreen = document.querySelector("#btn-toggle-onscreen-kb");
  btnToggleOnscreen?.addEventListener("click", async () => {
    btnToggleOnscreen.disabled = true;
    const oldText = btnToggleOnscreen.textContent;
    btnToggleOnscreen.textContent = "Toggling…";
    try {
      if (window.HandsetKeys?.toggleOnscreenKeyboard) {
        await window.HandsetKeys.toggleOnscreenKeyboard();
      } else {
        await postJson("/api/keyboard/toggle-onscreen", {});
      }
      btnToggleOnscreen.textContent = "✓ Toggled!";
      btnToggleOnscreen.classList.add("is-saved");
    } catch (_) {
      btnToggleOnscreen.textContent = "Failed";
    } finally {
      setTimeout(() => {
        btnToggleOnscreen.textContent = oldText;
        btnToggleOnscreen.classList.remove("is-saved");


// Initialize controls on load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupEarlyControls);
} else {
  setupEarlyControls();
}


// Keyboard shortcuts for mac-mode
document.addEventListener("keydown", (e) => {
  if (!e.altKey) return;
  if (e.key === "s" || e.key === "S") {
    e.preventDefault();
    document.querySelector("#btn-settings")?.click();
  } else if (e.key === "r" || e.key === "R") {
    e.preventDefault();
    fetch("/api/screen/restart", { method: "POST" }).catch(() => {});
  } else if (e.key === "q" || e.key === "Q") {
    e.preventDefault();
    window.pywebview?.api?.close?.();
  } else if (e.key === "m" || e.key === "M") {
    e.preventDefault();
    window.pywebview?.api?.minimize?.();
  }
});


// Sidebar button handlers
document.querySelector("#sidebar-settings")?.addEventListener("click", () => {
  document.querySelector("#btn-settings")?.click();
});
document.querySelector("#sidebar-restart")?.addEventListener("click", () => {
  fetch("/api/screen/restart", { method: "POST" }).catch(() => {});
});
document.querySelector("#sidebar-audio")?.addEventListener("click", () => {
  document.querySelector("#btn-audio-top")?.click();
});
document.querySelector("#sidebar-minimize")?.addEventListener("click", () => {
  window.pywebview?.api?.minimize?.();
});
document.querySelector("#sidebar-close")?.addEventListener("click", () => {
  window.pywebview?.api?.close?.();
});


// Reverse hover logic: hide toolbar when hovering screen
(function() {
  const appBar = document.querySelector(".app-bar");
  const phoneScreen = document.querySelector("#phone-screen, #phone-shell, .screen-stage");
  
  if (!appBar || !phoneScreen) return;
  
  // Show toolbar by default
  appBar.style.opacity = "1";
  appBar.style.pointerEvents = "auto";
  
  // Hide when hovering phone screen
  phoneScreen.addEventListener("mouseenter", () => {
    appBar.style.opacity = "0";
    appBar.style.pointerEvents = "none";
  });
  
  // Show when leaving phone screen
  phoneScreen.addEventListener("mouseleave", () => {
    appBar.style.opacity = "1";
    appBar.style.pointerEvents = "auto";
  });
  
  // Keep visible when hovering toolbar
  appBar.addEventListener("mouseenter", () => {
    appBar.style.opacity = "1";
    appBar.style.pointerEvents = "auto";
  });
})();
