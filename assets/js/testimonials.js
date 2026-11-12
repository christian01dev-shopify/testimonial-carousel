(function () {
  "use strict";

  var states = new WeakMap();

  function initialize(root) {
    if (states.has(root)) return;

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var rootSpeed = parseFloat(root.dataset.speed || "0.25");
    var state = { rows: [], observer: null };
    states.set(root, state);

    root.querySelectorAll(".tdm-testimonial-row").forEach(function (row) {
      var track = row.querySelector(".tdm-testimonial-track");
      var originals = Array.from(track.children);
      if (!originals.length) return;

      var rowState = {
        row: row,
        track: track,
        originals: originals,
        loopWidth: 0,
        paused: false,
        hovered: false,
        focused: false,
        dragging: false,
        activePointer: null,
        resumeTimer: null,
        frame: null,
        previousTime: performance.now(),
        reverse: row.dataset.direction === "reverse"
      };

      function prepareLoop() {
        Array.from(track.querySelectorAll("[data-tdm-clone]")).forEach(function (clone) {
          clone.remove();
        });

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
        if (rowState.reverse) row.scrollLeft = rowState.loopWidth;
      }

      function normalize() {
        if (!rowState.loopWidth) return;
        if (!rowState.reverse && row.scrollLeft >= rowState.loopWidth) row.scrollLeft -= rowState.loopWidth;
        if (rowState.reverse && row.scrollLeft <= 0) row.scrollLeft += rowState.loopWidth;
      }

      function animate(now) {
        var delta = Math.min(now - rowState.previousTime, 40);
        rowState.previousTime = now;
        if (!reduceMotion.matches && rootSpeed > 0 && !rowState.paused && !rowState.hovered && !rowState.focused && !rowState.dragging && rowState.loopWidth && root.isConnected) {
          row.scrollLeft += (rowState.reverse ? -1 : 1) * rootSpeed * (delta / 16.667);
          normalize();
        }
        if (root.isConnected) rowState.frame = window.requestAnimationFrame(animate);
      }

      function pause() {
        rowState.paused = true;
        window.clearTimeout(rowState.resumeTimer);
      }

      function resume(delay) {
        window.clearTimeout(rowState.resumeTimer);
        rowState.resumeTimer = window.setTimeout(function () {
          rowState.paused = false;
          rowState.previousTime = performance.now();
        }, delay || 0);
      }

      var pointerStartX = 0;
      var scrollStart = 0;

      row.addEventListener("pointerdown", function (event) {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        rowState.activePointer = event.pointerId;
        pointerStartX = event.clientX;
        scrollStart = row.scrollLeft;
        rowState.dragging = true;
        pause();
        row.classList.add("is-dragging");
        row.setPointerCapture(event.pointerId);
      });

      row.addEventListener("pointermove", function (event) {
        if (!rowState.dragging || event.pointerId !== rowState.activePointer) return;
        row.scrollLeft = scrollStart - (event.clientX - pointerStartX);
        normalize();
      });

      function finishDrag(event) {
        if (!rowState.dragging || (event && rowState.activePointer !== null && event.pointerId !== rowState.activePointer)) return;
        rowState.dragging = false;
        row.classList.remove("is-dragging");
        if (event && row.hasPointerCapture && row.hasPointerCapture(event.pointerId)) row.releasePointerCapture(event.pointerId);
        rowState.activePointer = null;
        resume(900);
      }

      row.addEventListener("pointerup", finishDrag);
      row.addEventListener("pointercancel", finishDrag);
      row.addEventListener("lostpointercapture", finishDrag);
      row.addEventListener("mouseenter", function () {
        rowState.hovered = true;
        pause();
      });
      row.addEventListener("mouseleave", function () {
        rowState.hovered = false;
        if (!rowState.dragging && !rowState.focused) resume(350);
      });
      row.addEventListener("focusin", function () {
        rowState.focused = true;
        pause();
      });
      row.addEventListener("focusout", function () {
        rowState.focused = false;
        if (!rowState.hovered && !rowState.dragging) resume(350);
      });
      row.addEventListener("keydown", function (event) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        pause();
        row.scrollLeft += event.key === "ArrowRight" ? 180 : -180;
        normalize();
        resume(1000);
      });

      prepareLoop();
      rowState.frame = window.requestAnimationFrame(animate);
      state.rows.push(rowState);
    });

    if ("ResizeObserver" in window) {
      var resizeTimer;
      state.observer = new ResizeObserver(function () {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
          state.rows.forEach(function (rowState) {
            var track = rowState.track;
            Array.from(track.querySelectorAll("[data-tdm-clone]")).forEach(function (clone) { clone.remove(); });
            if (!rowState.originals.length) return;
            var sequence = rowState.originals.slice();
            while (track.scrollWidth < Math.max(rowState.row.clientWidth * 1.35, 1700)) {
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
            if (rowState.reverse) rowState.row.scrollLeft = rowState.loopWidth;
          });
        }, 120);
      });
      state.observer.observe(root);
    }
  }

  function initializeAll(scope) {
    var context = scope && scope.querySelectorAll ? scope : document;
    if (context.matches && context.matches("[data-tdm-testimonials]")) initialize(context);
    context.querySelectorAll("[data-tdm-testimonials]").forEach(initialize);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { initializeAll(document); });
  else initializeAll(document);

  if (window.jQuery) {
    window.jQuery(window).on("elementor/frontend/init", function () {
      if (window.elementorFrontend && window.elementorFrontend.hooks) {
        window.elementorFrontend.hooks.addAction("frontend/element_ready/shortcode.default", function ($scope) {
          initializeAll($scope && $scope[0] ? $scope[0] : document);
        });
        window.elementorFrontend.hooks.addAction("frontend/element_ready/html.default", function ($scope) {
          initializeAll($scope && $scope[0] ? $scope[0] : document);
        });
      }
    });
  }
})();
