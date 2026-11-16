(function () {
  "use strict";

  var states = new WeakMap();
  var activeRoots = new Set();
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var GESTURE_THRESHOLD = 8;
  var HORIZONTAL_BIAS = 1.15;
  var MAX_MOMENTUM_VELOCITY = 1.8;
  var MIN_MOMENTUM_VELOCITY = 0.05;
  var MAX_MOMENTUM_DURATION = 700;

  function cancelMomentum(rowState) {
    if (rowState.momentumFrame) window.cancelAnimationFrame(rowState.momentumFrame);
    rowState.momentumFrame = null;
    rowState.momentumVelocity = 0;
  }

  function startMomentum(state, rowState, velocity) {
    cancelMomentum(rowState);
    rowState.momentumVelocity = Math.max(-MAX_MOMENTUM_VELOCITY, Math.min(MAX_MOMENTUM_VELOCITY, velocity));
    if (Math.abs(rowState.momentumVelocity) < MIN_MOMENTUM_VELOCITY || reduceMotion.matches) return false;

    var startedAt = performance.now();
    var previousTime = startedAt;

    function coast(now) {
      if (!rowState.row.isConnected || reduceMotion.matches) {
        cancelMomentum(rowState);
        rowState.resume(0);
        return;
      }

      var delta = Math.min(now - previousTime, 32);
      previousTime = now;
      rowState.position += rowState.momentumVelocity * delta;
      renderPosition(rowState);
      rowState.momentumVelocity *= Math.pow(0.92, delta / 16.667);

      if (now - startedAt >= MAX_MOMENTUM_DURATION || Math.abs(rowState.momentumVelocity) < MIN_MOMENTUM_VELOCITY) {
        cancelMomentum(rowState);
        rowState.resume(150);
        return;
      }
      rowState.momentumFrame = window.requestAnimationFrame(coast);
    }

    rowState.momentumFrame = window.requestAnimationFrame(coast);
    return true;
  }

  function removeClones(rowState) {
    Array.from(rowState.track.querySelectorAll("[data-tdm-clone]")).forEach(function (clone) { clone.remove(); });
  }

  function prepareClone(clone, type) {
    clone.dataset.tdmClone = type;
    clone.setAttribute("aria-hidden", "true");
    clone.querySelectorAll("a, button, input, select, textarea, [tabindex]").forEach(function (element) {
      element.setAttribute("tabindex", "-1");
    });
    return clone;
  }

  function rebuildRow(rowState) {
    var row = rowState.row;
    var track = rowState.track;
    cancelMomentum(rowState);
    removeClones(rowState);
    rowState.loopWidth = 0;
    if (!row.isConnected || row.clientWidth <= 0 || !rowState.originals.length) return false;

    var sequence = rowState.originals.slice();
    while (track.scrollWidth < Math.max(row.clientWidth * 1.35, 1700)) {
      rowState.originals.forEach(function (card) {
        var fill = prepareClone(card.cloneNode(true), "fill");
        track.appendChild(fill);
        sequence.push(fill);
      });
    }

    var firstLoopClone = null;
    sequence.forEach(function (card, index) {
      var clone = prepareClone(card.cloneNode(true), "loop");
      track.appendChild(clone);
      if (index === 0) firstLoopClone = clone;
    });

    rowState.loopWidth = firstLoopClone ? firstLoopClone.offsetLeft - rowState.originals[0].offsetLeft : 0;
    if (!rowState.ready) {
      rowState.position = rowState.reverse ? rowState.loopWidth : 0;
      rowState.ready = true;
    } else {
      normalizePosition(rowState);
    }
    renderPosition(rowState);
    return rowState.loopWidth > 0;
  }

  function normalizePosition(rowState) {
    if (!rowState.loopWidth) return;
    while (rowState.position >= rowState.loopWidth) rowState.position -= rowState.loopWidth;
    while (rowState.position < 0) rowState.position += rowState.loopWidth;
  }

  function renderPosition(rowState) {
    normalizePosition(rowState);
    rowState.track.style.transform = "translate3d(" + (-rowState.position) + "px, 0, 0)";
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
        if (!reduceMotion.matches && !rowState.paused && !rowState.hovered && !rowState.focused && !rowState.dragging && rowState.loopWidth) {
          rowState.position += (rowState.reverse ? -1 : 1) * state.pixelsPerSecond * (delta / 1000);
          renderPosition(rowState);
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
    rowState.resume = resume;

    listen("pointerdown", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (rowState.activePointer !== null) return;
      cancelMomentum(rowState);
      rowState.activePointer = event.pointerId;
      rowState.pointerType = event.pointerType;
      rowState.pointerStartX = event.clientX;
      rowState.pointerStartY = event.clientY;
      rowState.lastPointerX = event.clientX;
      rowState.lastPointerTime = event.timeStamp;
      rowState.scrollStart = rowState.position;
      rowState.gestureAxis = null;
      rowState.velocity = 0;
      rowState.hasDragged = false;
      rowState.suppressClick = false;
      rowState.dragging = true;
      pause();
    });
    listen("pointermove", function (event) {
      if (!rowState.dragging || event.pointerId !== rowState.activePointer) return;
      var distanceX = event.clientX - rowState.pointerStartX;
      var distanceY = event.clientY - rowState.pointerStartY;

      if (!rowState.gestureAxis) {
        if (Math.max(Math.abs(distanceX), Math.abs(distanceY)) < GESTURE_THRESHOLD) return;
        rowState.gestureAxis = Math.abs(distanceX) > Math.abs(distanceY) * HORIZONTAL_BIAS ? "horizontal" : "vertical";
        if ("vertical" === rowState.gestureAxis) return;
        rowState.hasDragged = true;
        row.classList.add("is-dragging");
        if (row.setPointerCapture) row.setPointerCapture(event.pointerId);
      }

      if ("horizontal" !== rowState.gestureAxis) return;
      if (event.cancelable) event.preventDefault();

      var elapsed = event.timeStamp - rowState.lastPointerTime;
      if (elapsed > 0) {
        var instantVelocity = -(event.clientX - rowState.lastPointerX) / elapsed;
        rowState.velocity = rowState.velocity * 0.65 + instantVelocity * 0.35;
      }
      rowState.lastPointerX = event.clientX;
      rowState.lastPointerTime = event.timeStamp;
      rowState.position = rowState.scrollStart - distanceX;
      renderPosition(rowState);
    });

    function finishDrag(event, cancelled) {
      if (!rowState.dragging || (event && rowState.activePointer !== null && event.pointerId !== rowState.activePointer)) return;
      if (event && event.timeStamp - rowState.lastPointerTime > 80) rowState.velocity = 0;
      var shouldCoast = !cancelled && rowState.hasDragged && ("touch" === rowState.pointerType || "pen" === rowState.pointerType);
      rowState.suppressClick = rowState.hasDragged && !cancelled;
      rowState.dragging = false;
      row.classList.remove("is-dragging");
      if (event && row.hasPointerCapture && row.hasPointerCapture(event.pointerId)) row.releasePointerCapture(event.pointerId);
      rowState.activePointer = null;
      rowState.gestureAxis = null;
      if (rowState.suppressClick) {
        window.clearTimeout(rowState.clickTimer);
        rowState.clickTimer = window.setTimeout(function () { rowState.suppressClick = false; }, 0);
      }
      if (shouldCoast && startMomentum(state, rowState, rowState.velocity)) return;
      cancelMomentum(rowState);
      resume(cancelled ? 0 : 900);
    }
    listen("pointerup", function (event) { finishDrag(event, false); });
    listen("pointercancel", function (event) { finishDrag(event, true); });
    listen("lostpointercapture", function (event) { finishDrag(event, true); });
    listen("click", function (event) {
      if (!rowState.suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    });
    listen("dragstart", function (event) { event.preventDefault(); });
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
      rowState.position += event.key === "ArrowRight" ? 180 : -180;
      renderPosition(rowState);
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
      position: 0, ready: false,
      paused: false, hovered: false, focused: false, dragging: false,
      activePointer: null, pointerType: "", resumeTimer: null, clickTimer: null,
      pointerStartX: 0, pointerStartY: 0, lastPointerX: 0, lastPointerTime: 0, scrollStart: 0,
      gestureAxis: null, velocity: 0, momentumFrame: null, momentumVelocity: 0,
      hasDragged: false, suppressClick: false, resume: function () {},
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
    var state = {
      root: root, pixelsPerSecond: 90,
      rows: [], frame: null, previousTime: performance.now(), refreshTimer: null,
      observer: null, controller: typeof AbortController === "function" ? new AbortController() : null,
      resizeHandler: null
    };
    states.set(root, state);
    activeRoots.add(root);
    state.rows = Array.from(root.querySelectorAll(".tdm-testimonial-row")).map(function (row) {
      return createRowState(state, row);
    }).filter(Boolean);

    state.reduceMotionHandler = function () {
      state.rows.forEach(function (rowState) {
        cancelMomentum(rowState);
        if (!rowState.dragging) rowState.resume(0);
      });
      state.previousTime = performance.now();
    };
    if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", state.reduceMotionHandler);
    else if (reduceMotion.addListener) reduceMotion.addListener(state.reduceMotionHandler);

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
    state.rows.forEach(function (rowState) {
      cancelMomentum(rowState);
      if (!rowState.dragging) rowState.resume(0);
      rebuildRow(rowState);
    });
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
    if (reduceMotion.removeEventListener) reduceMotion.removeEventListener("change", state.reduceMotionHandler);
    else if (reduceMotion.removeListener) reduceMotion.removeListener(state.reduceMotionHandler);
    if (state.controller) state.controller.abort();
    state.rows.forEach(function (rowState) {
      window.clearTimeout(rowState.resumeTimer);
      window.clearTimeout(rowState.clickTimer);
      cancelMomentum(rowState);
      removeClones(rowState);
      rowState.track.style.transform = "";
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
