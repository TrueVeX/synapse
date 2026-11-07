// SYNAPSE Docs interactions: theme, phone navigation, search, copy buttons, TOC.
(function () {
  "use strict";
  var root = document.documentElement;

  /* Theme */
  var themeButton = document.querySelector(".theme-btn");
  if (themeButton) {
    themeButton.addEventListener("click", function () {
      var light = root.dataset.theme !== "light";
      if (light) root.dataset.theme = "light"; else delete root.dataset.theme;
      try { localStorage.setItem("synapse_docs_theme", light ? "light" : "dark"); } catch (e) { /* storage blocked */ }
    });
  }

  /* Phone navigation drawer */
  var menu = document.querySelector(".top__menu");
  var sidebar = document.getElementById("sidebar");
  var scrim = document.querySelector(".scrim");
  function setMenu(open) {
    if (!menu || !sidebar) return;
    sidebar.classList.toggle("is-open", open);
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    if (scrim) scrim.hidden = !open;
  }
  if (menu) menu.addEventListener("click", function () { setMenu(!sidebar.classList.contains("is-open")); });
  if (scrim) scrim.addEventListener("click", function () { setMenu(false); });
  var current = sidebar && sidebar.querySelector('[aria-current="page"]');
  if (current) current.scrollIntoView({ block: "center" });

  /* Copy code */
  document.querySelectorAll(".code__copy").forEach(function (button) {
    button.addEventListener("click", function () {
      var code = button.closest(".code").querySelector("code");
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(code.textContent).then(function () {
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = "Copy"; }, 1500);
      }, function () {});
    });
  });

  /* Table of contents: highlight the section being read */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var byId = {};
    tocLinks.forEach(function (link) { byId[link.getAttribute("href").slice(1)] = link; });
    var headings = tocLinks.map(function (link) { return document.getElementById(link.getAttribute("href").slice(1)); }).filter(Boolean);
    var activeId = null;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) activeId = entry.target.id;
      });
      tocLinks.forEach(function (link) { link.classList.toggle("is-active", link.getAttribute("href") === "#" + activeId); });
    }, { rootMargin: "-70px 0px -70% 0px" });
    headings.forEach(function (h) { observer.observe(h); });
  }

  /* Search */
  var search = document.querySelector(".search");
  var input = search && search.querySelector("input");
  var results = search && search.querySelector(".search__results");
  var index = null;
  var active = -1;
  var lastFocus = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    return fetch("/search-index.json").then(function (r) { return r.json(); }).then(function (data) { index = data; return data; });
  }
  function openSearch() {
    if (!search) return;
    lastFocus = document.activeElement;
    search.hidden = false;
    input.value = "";
    results.innerHTML = "";
    input.focus();
    loadIndex();
  }
  function closeSearch() {
    if (!search) return;
    search.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function escapeHtml(text) {
    return text.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function highlight(text, words) {
    var safe = escapeHtml(text);
    words.forEach(function (word) {
      if (word.length < 2) return;
      safe = safe.replace(new RegExp("(" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
    });
    return safe;
  }
  function snippet(text, words) {
    var lower = text.toLowerCase();
    var at = -1;
    words.forEach(function (w) { var i = lower.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; });
    var start = Math.max(0, at - 50);
    return (start > 0 ? "…" : "") + text.slice(start, start + 170) + (text.length > start + 170 ? "…" : "");
  }
  function runSearch() {
    var query = input.value.trim().toLowerCase();
    active = -1;
    if (!query || !index) { results.innerHTML = ""; return; }
    var words = query.split(/\s+/).filter(Boolean);
    var scored = [];
    index.forEach(function (item) {
      var title = item.t.toLowerCase(), heading = item.h.toLowerCase(), text = item.x.toLowerCase();
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        var hit = 0;
        if (title.indexOf(w) >= 0) hit += 6;
        if (heading.indexOf(w) >= 0) hit += 5;
        if (text.indexOf(w) >= 0) hit += 1 + Math.min(3, text.split(w).length - 2);
        if (!hit) { score = 0; break; }
        score += hit;
      }
      if (heading.indexOf(query) >= 0 || title.indexOf(query) >= 0) score += 8;
      if (score) scored.push({ item: item, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    var top = scored.slice(0, 12);
    if (!top.length) {
      results.innerHTML = '<li><a href="#" tabindex="-1"><strong>No results</strong><span>Try a different word, like “credits” or “download”.</span></a></li>';
      return;
    }
    results.innerHTML = top.map(function (r) {
      var it = r.item;
      return '<li><a href="' + it.u + '"><small>' + escapeHtml(it.t) + '</small><strong>' + highlight(it.h, words) + '</strong><span>' + highlight(snippet(it.x, words), words) + '</span></a></li>';
    }).join("");
  }
  function moveActive(delta) {
    var links = results.querySelectorAll("a");
    if (!links.length) return;
    active = (active + delta + links.length) % links.length;
    links.forEach(function (l, i) { l.classList.toggle("is-active", i === active); });
    links[active].scrollIntoView({ block: "nearest" });
  }

  if (search) {
    document.querySelectorAll(".search-btn").forEach(function (b) { b.addEventListener("click", openSearch); });
    search.querySelector(".search__close").addEventListener("click", closeSearch);
    search.addEventListener("mousedown", function (event) { if (event.target === search) closeSearch(); });
    input.addEventListener("input", function () { loadIndex().then(runSearch); });
    input.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") { event.preventDefault(); moveActive(1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); moveActive(-1); }
      else if (event.key === "Enter") {
        var links = results.querySelectorAll("a");
        var target = links[active >= 0 ? active : 0];
        if (target && target.getAttribute("href") !== "#") window.location.href = target.href;
      }
    });
    results.addEventListener("click", function (event) {
      var link = event.target.closest("a");
      if (link && link.getAttribute("href") === "#") event.preventDefault();
      else closeSearch();
    });
  }

  document.addEventListener("keydown", function (event) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target && event.target.tagName) || "");
    if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
      event.preventDefault();
      openSearch();
    } else if (event.key === "Escape") {
      if (search && !search.hidden) closeSearch();
      else setMenu(false);
    }
  });
})();
