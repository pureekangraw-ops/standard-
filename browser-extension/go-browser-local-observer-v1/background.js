browser.runtime.onMessage.addListener(async message => {
  if (!message || message.type !== "GO_OBSERVER_SCREENSHOT") return undefined;
  if (message.consentGranted !== true) return { ok: false, code: "SCREENSHOT_CONSENT_REQUIRED" };
  if (message.safeToCapture !== true) return { ok: false, code: "SENSITIVE_CONTENT_BLOCKED" };
  try {
    const dataUrl = await browser.tabs.captureVisibleTab(undefined, { format: "jpeg", quality: 65 });
    return { ok: true, code: null, dataUrl };
  } catch {
    return { ok: false, code: "SENSITIVE_CONTENT_BLOCKED" };
  }
});
