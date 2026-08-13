/**
 * background.js — service worker for SheetPilot AI v3.
 *
 * Handles toolbar toggle events & background message relaying.
 */

chrome.action.onClicked.addListener(async (tab) => {
  // Only inject into normal http/https pages
  if (!tab || !tab.url || (!tab.url.startsWith("http://") && !tab.url.startsWith("https://"))) {
    return;
  }

  try {
    // Try sending toggle message — works if content script already injected
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" });
  } catch {
    // Content script not yet injected (e.g. extension just reloaded) — inject it first
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content_script.js"],
      });
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" }).catch(() => {});
      }, 150);
    } catch (e) {
      console.warn("[SheetPilot] Cannot inject into tab:", e);
    }
  }
});

// Relay GET_PAGE_TEXT from popup/panel to content script of active tab
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_PAGE_TEXT") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0] || !tabs[0].id) {
        sendResponse({ error: "No active tab found" });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { type: "GET_PAGE_TEXT_INTERNAL" }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      });
    });
    return true; // Asynchronous response
  }
});

