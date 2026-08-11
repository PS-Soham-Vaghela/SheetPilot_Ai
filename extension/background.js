/**
 * background.js — service worker for SheetPilot AI v2.
 *
 * Toolbar icon click → sends TOGGLE_OVERLAY to the active tab's content script.
 * The content script creates the overlay on first toggle, then shows/hides it.
 */

chrome.action.onClicked.addListener(async (tab) => {
  // Only inject into normal http/https pages
  if (!tab.url || (!tab.url.startsWith("http://") && !tab.url.startsWith("https://"))) {
    return;
  }

  try {
    // Try sending toggle message — works if content script already injected
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" });
  } catch {
    // Content script not yet injected (e.g. extension just reloaded) — inject it first
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content_script.js"],
    });
    // Small delay for script to initialise, then toggle
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" }).catch(() => {});
    }, 150);
  }
});
