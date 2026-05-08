import React from "react";
import "./Layout.css";

const Layout = ({ children, fullContent = false }) => {
  return (
    <div className={`app-container ${fullContent ? "full-mode" : ""}`}>
      {/* 배경이나 지도는 여기에 배치 (노치까지 확장) */}
      <main className="main-content">{children}</main>
    </div>
  );
};

export default Layout;
