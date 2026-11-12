(function () {
  "use strict";

  var states = new WeakMap();
  var activeRoots = new Set();
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function removeClones(rowState) {
    Array.from(rowState.track.querySelectorAll("[data-tdm-clone]")).forEach(function (clone) { clone.remove(); });
  }

  function rebuildRow(rowState) {
    var row = rowState.row;
    var track = rowState.track;
    removeClones(rowState);
    rowState.loopWidth = 0;
    if (!row.isConnected || row.clientWidth <= 0 || !rowState.originals.length) return false;

    var sequence = rowState.originals.slice();
    while (track.scrollWidth < Math.max(row.clientWidth * 1.35, 1700)) {
      rowState.originals.forEach(function (card) {
        var fill = card.cloneNode(true);
        fill.dataset.tdmClone = "fill";
        fill.setAttribute("aria-hidden", "true");
        track.appendChild(fill);
        sequence.push(fill);
      });
    }

    var firstLoopClone = null;
    sequence.forEach(function (card, index) {
      var clone = card.cloneNode(true);
      clone.dataset.tdmClone = "loop";
      clone.setAttribute("aria-hidden", "true");
      track.appendChild(clone);
      if (index === 0) firstLoopClone = clone;
    });

    rowState.loopWidth = firstLoopClone ? firstLoopClone.offsetLeft - rowState.originals[0].offsetLeft : 0;
    if (rowState.reverse && rowState.loopWidth) row.scrollLeft = rowState.loopWidth;
    else if (!rowState.reverse && rowState.loopWidth && row.scrollLeft >= rowState.loopWidth) row.scrollLeft = 0;
    return rowState.loopWidth > 0;
  }

  function normalize(rowState) {
    if (!rowState.loopWidth) return;
    if (!rowState.reverse && rowState.row.scrollLeft >= rowState.loopWidth) rowState.row.scrollLeft -= rowState.loopWidth;
    if (rowState.reverse && rowState.row.scrollLeft <= 0) rowState.row.scrollLeft += rowState.loopWidth;
  }

  function scheduleRefresh(state, delay) {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(function () { refresh(state.root); }, typeof delay === "number" ? delay : 80);
  }

  function startAnimation(state) {
    if (state.frame || !state.root.isConnected) return;
    state.previousTime = performance.now();

    function animate(now) {
      if (!state.root.isConnected) {
        state.frame = null;
        return;
      }
      var delta = Math.min(now - state.previousTime, 40);
      state.previousTime = now;
      state.rows.forEach(function (rowState) {
        if (!reduceMotion.matches && state.speed > 0 && !rowState.paused && !rowState.hovered && !rowState.focused && !rowState.dragging && rowState.loopWidth) {
          rowState.row.scrollLeft += (rowState.reverse ? -1 : 1) * state.speed * (delta / 16.667);
          normalize(rowState);
        }
      });
      state.frame = window.requestAnimationFrame(animate);
    }
    state.frame = window.requestAnimationFrame(animate);
  }

  function addRowEvents(state, rowState) {
    var row = rowState.row;
    var eventOptions = state.controller ? { signal: state.controller.signal } : false;

    function listen(type, handler) {
      if (eventOptions) row.addEventListener(type, handler, eventOptions);
      else row.addEventListener(type, handler);
      rowState.listeners.push([type, handler]);
    }
    function pause() {
      rowState.paused = true;
      window.clearTimeout(rowState.resumeTimer);
    }
    function resume(delay) {
      window.clearTimeout(rowState.resumeTimer);
      rowState.resumeTimer = window.setTimeout(function () {
        rowState.paused = false;
        state.previousTime = performance.now();
      }, delay || 0);
    }

    listen("pointerdown", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      rowState.activePointer = event.pointerId;
      rowState.pointerStartX = event.clientX;
      rowState.scrollStart = row.scrollLeft;
      rowState.dragging = true;
      pause();
      row.classList.add("is-dragging");
      if (row.setPointerCapture) row.setPointerCapture(event.pointerId);
    });
    listen("pointermove", function (event) {
      if (!rowState.dragging || event.pointerId !== rowState.activePointer) return;
      row.scrollLeft = rowState.scrollStart - (event.clientX - rowState.pointerStartX);
      normalize(rowState);
    });

    function finishDrag(event) {
      if (!rowState.dragging || (event && rowState.activePointer !== null && event.pointerId !== rowState.activePointer)) return;
      rowState.dragging = false;
      row.classList.remove("is-dragging");
      if (event && row.hasPointerCapture && row.hasPointerCapture(event.pointerId)) row.releasePointerCapture(event.pointerId);
      rowState.activePointer = null;
      resume(900);
    }
    listen("pointerup", finishDrag);
    listen("pointercancel", finishDrag);
    listen("lostpointercapture", finishDrag);
    listen("mouseenter", function () { rowState.hovered = true; pause(); });
    listen("mouseleave", function () {
      rowState.hovered = false;
      if (!rowState.dragging && !rowState.focused) resume(350);
    });
    listen("focusin", function () { rowState.focused = true; pause(); });
    listen("focusout", function () {
      rowState.focused = false;
      if (!rowState.hovered && !rowState.dragging) resume(350);
    });
    listen("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      pause();
      row.scrollLeft += event.key === "ArrowRight" ? 180 : -180;
      normalize(rowState);
      resume(1000);
    });
  }

  function createRowState(state, row) {
    var track = row.querySelector(".tdm-testimonial-track");
    if (!track) return null;
    var originals = Array.from(track.children).filter(function (card) { return !card.hasAttribute("data-tdm-clone"); });
    if (!originals.length) return null;
    var rowState = {
      row: row, track: track, originals: originals, listeners: [], loopWidth: 0,
      paused: false, hovered: false, focused: false, dragging: false,
      activePointer: null, resumeTimer: null, pointerStartX: 0, scrollStart: 0,
      reverse: row.dataset.direction === "reverse"
    };
    addRowEvents(state, rowState);
    originals.forEach(function (card) {
      card.querySelectorAll("img").forEach(function (image) {
        if (!image.complete) image.addEventListener("load", function () { scheduleRefresh(state); }, { once: true });
      });
    });
    return rowState;
  }

  function initialize(root) {
    var existing = states.get(root);
    if (existing) {
      refresh(root);
      return existing;
    }
    var parsedSpeed = parseFloat(root.dataset.speed || "0.25");
    var state = {
      root: root, speed: isFinite(parsedSpeed) ? Math.max(0, parsedSpeed) : 0.25,
      rows: [], frame: null, previousTime: performance.now(), refreshTimer: null,
      observer: null, controller: typeof AbortController === "function" ? new AbortController() : null,
      resizeHandler: null
    };
    states.set(root, state);
    activeRoots.add(root);
    state.rows = Array.from(root.querySelectorAll(".tdm-testimonial-row")).map(function (row) {
      return createRowState(state, row);
    }).filter(Boolean);

    if ("ResizeObserver" in window) {
      state.observer = new ResizeObserver(function () { scheduleRefresh(state, 100); });
      state.observer.observe(root);
    } else {
      state.resizeHandler = function () { scheduleRefresh(state, 100); };
      window.addEventListener("resize", state.resizeHandler);
    }
    refresh(root);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (states.get(root) === state) refresh(root); });
    }
    return state;
  }

  function refresh(root) {
    var state = states.get(root);
    if (!state) return initialize(root);
    if (!root.isConnected) return state;
    var parsedSpeed = parseFloat(root.dataset.speed || "0.25");
    state.speed = isFinite(parsedSpeed) ? Math.max(0, parsedSpeed) : 0.25;
    state.rows.forEach(rebuildRow);
    startAnimation(state);
    return state;
  }

  function destroy(root) {
    var state = states.get(root);
    if (!state) return;
    if (state.frame) window.cancelAnimationFrame(state.frame);
    window.clearTimeout(state.refreshTimer);
    if (state.observer) state.observer.disconnect();
    if (state.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    if (state.controller) state.controller.abort();
    state.rows.forEach(function (rowState) {
      window.clearTimeout(rowState.resumeTimer);
      removeClones(rowState);
      rowState.row.classList.remove("is-dragging");
      if (!state.controller) {
        rowState.listeners.forEach(function (listener) { rowState.row.removeEventListener(listener[0], listener[1]); });
      }
    });
    states.delete(root);
    activeRoots.delete(root);
  }

  function initializeAll(scope) {
    var context = scope && scope.querySelectorAll ? scope : document;
    if (context.matches && context.matches("[data-tdm-testimonials]")) initialize(context);
    context.querySelectorAll("[data-tdm-testimonials]").forEach(initialize);
  }

  function sweepRemovedRoots() {
    activeRoots.forEach(function (root) { if (!root.isConnected) destroy(root); });
  }

  function boot() {
    initializeAll(document);
    if ("MutationObserver" in window && document.body) {
      var mutationObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) { if (node.nodeType === 1) initializeAll(node); });
        });
        sweepRemovedRoots();
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  if (window.jQuery) {
    window.jQuery(window).on("elementor/frontend/init", function () {
      if (!window.elementorFrontend || !window.elementorFrontend.hooks) return;
      ["frontend/element_ready/shortcode.default", "frontend/element_ready/html.default"].forEach(function (hook) {
        window.elementorFrontend.hooks.addAction(hook, function ($scope) {
          initializeAll($scope && $scope[0] ? $scope[0] : document);
        });
      });
    });
  }
})();
