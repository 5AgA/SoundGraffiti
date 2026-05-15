import React, { useEffect } from "react";
import "./Layout.css";

const APP_VIEWPORT_HEIGHT_VAR = "--app-viewport-height";

function isEditableClipboardTarget(rawTarget) {
  const node =
    rawTarget instanceof Element
      ? rawTarget
      : rawTarget?.parentElement ?? null;
  if (!(node instanceof Element)) return false;
  return Boolean(
    node.closest(
      'input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), select:not([disabled]), [contenteditable="true"]',
    ),
  );
}

const Layout = ({ children, fullContent = false }) => {
  useEffect(() => {
    let frameId = 0;

    const updateViewportHeight = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const height = window.visualViewport?.height ?? window.innerHeight;
        if (Number.isFinite(height) && height > 0) {
          document.documentElement.style.setProperty(
            APP_VIEWPORT_HEIGHT_VAR,
            `${Math.round(height)}px`,
          );
        }
      });
    };

    updateViewportHeight();

    window.addEventListener("resize", updateViewportHeight);
    window.addEventListener("orientationchange", updateViewportHeight);
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("orientationchange", updateViewportHeight);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
    };
  }, []);

  useEffect(() => {
    const stopClipboardUnlessEditable = (e) => {
      if (isEditableClipboardTarget(e.target)) return;
      e.preventDefault();
    };
    document.addEventListener("copy", stopClipboardUnlessEditable, true);
    document.addEventListener("cut", stopClipboardUnlessEditable, true);
    document.addEventListener("paste", stopClipboardUnlessEditable, true);
    return () => {
      document.removeEventListener("copy", stopClipboardUnlessEditable, true);
      document.removeEventListener("cut", stopClipboardUnlessEditable, true);
      document.removeEventListener("paste", stopClipboardUnlessEditable, true);
    };
  }, []);

  return (
    <div className={`app-container ${fullContent ? "full-mode" : ""}`}>
      {/* 배경이나 지도는 여기에 배치 (노치까지 확장) */}
      <main className="main-content">{children}</main>
    </div>
  );
};

export default Layout;
