(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (window.__STOREONE_WIDGET_LOADED__) {
    return;
  }

  const currentScript =
    document.currentScript ||
    document.querySelector('script[data-store-id][src*="widget.js"]') ||
    document.querySelector("script[data-store-id]");

  if (!currentScript) {
    return;
  }

  const rawStoreId = currentScript.getAttribute("data-store-id");
  const storeId = rawStoreId ? rawStoreId.trim() : "";

  if (!storeId) {
    console.warn(
      "[StoreOne Widget] Missing data-store-id attribute on script tag."
    );
    return;
  }

  const rawChannelId = currentScript.getAttribute("data-channel-id");
  const channelId = rawChannelId ? rawChannelId.trim() : "";

  window.__STOREONE_WIDGET_LOADED__ = true;

  let origin = window.location.origin;
  const scriptSrc = currentScript.getAttribute("src") || currentScript.src;
  if (scriptSrc) {
    try {
      origin = new URL(scriptSrc, window.location.href).origin;
    } catch {
      origin = window.location.origin;
    }
  }

  const iframeUrl =
    origin +
    "/widget/" +
    encodeURIComponent(storeId) +
    (channelId ? "?channelId=" + encodeURIComponent(channelId) : "");

  const CHAT_ICON_SVG =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
  const CLOSE_ICON_SVG =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  function mountWidget() {
    if (!document.body || document.getElementById("storeone-widget-btn")) {
      return;
    }

    const styleEl = document.createElement("style");
    styleEl.id = "storeone-widget-styles";
    styleEl.textContent = [
      "#storeone-widget-btn {",
      "  position: fixed;",
      "  right: 20px;",
      "  bottom: 20px;",
      "  z-index: 2147483647;",
      "  width: 56px;",
      "  height: 56px;",
      "  border: 0;",
      "  border-radius: 9999px;",
      "  background: #4f46e5;",
      "  color: #ffffff;",
      "  display: inline-flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "  cursor: pointer;",
      "  box-shadow: 0 12px 28px rgba(79, 70, 229, 0.35), 0 4px 10px rgba(15, 23, 42, 0.12);",
      "  transition: transform 0.18s ease, background-color 0.18s ease;",
      "}",
      "#storeone-widget-btn:hover {",
      "  background: #4338ca;",
      "  transform: translateY(-2px);",
      "}",
      "#storeone-widget-btn:active {",
      "  transform: scale(0.96);",
      "}",
      "#storeone-widget-btn:focus-visible {",
      "  outline: 3px solid #a5b4fc;",
      "  outline-offset: 2px;",
      "}",
      "#storeone-widget-frame-wrap {",
      "  position: fixed;",
      "  right: 20px;",
      "  bottom: 88px;",
      "  z-index: 2147483646;",
      "  width: 380px;",
      "  height: 560px;",
      "  max-width: calc(100vw - 32px);",
      "  max-height: calc(100vh - 110px);",
      "  border-radius: 16px;",
      "  overflow: hidden;",
      "  background: #ffffff;",
      "  border: 1px solid #e2e8f0;",
      "  box-shadow: 0 22px 48px rgba(15, 23, 42, 0.2), 0 4px 14px rgba(15, 23, 42, 0.08);",
      "  display: none;",
      "}",
      "@media (max-width: 480px) {",
      "  #storeone-widget-btn {",
      "    right: 16px;",
      "    bottom: 16px;",
      "  }",
      "  #storeone-widget-frame-wrap {",
      "    right: 12px;",
      "    left: 12px;",
      "    bottom: 82px;",
      "    width: auto;",
      "    max-width: none;",
      "    height: 70vh;",
      "    max-height: calc(100vh - 98px);",
      "  }",
      "}",
    ].join("\n");
    document.head.appendChild(styleEl);

    const frameWrap = document.createElement("div");
    frameWrap.id = "storeone-widget-frame-wrap";
    frameWrap.setAttribute("role", "dialog");
    frameWrap.setAttribute("aria-label", "Store chat assistant");

    const iframe = document.createElement("iframe");
    iframe.title = "StoreOne Chat";
    iframe.setAttribute("allow", "clipboard-write");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    frameWrap.appendChild(iframe);

    const button = document.createElement("button");
    button.id = "storeone-widget-btn";
    button.type = "button";
    button.setAttribute("aria-label", "Open support chat");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = CHAT_ICON_SVG;

    let isOpen = false;
    let hasLoadedIframe = false;

    function setOpen(nextOpen) {
      isOpen = Boolean(nextOpen);
      if (isOpen && !hasLoadedIframe) {
        iframe.src = iframeUrl;
        hasLoadedIframe = true;
      }

      frameWrap.style.display = isOpen ? "block" : "none";
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
      button.setAttribute(
        "aria-label",
        isOpen ? "Close support chat" : "Open support chat"
      );
      button.innerHTML = isOpen ? CLOSE_ICON_SVG : CHAT_ICON_SVG;
    }

    button.addEventListener("click", function () {
      setOpen(!isOpen);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && isOpen) {
        setOpen(false);
      }
    });

    window.addEventListener("message", function (event) {
      if (event.origin !== origin) {
        return;
      }
      if (
        event.data &&
        (event.data.type === "storeone:close" ||
          event.data.type === "storemind:close")
      ) {
        setOpen(false);
      }
    });

    document.body.appendChild(frameWrap);
    document.body.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWidget);
  } else {
    mountWidget();
  }
})();
