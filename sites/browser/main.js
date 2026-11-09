// SYNAPSE Browser download page. No libraries.
(function () {
  "use strict";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Navigation: border on scroll, phone menu.
  var nav = document.querySelector(".nav");
  var menuButton = document.querySelector(".nav__menu");
  var links = document.getElementById("nav-links");
  function onScroll() { nav.classList.toggle("is-scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  function setMenu(open) {
    links.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  menuButton.addEventListener("click", function () { setMenu(!links.classList.contains("is-open")); });
  links.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("click", function (e) {
    if (links.classList.contains("is-open") && !e.target.closest(".nav")) setMenu(false);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  // Reveal on scroll.
  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("is-visible"); });
  }

  // Highlight the download for this device; the hero button downloads it directly.
  var ua = navigator.userAgent || "";
  var platform = /Android/i.test(ua) ? "android" : /Windows/i.test(ua) ? "windows" : "";
  var card = platform && document.querySelector('.dl[data-platform="' + platform + '"]');
  if (card) {
    card.classList.add("is-recommended");
    var hero = document.querySelector("[data-hero-download]");
    if (hero) {
      hero.href = platform === "android" ? "/android" : "/windows";
      hero.textContent = platform === "android" ? "Download for Android" : "Download for Windows";
    }
  }

  // Copy checksums.
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      var done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });

  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
