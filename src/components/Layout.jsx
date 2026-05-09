import React, { useEffect } from "react";
import "./Layout.css";

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
