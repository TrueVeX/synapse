// Floating paths background (21st.dev/@bundui/components/floating-paths),
// as plain SVG + CSS: two mirrored sets of 36 curved lines that slowly flow.
(function () {
  "use strict";
  var host = document.querySelector(".live-bg");
  if (!host) return;
  var NS = "http://www.w3.org/2000/svg";
  function rand(n) { var x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); }
  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "floating-paths");
  svg.setAttribute("viewBox", "0 0 696 316");
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  [1, -1].forEach(function (position) {
    var g = document.createElementNS(NS, "g");
    for (var i = 0; i < 36; i++) {
      var s = i * 5 * position;
      var d = "M-" + (380 - s) + " -" + (189 + i * 6) + "C-" + (380 - s) + " -" + (189 + i * 6) + " -" + (312 - s) + " " + (216 - i * 6) + " " + (152 - s) + " " + (343 - i * 6) +
        "C" + (616 - s) + " " + (470 - i * 6) + " " + (684 - s) + " " + (875 - i * 6) + " " + (684 - s) + " " + (875 - i * 6);
      var dur = 20 + rand(i + position * 100) * 10;
      var p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("pathLength", "1");
      p.setAttribute("stroke", "currentColor");
      p.setAttribute("stroke-width", (0.5 + i * 0.03).toFixed(2));
      p.setAttribute("stroke-opacity", (0.1 + i * 0.03).toFixed(2));
      p.style.animationDuration = dur.toFixed(2) + "s, " + (dur / 2).toFixed(2) + "s";
      p.style.animationDelay = (-rand(i * 7 + position * 31) * 30).toFixed(2) + "s";
      g.appendChild(p);
    }
    svg.appendChild(g);
  });
  host.appendChild(svg);
})();
