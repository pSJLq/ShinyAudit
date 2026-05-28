"use client";

import { useEffect, useRef } from "react";

/**
 * Wide horizontal pixel-cluster band stretched across the viewport.
 * Renders nothing in the React tree — appends a fixed <video> + poster
 * straight into document.body so the chat layout can position freely on top.
 */
export function VideoBg() {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    const wrap = document.createElement("div");
    wrap.className = "video-bg-wrap";
    wrap.setAttribute("aria-hidden", "true");

    const stage = document.createElement("div");
    stage.className = "video-bg-stage";
    wrap.appendChild(stage);

    const poster = document.createElement("div");
    poster.className = "video-bg-poster";
    stage.appendChild(poster);

    const v = document.createElement("video");
    v.className = "video-bg";
    v.src = "/assets/bg-clusters.mp4";
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.autoplay = true;
    v.preload = "auto";
    v.setAttribute("aria-hidden", "true");
    v.playbackRate = 0.55;
    stage.appendChild(v);

    const onCanPlay = () => {
      v.classList.add("is-ready");
      v.play().catch(() => {});
    };
    v.addEventListener("canplay", onCanPlay);
    const tryPlay = () => {
      v.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", tryPlay);

    // Insert into the chat-root container (so styles apply) — fall back to body.
    const host = document.querySelector(".chat-root") ?? document.body;
    host.appendChild(wrap);

    return () => {
      v.removeEventListener("canplay", onCanPlay);
      document.removeEventListener("visibilitychange", tryPlay);
      wrap.remove();
      mounted.current = false;
    };
  }, []);

  return null;
}
