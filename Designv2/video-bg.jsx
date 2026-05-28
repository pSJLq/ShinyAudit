/* video-bg.jsx — wide horizontal pixel-cluster band stretched across the
   viewport. The source video's grid already extends to the frame edges so
   we just cover() it edge-to-edge — no masking, no abrupt cuts.            */

const { useEffect: useVbgEffect } = React;

function VideoBg() {
  useVbgEffect(() => {
    const wrap = document.createElement("div");
    wrap.className = "video-bg-wrap";
    wrap.setAttribute("aria-hidden", "true");

    const stage = document.createElement("div");
    stage.className = "video-bg-stage";
    wrap.appendChild(stage);

    // immediate static poster
    const poster = document.createElement("div");
    poster.className = "video-bg-poster";
    stage.appendChild(poster);

    // animated video, fades in once buffered
    const v = document.createElement("video");
    v.className = "video-bg";
    v.src = "assets/bg-clusters.mp4";
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
    const tryPlay = () => v.play().catch(() => {});
    document.addEventListener("visibilitychange", tryPlay);

    document.body.appendChild(wrap);

    return () => {
      v.removeEventListener("canplay", onCanPlay);
      document.removeEventListener("visibilitychange", tryPlay);
      wrap.remove();
    };
  }, []);

  return null;
}

window.VideoBg = VideoBg;
