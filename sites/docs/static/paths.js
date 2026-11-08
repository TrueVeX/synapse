// Floating paths background (21st.dev/@bundui/components/floating-paths):
// 16 parallel curved lines that slowly flow and never cross. Drawn on a canvas at
// 30fps (animating SVG strokes repaints the whole page every frame and made
// the glass panels stutter). Pauses when the tab is hidden, with reduced
// motion, or when the live background is turned off.
(function () {
  "use strict";
  var host = document.querySelector(".live-bg");
  if (!host || !document.createElement("canvas").getContext) return;
  var NS = "http://www.w3.org/2000/svg";
  var VB_W = 696, VB_H = 316;
  function rand(n) { var x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); }

  // 16 copies of one curve, each shifted up and to the right by the same
  // step. The curve only ever moves right and down, so shifted copies can
  // never cross (checked: 0 of 120 pairs intersect); they stay >= 12 units
  // apart, much more than their width.
  var LINES = 16, STEP_X = 12, STEP_Y = -14;
  var measure = document.createElementNS(NS, "path");
  var paths = [];
  for (var i = 0; i < LINES; i++) {
    var x = i * STEP_X, y = i * STEP_Y;
    var d = "M" + (-380 + x) + " " + (-189 + y) + "C" + (-380 + x) + " " + (-189 + y) + " " + (-312 + x) + " " + (216 + y) + " " + (152 + x) + " " + (343 + y) +
      "C" + (616 + x) + " " + (470 + y) + " " + (684 + x) + " " + (875 + y) + " " + (684 + x) + " " + (875 + y);
    measure.setAttribute("d", d);
    paths.push({
      shape: new Path2D(d),
      length: measure.getTotalLength(),
      width: 0.6 + i * 0.06,
      opacity: 0.15 + i * 0.05,
      duration: (20 + rand(i + 100) * 10) * 1000,
      phase: rand(i * 7 + 31)
    });
  }

  var canvas = document.createElement("canvas");
  canvas.className = "floating-paths";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var width = 0, height = 0, dpr = 1, scale = 1, ox = 0, oy = 0, last = -1e9, lastTheme = "";

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    scale = Math.max(width / VB_W, height / VB_H); // like preserveAspectRatio="xMidYMid slice"
    ox = (width - VB_W * scale) / 2; oy = (height - VB_H * scale) / 2;
    last = -1e9;
  }
  function moving() {
    return !reduce.matches && document.documentElement.dataset.liveBg !== "off";
  }
  function draw(now) {
    var rgb = getComputedStyle(canvas).color || "#fff";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    ctx.strokeStyle = rgb;
    ctx.lineCap = "round";
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      var t = (now / p.duration + p.phase) % 1;
      var pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 4);
      ctx.globalAlpha = Math.min(1, p.opacity) * (0.5 + 0.5 * pulse) * 0.5;
      ctx.lineWidth = p.width;
      ctx.setLineDash([p.length * 0.6, p.length * 0.4]);
      ctx.lineDashOffset = -p.length * t;
      ctx.stroke(p.shape);
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    var theme = (document.documentElement.dataset.theme || "") + document.documentElement.className;
    if (theme !== lastTheme) { lastTheme = theme; last = -1e9; }
    var still = !moving();
    if (still ? last > 0 : now - last < 1000 / 30) return;
    last = still ? 1 : now;
    draw(still ? 0 : now);
  }
  var timer = 0;
  window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(resize, 150); });
  resize();
  requestAnimationFrame(frame);
})();
