(function () {
  "use strict";

  // ====== Безопасный доступ к localStorage ======
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {}
    },
  };

  // ====== Ненавязчивый тост для обратной связи по хоткеям ======
  let toastTimer = null;
  function showToast(text) {
    if (!document.body) return;
    let el = document.getElementById("xw-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "xw-toast";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("visible"), 1600);
  }

  // ====== Видео: не даём X ставить на паузу, пока оно на экране ======
  (function keepVideoPlaying() {
    const DEBUG = false; // true — писать в консоль, кто и когда вызывает паузу
    const origPause = HTMLMediaElement.prototype.pause;
    const origPlay = HTMLMediaElement.prototype.play;

    // Ручные действия пользователя (клик, перемотка, K / пробел)
    let lastUserAction = 0;
    let pointerDown = false;
    const mark = () => {
      lastUserAction = Date.now();
    };
    window.addEventListener(
      "pointerdown",
      () => {
        pointerDown = true;
        mark();
      },
      true,
    );
    ["pointerup", "pointercancel", "mouseup", "click", "touchstart"].forEach(
      (t) =>
        window.addEventListener(
          t,
          () => {
            pointerDown = false;
            mark();
          },
          true,
        ),
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.code === "KeyK" || e.code === "Space") mark();
      },
      true,
    );
    const userIsActing = () =>
      pointerDown || Date.now() - lastUserAction < 1500;

    // Не вмешиваемся, когда открыто меню настроек/качества или модалка,
    // а также пока видео буферизуется или перематывается — иначе ломается загрузка потока.
    const isUiMenuOpen = () =>
      !!document.querySelector(
        '[role="menu"], [data-testid="Dropdown"], [role="dialog"]',
      );
    const canKeepPlaying = (v) =>
      v instanceof HTMLVideoElement &&
      !document.hidden &&
      !v.ended &&
      !v.seeking &&
      v.readyState >= 3 &&
      !userIsActing() &&
      !isUiMenuOpen() &&
      isOnScreen(v);

    const isOnScreen = (v) => {
      const r = v.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < window.innerHeight &&
        r.right > 0 &&
        r.left < window.innerWidth
      );
    };

    const selfPaused = new WeakSet();

    // 1) Блокируем программные вызовы pause() (например при потере фокуса окна)
    HTMLMediaElement.prototype.pause = function () {
      try {
        if (!selfPaused.has(this) && canKeepPlaying(this)) {
          if (DEBUG) console.log("[x-wide] pause() blocked", new Error().stack);
          return;
        }
      } catch (e) {}
      return origPause.apply(this, arguments);
    };

    // 2) Если паузу всё же обошли другим путём — сразу возобновляем
    const resumes = new WeakMap();
    document.addEventListener(
      "pause",
      (e) => {
        const v = e.target;
        if (!(v instanceof HTMLVideoElement)) return;
        if (selfPaused.has(v)) {
          selfPaused.delete(v);
          return;
        }
        if (!canKeepPlaying(v)) return;
        const now = Date.now();
        const hist = (resumes.get(v) || []).filter((t) => now - t < 1000);
        if (hist.length >= 5) return; // защита от бесконечной борьбы с X
        hist.push(now);
        resumes.set(v, hist);
        if (DEBUG) console.log("[x-wide] pause event -> resume");
        const pr = origPlay.call(v);
        if (pr && pr.catch) pr.catch(() => {});
      },
      true,
    );

    // 3) Только одно видео со звуком одновременно: при включении звука у ролика
    // ставим на паузу остальные играющие видео со звуком.
    const silenceOthers = (active) => {
      if (
        !(active instanceof HTMLVideoElement) ||
        active.muted ||
        active.volume === 0
      )
        return;
      document.querySelectorAll("video").forEach((other) => {
        if (
          other !== active &&
          !other.paused &&
          !other.muted &&
          other.volume > 0
        ) {
          selfPaused.add(other);
          origPause.call(other);
        }
      });
    };
    document.addEventListener("play", (e) => silenceOthers(e.target), true);
    document.addEventListener(
      "volumechange",
      (e) => {
        if (e.target instanceof HTMLVideoElement && !e.target.paused)
          silenceOthers(e.target);
      },
      true,
    );
  })();

  const css = `
        /* ====== Тонкий скроллбар для оконного режима ====== */
        html {
            scrollbar-width: thin;
        }

        /* ====== Тост уведомлений ====== */
        #xw-toast {
            position: fixed;
            left: 50%;
            bottom: 20px;
            transform: translateX(-50%) translateY(10px);
            z-index: 99999;
            padding: 8px 14px;
            border-radius: 999px;
            background: rgba(20, 20, 24, 0.9);
            color: #fff;
            font: 500 13px/1.2 system-ui, -apple-system, sans-serif;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
            border: 1px solid rgba(255, 255, 255, 0.14);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.16s ease, transform 0.16s ease;
        }
        #xw-toast.visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        /* ====== Левая панель: прячем за край ====== */
        body.hide-nav header[role="banner"] {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            z-index: 1000 !important;
            background-color: var(--xw-bg, rgb(0, 0, 0)) !important;
            border-right: 1px solid rgba(128, 128, 128, 0.22) !important;
            transform: translateX(calc(-100% + 12px)) !important;
            transition: transform 0.2s ease, box-shadow 0.2s ease !important;
            height: 100% !important;
        }
        body.hide-nav header[role="banner"]::after {
            content: "";
            position: absolute;
            top: 50%;
            right: 4px;
            width: 3px;
            height: 36px;
            transform: translateY(-50%);
            border-radius: 999px;
            background: rgba(128, 128, 128, 0.45);
            pointer-events: none;
            transition: opacity 0.18s ease;
        }
        body.hide-nav header[role="banner"].nav-open {
            transform: translateX(0) !important;
            box-shadow: 6px 0 24px rgba(0, 0, 0, 0.45) !important;
        }
        body.hide-nav header[role="banner"].nav-open::after {
            opacity: 0;
        }

        /* ====== Zen-режим (Alt+Z): убираем нижние плавающие дроверы ====== */
        body.xw-zen div[data-testid="DMDrawer"],
        body.xw-zen div[data-testid="GrokDrawer"] {
            display: none !important;
        }

        /* ====== Контент во всю ширину ====== */
        main[role="main"] {
            flex: 1 1 auto !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            align-items: stretch !important;
        }
        #react-root div:has(> main[role="main"]) {
            justify-content: flex-start !important;
        }
        main[role="main"] > div,
        main[role="main"] > div > div {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        /* ====== Колонка постов ====== */
        div[data-testid="primaryColumn"] {
            max-width: 100% !important;
            width: 100% !important;
            flex-grow: 1 !important;
            margin: 0 !important;
            border-right: none !important;
        }

        /* ====== Убираем боковые поля у карточек ====== */
        div[data-testid="cellInnerDiv"] {
            padding-left: 0 !important;
            padding-right: 0 !important;
        }
        article[data-testid="tweet"] {
            padding-left: 8px !important;
            padding-right: 8px !important;
        }
        .x-media-wide {
            box-sizing: border-box !important;
            margin-left: calc(-1 * var(--xoff, 0px)) !important;
            width: calc(100% + var(--xoff, 0px)) !important;
            max-width: none !important;
        }

        /* ====== Правая панель — скрыта ====== */
        div[data-testid="sidebarColumn"] {
            display: none !important;
        }

        /* ====== Фото целиком ====== */
        div[data-testid="tweetPhoto"],
        div[data-testid="tweetPhoto"] > div {
            max-height: none !important;
            aspect-ratio: auto !important;
        }
        div[data-testid="tweetPhoto"] img {
            object-fit: contain !important;
            max-height: 85vh !important;
            max-height: 85dvh !important;
        }

        /* ====== Видео и фото: по пропорциям, но не выше окна ====== */
        [data-vfit="1"] {
            --w: min(calc(100% + var(--xoff, 0px)), calc(90vh * var(--ar, 1)));
            --w: min(calc(100% + var(--xoff, 0px)), calc(90dvh * var(--ar, 1)));
            width: var(--w) !important;
            margin-left: calc((100% + var(--xoff, 0px) - var(--w)) / 2 - var(--xoff, 0px)) !important;
            max-width: none !important;
        }

        /* Фото внутри подогнанного блока — без собственного потолка по высоте */
        [data-vfit="1"] div[data-testid="tweetPhoto"] img {
            max-height: none !important;
        }

        /* Своя картинка вместо обрезанной X: оригиналы скрываем */
        .xw-own { display: block !important; width: 100% !important; }
        .xw-own img {
            display: block !important;
            width: 100% !important;
            height: auto !important;
            border-radius: 16px !important;
            cursor: pointer;
        }
        .xw-photo-block {
            height: auto !important;
            max-height: none !important;
            aspect-ratio: auto !important;
            padding: 0 !important;
        }
        .xw-photo-block > :not(.xw-own) { display: none !important; }

        /* Остальные фото (сетки и т.п.): фон тоже без обрезки */
        div[data-testid="tweetPhoto"] [style*="background-image"] {
            background-size: contain !important;
            background-repeat: no-repeat !important;
            background-position: center !important;
        }

        /* ====== Видео ====== */
        div[data-testid="videoPlayer"] video,
        div[data-testid="videoComponent"] video {
            object-fit: contain !important;
        }
    `;

  // Замена GM_addStyle
  function addStyle(text) {
    const style = document.createElement("style");
    style.textContent = text;
    (document.head || document.documentElement).appendChild(style);
  }

  // Скрипт в Pake может выполниться до появления DOM — ждём
  function onReady(fn) {
    if (document.documentElement) fn();
    else
      new MutationObserver((_, obs) => {
        if (document.documentElement) {
          obs.disconnect();
          fn();
        }
      }).observe(document, { childList: true });
  }

  onReady(() => addStyle(css));

  // ====== Режим скрытой панели, Zen-режим, плавный скролл и фон темы ======
  const NAV_STORAGE_KEY = "xw-hide-nav";
  const ZEN_STORAGE_KEY = "xw-zen";
  const SMOOTH_STORAGE_KEY = "xw-smooth-scroll";
  let navEnabled = store.get(NAV_STORAGE_KEY, "1") !== "0";
  let zenEnabled = store.get(ZEN_STORAGE_KEY, "0") === "1";
  let smoothEnabled = store.get(SMOOTH_STORAGE_KEY, "1") !== "0";

  const syncBodyState = () => {
    if (!document.body) return;
    if (document.body.classList.contains("hide-nav") !== navEnabled) {
      document.body.classList.toggle("hide-nav", navEnabled);
    }
    if (document.body.classList.contains("xw-zen") !== zenEnabled) {
      document.body.classList.toggle("xw-zen", zenEnabled);
    }
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      document.documentElement.style.setProperty("--xw-bg", bg);
    }
  };

  const initBodyObserver = () => {
    if (!document.body) return;
    syncBodyState();
    new MutationObserver(syncBodyState).observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
  };

  if (document.body) initBodyObserver();
  else
    window.addEventListener("DOMContentLoaded", initBodyObserver, {
      once: true,
    });
  window.addEventListener("popstate", syncBodyState);

  // Открытие/закрытие панели по курсору с небольшой задержкой на закрытие
  const HEADER_SEL = 'header[role="banner"]';
  let closeTimer = null;
  document.addEventListener(
    "mouseover",
    (e) => {
      const h = e.target.closest && e.target.closest(HEADER_SEL);
      if (!h) return;
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      h.classList.add("nav-open");
    },
    true,
  );
  document.addEventListener(
    "mouseout",
    (e) => {
      const h = e.target.closest && e.target.closest(HEADER_SEL);
      if (h && !(e.relatedTarget && h.contains(e.relatedTarget))) {
        closeTimer = setTimeout(() => h.classList.remove("nav-open"), 180);
      }
    },
    true,
  );

  // ====== Горячие клавиши для оконного режима (Pake) ======
  const isTyping = (e) => {
    const t = e.target;
    return (
      t instanceof Element &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
    );
  };

  async function copyCurrentUrl() {
    const url = location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        showToast("Ссылка скопирована");
        return;
      }
    } catch (e) {}
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast("Ссылка скопирована");
    } catch (e) {
      showToast("Не удалось скопировать");
    }
    ta.remove();
  }

  window.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;

    // Alt+B — скрыть/закрепить левую панель
    if (e.code === "KeyB") {
      e.preventDefault();
      navEnabled = !navEnabled;
      store.set(NAV_STORAGE_KEY, navEnabled ? "1" : "0");
      syncBodyState();
      showToast(navEnabled ? "Панель скрыта" : "Панель закреплена");
      return;
    }

    // Alt+Z — скрыть/показать плавающие дроверы (DM / Grok)
    if (e.code === "KeyZ") {
      e.preventDefault();
      zenEnabled = !zenEnabled;
      store.set(ZEN_STORAGE_KEY, zenEnabled ? "1" : "0");
      syncBodyState();
      showToast(zenEnabled ? "Дроверы скрыты" : "Дроверы показаны");
      return;
    }

    // Alt+S — включить/выключить плавную прокрутку колёсиком
    if (e.code === "KeyS") {
      e.preventDefault();
      smoothEnabled = !smoothEnabled;
      store.set(SMOOTH_STORAGE_KEY, smoothEnabled ? "1" : "0");
      showToast(
        smoothEnabled ? "Плавная прокрутка: вкл" : "Плавная прокрутка: выкл",
      );
      return;
    }

    // Alt+C — скопировать текущий URL (удобно без адресной строки)
    if (e.code === "KeyC") {
      e.preventDefault();
      copyCurrentUrl();
      return;
    }

    if (isTyping(e)) return;

    // Alt+Left / Alt+Right — навигация Назад / Вперёд
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      history.back();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      history.forward();
    } else if (e.code === "KeyT") {
      // Alt+T — плавно наверх
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  // ====== Плавная прокрутка колёсиком (актуально для WebKitGTK / Pake) ======
  // Используем относительный остаток (remaining), а не абсолютный targetY,
  // чтобы не конфликтовать с виртуализацией ленты X, и dt-интерполяцию
  // для одинаковой плавности на 60/120/144/240 Гц.
  (function smoothWheelScroll() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let targetEl = null;
    let remaining = 0;
    let rafId = 0;
    let lastTs = 0;

    const stop = () => {
      remaining = 0;
      targetEl = null;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const findScrollable = (startNode, deltaY) => {
      const root = document.scrollingElement || document.documentElement;
      let el = startNode instanceof Element ? startNode : null;
      while (el && el !== document.body && el !== document.documentElement) {
        const style = getComputedStyle(el);
        const oy = style.overflowY;
        if (
          (oy === "auto" || oy === "scroll" || oy === "overlay") &&
          el.scrollHeight > el.clientHeight + 1
        ) {
          const maxTop = el.scrollHeight - el.clientHeight;
          if (
            (deltaY > 0 && el.scrollTop < maxTop - 1) ||
            (deltaY < 0 && el.scrollTop > 1)
          ) {
            return el;
          }
        }
        el = el.parentElement;
      }
      return root;
    };

    const step = (ts) => {
      if (
        !targetEl ||
        !targetEl.isConnected ||
        !smoothEnabled ||
        Math.abs(remaining) < 0.5
      ) {
        stop();
        return;
      }
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 1 / 60;
      lastTs = ts;

      // Экспоненциальное затухание: плавно и без «вязкости»
      const factor = 1 - Math.exp(-14 * dt);
      const delta = remaining * factor;
      remaining -= delta;

      const root = document.scrollingElement || document.documentElement;
      const before = targetEl.scrollTop;
      if (targetEl === root) {
        window.scrollBy(0, delta);
      } else {
        targetEl.scrollTop += delta;
      }

      // Упёрлись в край страницы/контейнера — останавливаем инерцию
      if (Math.abs(targetEl.scrollTop - before) < 0.1 && Math.abs(delta) > 1) {
        stop();
        return;
      }

      rafId = requestAnimationFrame(step);
    };

    window.addEventListener(
      "wheel",
      (e) => {
        if (!smoothEnabled || reducedMotion.matches) return;
        if (e.defaultPrevented || e.ctrlKey || e.metaKey) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        if (e.deltaY === 0) return;

        // Тачпад на Wayland уже даёт мелкие плавные пиксельные события — не мешаем ему
        if (e.deltaMode === 0 && Math.abs(e.deltaY) < 25) return;

        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 36;
        else if (e.deltaMode === 2) dy *= window.innerHeight * 0.85;

        const el = findScrollable(e.target, dy);
        if (!el) return;

        e.preventDefault();

        if (targetEl !== el) {
          targetEl = el;
          remaining = 0;
        }
        // Ограничиваем накопление, чтобы при быстрой прокрутке не было задержки
        remaining = Math.max(-1600, Math.min(1600, remaining + dy * 1.15));

        if (!rafId) {
          lastTs = 0;
          rafId = requestAnimationFrame(step);
        }
      },
      { passive: false },
    );

    window.addEventListener("pointerdown", stop, true);
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "PageUp",
            "PageDown",
            "Home",
            "End",
            "Space",
          ].includes(e.code)
        ) {
          stop();
        }
      },
      true,
    );
    window.addEventListener("popstate", stop);
  })();

  const MEDIA_SEL =
    '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="card.wrapper"]';

  // Блок медиа = прямой потомок колонки контента, внутри которого лежит el
  function getBlock(article, el) {
    const avatar = article.querySelector('[data-testid="Tweet-User-Avatar"]');
    const nameEl = article.querySelector('[data-testid="User-Name"]');
    if (!avatar || !nameEl) return null;

    let column = nameEl.parentElement;
    while (column && !column.contains(el)) column = column.parentElement;
    if (!column) return null;

    // На узких окнах (размер телефона) offset может быть 0 — всё равно обрабатываем блок,
    // чтобы replacePhoto() и fitMedia() не пропускали медиа.
    const offset = Math.max(
      0,
      Math.round(
        column.getBoundingClientRect().left -
          avatar.getBoundingClientRect().left,
      ),
    );

    let block = el;
    while (block.parentElement && block.parentElement !== column)
      block = block.parentElement;
    if (block.parentElement !== column) return null;
    return { block, offset };
  }

  // Растягиваем блок на всю ширину карточки (под аватар) и обновляем при ресайзе
  function applyWide(block, offset) {
    const prev = Number(block.dataset.xoff || -1);
    if (block.dataset.wide === "1" && Math.abs(prev - offset) <= 1) return;
    block.dataset.wide = "1";
    block.dataset.xoff = String(offset);
    block.classList.add("x-media-wide");
    block.style.setProperty("--xoff", offset + "px");
  }

  function widenMedia(article) {
    article.querySelectorAll(MEDIA_SEL).forEach((m) => {
      const info = getBlock(article, m);
      if (info) applyWide(info.block, info.offset);
    });
  }

  // ResizeObserver ловит плееры, которые на первом кадре ещё имели нулевой размер
  const videoRO =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => {
          for (const entry of entries) {
            const player = entry.target;
            if (
              entry.contentRect.width >= 50 &&
              entry.contentRect.height >= 50
            ) {
              videoRO.unobserve(player);
              const article = player.closest('article[data-testid="tweet"]');
              if (article) {
                dirtyArticles.add(article);
                scheduleFlush();
              }
            }
          }
        })
      : null;

  // Подгоняем блок видео: ширина = min(вся ширина, 90% высоты окна * пропорции)
  function fitMedia(article) {
    article
      .querySelectorAll('[data-testid="videoPlayer"]')
      .forEach((player) => {
        const block = player.closest('[data-wide="1"]');
        if (!block || block.dataset.vfit === "1") return;

        const r = player.getBoundingClientRect();
        if (r.width < 50 || r.height < 50) {
          // Ещё не отрисован — подписываемся на ResizeObserver, чтобы точно пересчитать
          if (videoRO) videoRO.observe(player);
          return;
        }
        const ratio = r.width / r.height;
        if (ratio < 0.2 || ratio > 5) return;
        block.style.setProperty("--ar", ratio.toFixed(4));
        block.dataset.vfit = "1";

        // X сам сужает высокие медиа (max-height/max-width у обёрток).
        // Снимаем эти ограничения и растягиваем узкие обёртки на весь блок.
        const bw = block.getBoundingClientRect().width;
        let el = player;
        while (el && el !== block) {
          el.style.setProperty("max-width", "none", "important");
          el.style.setProperty("max-height", "none", "important");
          if (el.getBoundingClientRect().width < bw - 8) {
            el.style.setProperty("width", "100%", "important");
          }
          el = el.parentElement;
        }
      });
  }

  // ====== Одиночные фото: показываем целиком, без обрезки X ======
  // X режет высокие картинки в ленте. Вместо борьбы с его вёрсткой
  // кладём в блок собственную <img> в оригинальном размере.
  const mediaId = (u) => ((u || "").match(/\/media\/([^?/.]+)/) || [])[1];
  // Если X уже загрузил нормальный размер (medium / 900x900 / large / orig),
  // берём тот же URL из кэша браузера, чтобы не качать каждую картинку дважды.
  const pickPhotoSrc = (u) => {
    if (!u) return u;
    if (/[?&]name=(small|thumb|120x120|240x240|360x360)(?:&|$)/.test(u)) {
      return u.replace(/([?&]name=)[^&]+/, "$1medium");
    }
    return u;
  };

  function replacePhoto(article) {
    article.querySelectorAll('[data-testid="tweetPhoto"]').forEach((photo) => {
      const info = getBlock(article, photo);
      if (!info) return;
      const { block, offset } = info;
      const orig = photo.querySelector("img");
      if (!orig || !orig.src) return;
      const id = mediaId(orig.src);
      if (!id) return;

      // Уже заменено: проверяем, что узел не переиспользован для другого типа поста (сетка/видео) или другого фото
      if (block.dataset.xwphoto) {
        const stillSinglePhoto =
          block.querySelectorAll('[data-testid="tweetPhoto"]').length === 1 &&
          !block.querySelector(
            '[data-testid="User-Name"], [data-testid="tweetText"], [role="button"], button, video',
          );
        if (!stillSinglePhoto) {
          block.querySelector(".xw-own")?.remove();
          block.classList.remove("xw-photo-block");
          delete block.dataset.xwphoto;
          delete block.dataset.vfit;
          block.style.removeProperty("--ar");
          return;
        }
        const own = block.querySelector(".xw-own img");
        if (own && mediaId(own.src) !== id) {
          delete block.dataset.vfit;
          block.style.removeProperty("--ar");
          own.style.removeProperty("aspect-ratio");
          own.alt = orig.alt || "";
          own.src = pickPhotoSrc(orig.src);
        }
        return;
      }

      // Только одиночное фото; цитаты, сетки и блоки с кнопками
      // (предупреждение о чувствительном контенте и т.п.) не трогаем
      if (block.querySelectorAll('[data-testid="tweetPhoto"]').length !== 1)
        return;
      if (
        block.querySelector(
          '[data-testid="User-Name"], [data-testid="tweetText"], [role="button"], button, video',
        )
      )
        return;

      block.dataset.xwphoto = "1";
      applyWide(block, offset);

      const wrap = document.createElement("div");
      wrap.className = "xw-own";
      const img = document.createElement("img");
      img.alt = orig.alt || "";
      img.decoding = "async";
      img.addEventListener("click", (e) => {
        const link =
          block.querySelector('[data-testid="tweetPhoto"]')?.closest("a") ||
          block.querySelector("a");
        if (link) {
          e.preventDefault();
          e.stopPropagation();
          link.click();
        }
      });
      img.addEventListener("load", () => {
        if (!img.naturalWidth || !img.naturalHeight) return;
        img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        block.style.setProperty(
          "--ar",
          (img.naturalWidth / img.naturalHeight).toFixed(4),
        );
        block.dataset.vfit = "1";
        block.classList.add("xw-photo-block");
      });
      img.addEventListener("error", () => {
        wrap.remove(); // не вышло — возвращаем оригинал X
        block.classList.remove("xw-photo-block");
        delete block.dataset.xwphoto;
        delete block.dataset.vfit;
      });
      img.src = pickPhotoSrc(orig.src);
      wrap.appendChild(img);
      block.appendChild(wrap);
    });
  }

  function processArticle(article) {
    try {
      widenMedia(article);
      replacePhoto(article);
      fitMedia(article);
    } catch (e) {}
  }

  // Очередь только для изменившихся твитов (без лишнего обхода всей страницы)
  const dirtyArticles = new Set();
  let fullRescan = false;
  let rafPending = false;

  function flushArticles() {
    rafPending = false;
    const list = fullRescan
      ? document.querySelectorAll('article[data-testid="tweet"]')
      : Array.from(dirtyArticles);
    fullRescan = false;
    dirtyArticles.clear();
    list.forEach((a) => {
      if (a.isConnected) processArticle(a);
    });
  }

  function scheduleFlush() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(flushArticles);
  }

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      const targetEl = m.target instanceof Element ? m.target : null;
      const parentArticle = targetEl?.closest?.('article[data-testid="tweet"]');
      if (parentArticle) dirtyArticles.add(parentArticle);

      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('article[data-testid="tweet"]')) {
          dirtyArticles.add(node);
        } else {
          node
            .querySelectorAll?.('article[data-testid="tweet"]')
            .forEach((a) => dirtyArticles.add(a));
        }
      }
    }
    if (dirtyArticles.size > 0) scheduleFlush();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });

  // Начальный проход, если скрипт подключился уже после первичного рендера
  onReady(() => {
    fullRescan = true;
    scheduleFlush();
  });

  // Пересчёт отступов при изменении размера окна (актуально для тайлинга в Hyprland)
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      fullRescan = true;
      scheduleFlush();
    }, 120);
  });
})();
