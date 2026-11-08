// SYNAPSE landing page interactions. No libraries.
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Navigation ---------------- */
  var nav = document.querySelector(".nav");
  var menuButton = document.querySelector(".nav__menu");
  var links = document.getElementById("nav-links");

  function onScroll() {
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var onMenuChange = function () {};
  function closeMenu() {
    links.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open menu");
    onMenuChange();
  }
  menuButton.addEventListener("click", function () {
    var open = !links.classList.contains("is-open");
    links.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    onMenuChange();
  });
  links.addEventListener("click", function (event) {
    if (event.target.closest("a")) closeMenu();
  });
  // Tapping anywhere outside the open menu closes it.
  document.addEventListener("click", function (event) {
    if (links.classList.contains("is-open") && !event.target.closest(".nav")) closeMenu();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeMenu();
  });

  /* ---------------- Scroll reveal ---------------- */
  var revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var revealer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealItems.forEach(function (item) {
      revealer.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add("is-visible");
    });
  }

  /* ---------------- Count-up facts ---------------- */
  var counters = document.querySelectorAll("[data-count]");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var counterObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var target = Number(el.getAttribute("data-count"));
          var start = performance.now();
          var duration = 1100;
          (function tick(now) {
            var t = Math.min(1, (now - start) / duration);
            var eased = 1 - Math.pow(1 - t, 3);
            el.textContent = String(Math.round(target * eased));
            if (t < 1) requestAnimationFrame(tick);
          })(start);
          counterObserver.unobserve(el);
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach(function (el) {
      el.textContent = "0";
      counterObserver.observe(el);
    });
  }

  /* ---------------- Example tabs ---------------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs [role="tab"]'));
  var answerTimer = null;

  function playPanel(panel) {
    clearTimeout(answerTimer);
    panel.classList.remove("is-answered");
    if (reduceMotion) {
      panel.classList.add("is-answered");
      return;
    }
    panel.classList.add("is-thinking");
    answerTimer = setTimeout(function () {
      panel.classList.remove("is-thinking");
      panel.classList.add("is-answered");
      var items = panel.querySelectorAll(".answer > *");
      items.forEach(function (item, index) {
        item.style.transitionDelay = index * 140 + "ms";
      });
    }, 900);
  }

  function selectTab(tab, focus) {
    tabs.forEach(function (other) {
      var selected = other === tab;
      other.setAttribute("aria-selected", String(selected));
      other.tabIndex = selected ? 0 : -1;
      var panel = document.getElementById(other.getAttribute("aria-controls"));
      panel.hidden = !selected;
      if (selected) playPanel(panel);
    });
    if (focus) tab.focus();
    tab.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () {
      selectTab(tab, false);
    });
    tab.addEventListener("keydown", function (event) {
      var next = null;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === "Home") next = tabs[0];
      if (event.key === "End") next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        selectTab(next, true);
      }
    });
  });

  // Play the first example when the gallery scrolls into view.
  var gallery = document.querySelector(".gallery");
  if (gallery && "IntersectionObserver" in window) {
    var galleryObserver = new IntersectionObserver(
      function (entries) {
        if (entries[0].isIntersecting) {
          var current = tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0];
          if (current) playPanel(document.getElementById(current.getAttribute("aria-controls")));
          galleryObserver.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    galleryObserver.observe(gallery);
  } else if (tabs[0]) {
    playPanel(document.getElementById(tabs[0].getAttribute("aria-controls")));
  }

  /* ---------------- Billing toggle ---------------- */
  var billingButtons = document.querySelectorAll("[data-billing]");
  billingButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var mode = button.getAttribute("data-billing");
      billingButtons.forEach(function (b) {
        b.setAttribute("aria-checked", String(b === button));
      });
      document.querySelectorAll(".plans [data-monthly]").forEach(function (el) {
        el.textContent = el.getAttribute(mode === "yearly" ? "data-yearly" : "data-monthly");
      });
    });
  });

  /* ---------------- Downloads: recommend for this device ---------------- */
  var ua = navigator.userAgent || "";
  var platform = /Android/i.test(ua) ? "android" : /Windows/i.test(ua) ? "windows" : "web";
  var card = document.querySelector('.dl[data-platform="' + platform + '"]');
  if (card) card.classList.add("is-recommended");

  /* ---------------- Phones: floating download bar ---------------- */
  var cta = document.querySelector(".mobile-cta");
  if (cta) {
    var ctaTitle = cta.querySelector("[data-cta-title]");
    var ctaSub = cta.querySelector("[data-cta-sub]");
    var ctaLink = cta.querySelector("[data-cta-link]");
    if (platform === "android") {
      ctaTitle.textContent = "SYNAPSE for Android";
      ctaSub.textContent = "Free · " + ((document.querySelector("[data-apk-size]") || {}).textContent || "small download") + " · Android 7.0+";
      ctaLink.textContent = "Get the app";
      ctaLink.setAttribute("href", "#download");
    } else if (platform === "windows") {
      ctaTitle.textContent = "SYNAPSE for Windows";
      ctaSub.textContent = "Free · Windows 10 and 11";
      ctaLink.textContent = "Download";
      ctaLink.setAttribute("href", "#download");
    }

    var heroEl = document.querySelector(".hero");
    var hideZones = [document.getElementById("download"), document.querySelector(".footer")].filter(Boolean);
    var pastHero = false;
    var inHideZone = false;
    var updateCta = function () {
      var menuOpen = links.classList.contains("is-open");
      cta.classList.toggle("is-shown", pastHero && !inHideZone && !menuOpen);
    };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        pastHero = !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0;
        updateCta();
      }).observe(heroEl);
      var visibleZones = new Set();
      var zoneObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visibleZones.add(entry.target); else visibleZones.delete(entry.target);
        });
        inHideZone = visibleZones.size > 0;
        updateCta();
      }, { rootMargin: "0px 0px -10% 0px" });
      hideZones.forEach(function (zone) { zoneObserver.observe(zone); });
      onMenuChange = updateCta;
    }
  }

  /* ---------------- Copy checksums ---------------- */
  document.querySelectorAll(".copy").forEach(function (button) {
    button.addEventListener("click", function () {
      var code = button.parentElement.querySelector("code");
      var text = code ? code.textContent.trim() : "";
      var done = function () {
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = "Copy"; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      } else {
        var range = document.createRange();
        range.selectNodeContents(code);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });
  });

  /* ---------------- Year ---------------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---------------- Hero: interactive synapse network ---------------- */
  var stage = document.querySelector(".hero__stage");
  var canvas = document.getElementById("hero-canvas");
  if (!stage || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");

  // Touch screens: swipe instead of drag, and a lighter frame rate to save battery.
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var hint = document.querySelector(".hero__hint");
  if (coarse && hint) hint.lastChild.textContent = " Swipe to explore";
  var frameGap = coarse ? 1000 / 30 : 0;
  var lastFrame = 0;

  var COLORS = { warm: [255, 255, 255], violet: [163, 163, 163], light: [250, 250, 250] };
  var nodes = [];
  var pulses = [];
  var width = 0;
  var height = 0;
  var dpr = 1;
  var rotY = 0.4;
  var rotX = -0.25;
  var spinY = 0.0016;
  var spinX = 0;
  var pointer = { x: -9999, y: -9999, active: false };
  var dragging = false;
  var lastX = 0;
  var lastY = 0;
  var running = false;
  var visible = true;

  function rand(min, max) { return min + Math.random() * (max - min); }

  function buildNodes() {
    var count = width < 640 ? 52 : width < 1000 ? 80 : 110;
    nodes = [];
    for (var i = 0; i < count; i++) {
      // Points inside a sphere, denser toward the middle like a neuron cluster.
      var u = Math.random();
      var r = Math.pow(u, 0.65);
      var theta = rand(0, Math.PI * 2);
      var phi = Math.acos(rand(-1, 1));
      nodes.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta) * 0.78,
        z: r * Math.cos(phi),
        vx: rand(-1, 1) * 0.0006,
        vy: rand(-1, 1) * 0.0006,
        vz: rand(-1, 1) * 0.0006,
        size: rand(0.8, 2.2) * (Math.random() < 0.08 ? 2 : 1),
        tint: Math.random() < 0.72 ? "warm" : "violet",
        px: 0, py: 0, pz: 0, ps: 1
      });
    }
  }

  function resize() {
    var rect = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildNodes();
    if (!running) draw();
  }

  function project() {
    var cy = Math.cos(rotY), sy = Math.sin(rotY);
    var cx = Math.cos(rotX), sx = Math.sin(rotX);
    // Fill the frame: wide screens spread the network out, phones keep it centred.
    var scale = Math.min(width * (width < 640 ? 0.44 : 0.34), height * 0.62);
    var focal = 2.6;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var x1 = n.x * cy - n.z * sy;
      var z1 = n.x * sy + n.z * cy;
      var y1 = n.y * cx - z1 * sx;
      var z2 = n.y * sx + z1 * cx;
      var persp = focal / (focal + z2);
      n.px = width / 2 + x1 * scale * persp * (width > height * 1.4 ? 1.35 : 1);
      n.py = height / 2 + y1 * scale * persp;
      n.pz = z2;
      n.ps = persp;
    }
  }

  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"; }

  function draw() {
    project();
    ctx.clearRect(0, 0, width, height);
    var linkDist = 0.42;
    var edges = [];

    // Connections
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      for (var j = i + 1; j < nodes.length; j++) {
        var b = nodes[j];
        var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < linkDist) {
          var depth = (a.ps + b.ps) / 2;
          var alpha = (1 - d / linkDist) * 0.32 * Math.pow(depth, 2.2);
          var near = pointer.active
            ? Math.max(0, 1 - Math.hypot((a.px + b.px) / 2 - pointer.x, (a.py + b.py) / 2 - pointer.y) / 160)
            : 0;
          ctx.strokeStyle = rgba(near > 0 ? COLORS.light : COLORS[a.tint], Math.min(0.9, alpha + near * 0.5));
          ctx.lineWidth = 0.7 + near * 0.8;
          ctx.beginPath();
          ctx.moveTo(a.px, a.py);
          ctx.lineTo(b.px, b.py);
          ctx.stroke();
          edges.push([i, j]);
        }
      }
    }

    // Signals travelling along connections
    if (!reduceMotion && edges.length && Math.random() < 0.18 && pulses.length < 26) {
      var e = edges[(Math.random() * edges.length) | 0];
      pulses.push({ a: e[0], b: e[1], t: 0, speed: rand(0.012, 0.03), tint: Math.random() < 0.7 ? "warm" : "violet" });
    }
    for (var p = pulses.length - 1; p >= 0; p--) {
      var pulse = pulses[p];
      pulse.t += pulse.speed;
      if (pulse.t >= 1) { pulses.splice(p, 1); continue; }
      var na = nodes[pulse.a], nb = nodes[pulse.b];
      var x = na.px + (nb.px - na.px) * pulse.t;
      var y = na.py + (nb.py - na.py) * pulse.t;
      var glow = ctx.createRadialGradient(x, y, 0, x, y, 10);
      glow.addColorStop(0, rgba(COLORS[pulse.tint], 0.9));
      glow.addColorStop(1, rgba(COLORS[pulse.tint], 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nodes (far ones first)
    var order = nodes.slice().sort(function (m, n) { return n.pz - m.pz; });
    for (var k = 0; k < order.length; k++) {
      var node = order[k];
      var radius = node.size * node.ps * 1.6;
      var hover = pointer.active ? Math.max(0, 1 - Math.hypot(node.px - pointer.x, node.py - pointer.y) / 120) : 0;
      ctx.fillStyle = rgba(hover > 0.2 ? COLORS.light : COLORS[node.tint], Math.min(1, 0.35 + node.ps * 0.45 + hover));
      ctx.beginPath();
      ctx.arc(node.px, node.py, radius + hover * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step(now) {
    if (!running) return;
    if (frameGap && now - lastFrame < frameGap) {
      requestAnimationFrame(step);
      return;
    }
    lastFrame = now;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += n.vx; n.y += n.vy; n.z += n.vz;
      var r = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
      if (r > 1) { n.vx -= n.x * 0.00008; n.vy -= n.y * 0.00008; n.vz -= n.z * 0.00008; }
    }
    if (!dragging) {
      spinY += (0.0016 - spinY) * 0.02;
      spinX += (0 - spinX) * 0.05;
    }
    rotY += spinY;
    rotX = Math.max(-1.1, Math.min(1.1, rotX + spinX));
    draw();
    requestAnimationFrame(step);
  }

  function start() {
    if (running || reduceMotion || !visible || document.hidden) return;
    running = true;
    requestAnimationFrame(step);
  }
  function stop() { running = false; }

  // Pointer: hover lights nearby nodes; drag rotates the network.
  stage.addEventListener("pointermove", function (event) {
    var rect = stage.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.active = true;
    if (dragging) {
      spinY = (event.clientX - lastX) * 0.0045;
      spinX = (event.clientY - lastY) * 0.003;
      lastX = event.clientX;
      lastY = event.clientY;
    }
    if (!running) draw();
  });
  stage.addEventListener("pointerleave", function () { pointer.active = false; dragging = false; stage.classList.remove("is-dragging"); });
  stage.addEventListener("pointerdown", function (event) {
    if (event.pointerType === "touch") return; // let touches scroll the page
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.classList.add("is-dragging");
  });
  window.addEventListener("pointerup", function () { dragging = false; stage.classList.remove("is-dragging"); });

  // Touch: a horizontal swipe spins the network without blocking vertical scrolling.
  var touchStartX = 0;
  stage.addEventListener("touchstart", function (event) { touchStartX = event.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchmove", function (event) {
    var x = event.touches[0].clientX;
    spinY = (x - touchStartX) * 0.004;
    touchStartX = x;
  }, { passive: true });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }).observe(stage);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  resize();
  start();
})();
