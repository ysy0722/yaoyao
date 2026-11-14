/* ============================================================
 * main.js
 *  1) 书页内的墨迹晕开：书页场景 → 遮罩画布 → 页面内容
 *  2) 登录表单：姓名 + 手机号校验，输入时墨迹晕开
 *
 * 晕开原理：
 *   书页里先铺一层场景图（.book__scene），
 *   再用 canvas 在上面盖一层"纸"（底色渐变 + 书脊阴影），
 *   然后用 globalCompositeOperation = "destination-out" 画墨点，
 *   画过的地方纸被浸透 → 露出下面的场景图，看起来就是墨在纸上晕开。
 * ============================================================ */

(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------
   * 把屏幕坐标换算成画布内部坐标
   * （书页有 3D 变换，getBoundingClientRect 是投影后的尺寸，
   *   所以要用 canvas 的布局尺寸 / 投影尺寸 做比例修正）
   * ---------------------------------------------------------- */
  function clientToCanvas(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.offsetWidth / rect.width),
      y: (clientY - rect.top) * (canvas.offsetHeight / rect.height),
    };
  }

  /* ------------------------------------------------------------
   * 墨迹层
   * ---------------------------------------------------------- */
  function createInkLayer(canvas, host) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const R_START = 10;
    const LIFETIME = 1150;   // 晕开得慢一点，才像墨
    const MAX_STAMPS = 240;

    let w = 0;
    let h = 0;
    const stamps = [];
    let running = false;

    /* 纸：底色渐变 + 书脊阴影 */
    function paintPaper() {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);

      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#fbf4e4");
      g.addColorStop(1, "#f7eeda");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // 书脊暗部：只负责中缝最深处的一道窄影，
      // 页面弯进去的"圆肩 + 翻折"交给 CSS 的弯折带表现
      const half = w / 2;
      const sg = ctx.createLinearGradient(half - 52, 0, half + 52, 0);
      sg.addColorStop(0, "rgba(120, 78, 30, 0)");
      sg.addColorStop(0.35, "rgba(100, 64, 24, 0.10)");
      sg.addColorStop(0.5, "rgba(48, 26, 6, 0.26)");
      sg.addColorStop(0.65, "rgba(100, 64, 24, 0.10)");
      sg.addColorStop(1, "rgba(120, 78, 30, 0)");
      ctx.fillStyle = sg;
      ctx.fillRect(half - 52, 0, 104, h);
    }

    function size() {
      w = host.clientWidth;
      h = host.clientHeight;
      canvas.width = Math.round(w * DPR);
      canvas.height = Math.round(h * DPR);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      paintPaper();
    }

    /* 纸页尺寸一旦变化（字体加载、滚动条出现、窗口缩放等）就重新同步画布，
       否则画布会比纸页"矮"一截，底下的场景图会从缝隙里露出来 */
    if (window.ResizeObserver) {
      new ResizeObserver(function () { size(); }).observe(host);
    }

    /* 单个墨点：软边 + 不规则毛边（三组正弦叠加） */
    function carve(x, y, r, alpha, seed) {
      const g = ctx.createRadialGradient(x, y, r * 0.22, x, y, r);
      g.addColorStop(0, "rgba(0,0,0," + 0.97 * alpha + ")");
      g.addColorStop(0.5, "rgba(0,0,0," + 0.9 * alpha + ")");
      g.addColorStop(0.82, "rgba(0,0,0," + 0.45 * alpha + ")");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;

      ctx.beginPath();
      const SEGS = 36;
      for (let i = 0; i <= SEGS; i++) {
        const a = (i / SEGS) * Math.PI * 2;
        const wobble =
          0.74 +
          0.16 * Math.sin(a * 3 + seed) +
          0.09 * Math.sin(a * 8 + seed * 1.9) +
          0.06 * Math.sin(a * 15 + seed * 0.6);
        const px = x + Math.cos(a) * r * wobble;
        const py = y + Math.sin(a) * r * wobble;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    function loop() {
      const now = performance.now();
      paintPaper();
      ctx.globalCompositeOperation = "destination-out";

      for (let i = stamps.length - 1; i >= 0; i--) {
        const s = stamps[i];
        const t = (now - s.born) / LIFETIME;
        if (t >= 1) {
          stamps.splice(i, 1);
          continue;
        }
        const ease = 1 - Math.pow(1 - t, 3);
        const r = R_START + (s.rmax - R_START) * ease;
        const alpha = 1 - Math.pow(t, 1.6); // 先浓后慢慢淡，像墨被纸吸走
        const drift = ease * 34;
        carve(s.x + s.vx * drift, s.y + s.vy * drift, r, alpha, s.seed);
      }

      if (stamps.length) requestAnimationFrame(loop);
      else running = false;
    }

    function start() {
      if (reduceMotion) return;
      if (!running) {
        running = true;
        requestAnimationFrame(loop);
      }
    }

    function addStamp(x, y, o) {
      o = o || {};
      if (stamps.length >= MAX_STAMPS) stamps.shift();
      stamps.push({
        x: x,
        y: y,
        vx: o.vx || 0,
        vy: o.vy || 0,
        born: performance.now(),
        seed: Math.random() * Math.PI * 2,
        rmax: (o.rmax || 180) * (0.85 + Math.random() * 0.3),
      });
    }

    /* 一点炸开一圈墨 */
    function ripple(x, y, o) {
      o = o || {};
      const count = o.count || 7;
      const spread = o.spread || 70;
      const rmax = o.rmax || 180;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
        const d = spread * (0.15 + Math.random() * 0.9);
        addStamp(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.66, {
          vx: Math.cos(a) * 0.35,
          vy: Math.sin(a) * 0.3,
          rmax: rmax * (0.65 + Math.random() * 0.5),
        });
      }
      addStamp(x, y, { rmax: rmax * 1.05 });
      start();
    }

    /* 鼠标轨迹：按间距连续落墨 */
    let lastX = null;
    let lastY = null;
    function trail(x, y) {
      if (lastX !== null) {
        const dx = x - lastX;
        const dy = y - lastY;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 16));
        for (let i = 1; i <= steps; i++) {
          addStamp(lastX + (dx * i) / steps, lastY + (dy * i) / steps, { rmax: 120 });
        }
      } else {
        addStamp(x, y, { rmax: 120 });
      }
      lastX = x;
      lastY = y;
      start();
    }
    function trailEnd() {
      lastX = null;
      lastY = null;
    }

    size();
    return { size: size, ripple: ripple, trail: trail, trailEnd: trailEnd };
  }

  /* ============================================================
   * 初始化书页墨迹层
   * ============================================================ */
  const book = document.getElementById("book");
  const paper = document.querySelector(".book__paper");
  const canvas = document.getElementById("bookMask");
  const layer = paper && canvas ? createInkLayer(canvas, paper) : null;

  if (layer) {
    /* 鼠标在书上划过 → 墨迹跟着晕开（只发生在书页里） */
    book.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      const p = clientToCanvas(canvas, e.clientX, e.clientY);
      layer.trail(p.x, p.y);
    });
    book.addEventListener("pointerleave", layer.trailEnd);
  }

  /* 在某个元素"身下"晕开一圈墨（坐标换算到书页画布） */
  function rippleBehind(el, o) {
    if (!layer || !el) return;
    const r = el.getBoundingClientRect();
    const p = clientToCanvas(canvas, r.left + r.width / 2, r.top + r.height / 2);
    layer.ripple(p.x, p.y, o);
  }

  /* ============================================================
   * 登录表单
   * ============================================================ */
  (function () {
    const form = document.getElementById("loginForm");
    if (!form) return;

    const nameInput = document.getElementById("nameInput");
    const phoneInput = document.getElementById("phoneInput");
    const nameError = document.getElementById("nameError");
    const phoneError = document.getElementById("phoneError");
    const tip = document.getElementById("loginTip");

    function setError(input, errEl, msg) {
      errEl.textContent = msg || "";
      input.closest(".login__field").classList.toggle("is-error", !!msg);
    }

    [nameInput, phoneInput].forEach(function (input) {
      /* 聚焦：先晕开一层，提示"这里能揭出东西" */
      input.addEventListener("focus", function () {
        rippleBehind(input, { count: 10, spread: 90, rmax: 190 });
      });

      /* 打字：每敲一下就在输入框后面晕一圈 */
      input.addEventListener("input", function () {
        rippleBehind(input, { count: 8, spread: 80, rmax: 200 });
      });

      input.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" || e.key === "Delete") {
          rippleBehind(input, { count: 6, spread: 70, rmax: 160 });
        }
        if (e.key === "Enter") {
          rippleBehind(input, { count: 12, spread: 110, rmax: 220 });
        }
      });
    });

    nameInput.addEventListener("input", function () {
      setError(nameInput, nameError, "");
    });

    phoneInput.addEventListener("input", function () {
      phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 11);
      setError(phoneInput, phoneError, "");
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      let ok = true;

      const name = nameInput.value.trim();
      if (!name) {
        setError(nameInput, nameError, "请输入姓名");
        ok = false;
      }

      const phone = phoneInput.value.trim();
      if (!phone) {
        setError(phoneInput, phoneError, "请输入手机号");
        ok = false;
      } else if (!/^1[3-9]\d{9}$/.test(phone)) {
        setError(phoneInput, phoneError, "手机号格式不对，应为 11 位数字");
        ok = false;
      }

      if (!ok) {
        rippleBehind(nameInput, { count: 6, spread: 100, rmax: 150 });
        return;
      }

      /* 登录成功：整本书页大面积晕开，场景彻底显出来 */
      tip.textContent = "登录成功！欢迎你，" + name + " ～";
      tip.style.color = "#4c6b34";

      if (layer && paper) {
        const cols = 4;
        const rows = 3;
        for (let x = 1; x <= cols; x++) {
          for (let y = 1; y <= rows; y++) {
            layer.ripple(
              (paper.clientWidth * x) / (cols + 1),
              (paper.clientHeight * y) / (rows + 1),
              { count: 7, spread: 150, rmax: 230 }
            );
          }
        }
      }
    });
  })();

  /* ============================================================
   * 尺寸变化重新测量
   * ============================================================ */
  let resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (layer) layer.size();
    }, 150);
  });

  /* ============================================================
   * 垚垚的眼睛：虹膜圆片（立绘原图抠出的真实像素）会动
   * 追随鼠标 + 发呆游移 + 眨眼
   * ============================================================ */
  (function () {
    const figure = document.querySelector(".doll__figure");
    const eyes = Array.from(document.querySelectorAll(".doll__eye"));
    if (!figure || !eyes.length) return;

    const MAX = 3; // 眼球最大位移（显示像素）。幅度太大露出大片修补区会显得"空白"

    let tx = 0, ty = 0, cx = 0, cy = 0;
    let lastMove = 0;

    window.addEventListener("pointermove", function (e) {
      const r = figure.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.4);
      const dist = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dist / 240) * MAX;
      tx = (dx / dist) * k;
      ty = (dy / dist) * k * 0.7;
      lastMove = performance.now();
    });

    (function follow() {
      // 鼠标静止后开始发呆：缓慢游移，偶尔"对眼"
      const idle = performance.now() - lastMove > 1800;
      let gx = 0, gy = 0;
      if (idle) {
        const t = performance.now() / 1000;
        gx = Math.sin(t * 0.55) * 1.2;
        gy = Math.cos(t * 0.8) * 0.8;
      }

      cx += (tx + gx - cx) * 0.08; // 缓动慢半拍，眼神更柔
      cy += (ty + gy - cy) * 0.08;

      eyes.forEach(function (p, i) {
        const dx = i === 0 ? cx + 0.5 : cx - 0.5; // 两眼略微不同步
        p.style.transform =
          "translate(calc(-50% + " + dx.toFixed(2) + "px), calc(-50% + " + cy.toFixed(2) + "px))";
      });
      requestAnimationFrame(follow);
    })();

    /* 眨眼：两只眼睛永远同时眨 */
    (function blink() {
      eyes.forEach(function (el) {
        el.classList.add("is-blinking");
        setTimeout(function () { el.classList.remove("is-blinking"); }, 300);
      });
      setTimeout(blink, 1600 + Math.random() * 3200);
    })();
  })();
})();
