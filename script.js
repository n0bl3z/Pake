(function () {
  "use strict";

  const css = `
        /* ====== Левая панель: спрятана за край ====== */
        body.hide-nav header[role="banner"] {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            z-index: 1000 !important;
            transform: translateX(calc(-100% + 14px)) !important;
            transition: transform 0.22s ease !important;
            height: 100% !important;
        }
        body.hide-nav header[role="banner"].nav-open {
            transform: translateX(0) !important;
            box-shadow: 4px 0 16px rgba(0, 0, 0, 0.35) !important;
        }

        /* ====== Контент во всю ширину ====== */
        body.hide-nav main[role="main"] {
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
            padding-left: 6px !important;
            padding-right: 6px !important;
        }
        .x-media-wide {
            box-sizing: border-box !important;
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
        }

        /* ====== Видео ====== */
        div[data-testid="videoPlayer"] video,
        div[data-testid="videoComponent"] video {
            object-fit: contain !important;
            max-height: 85vh !important;
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

  onReady(addStyle.bind(null, css));

  // Включаем режим скрытой панели
  const applyNav = () => document.body.classList.add("hide-nav");
  if (document.body) applyNav();
  else
    new MutationObserver((_, obs) => {
      if (document.body) {
        applyNav();
        obs.disconnect();
      }
    }).observe(document.documentElement, { childList: true });

  // Открытие/закрытие панели по курсору
  let wired = false;
  function wireNav() {
    const header = document.querySelector('header[role="banner"]');
    if (!header || wired) return;
    wired = true;
    header.addEventListener("mouseenter", () =>
      header.classList.add("nav-open"),
    );
    header.addEventListener("mouseleave", () =>
      header.classList.remove("nav-open"),
    );
  }
  const navTimer = setInterval(() => {
    wireNav();
    if (wired) clearInterval(navTimer);
  }, 500);

  // Alt+B — включить/выключить режим скрытой панели
  window.addEventListener("keydown", (e) => {
    if (e.altKey && e.code === "KeyB") {
      document.body.classList.toggle("hide-nav");
    }
  });

  // Растягиваем медиа на всю ширину карточки (под аватар)
  function widenMedia(article) {
    const avatar = article.querySelector('[data-testid="Tweet-User-Avatar"]');
    const nameEl = article.querySelector('[data-testid="User-Name"]');
    if (!avatar || !nameEl) return;

    const media = article.querySelectorAll(
      '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="card.wrapper"]',
    );
    if (!media.length) return;

    // Колонка контента = ближайший общий предок имени автора и медиа
    let column = nameEl.parentElement;
    while (column && !column.contains(media[0])) column = column.parentElement;
    if (!column) return;

    const offset =
      column.getBoundingClientRect().left - avatar.getBoundingClientRect().left;
    if (offset <= 0) return;

    media.forEach((m) => {
      // Прямой потомок колонки, внутри которого лежит медиа
      let block = m;
      while (block.parentElement && block.parentElement !== column)
        block = block.parentElement;
      if (block.parentElement !== column || block.dataset.wide === "1") return;
      block.dataset.wide = "1";
      block.classList.add("x-media-wide");
      block.style.marginLeft = `-${offset}px`;
      block.style.width = `calc(100% + ${offset}px)`;
      block.style.maxWidth = "none";
    });
  }

  let rafPending = false;
  function scanTweets() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      document
        .querySelectorAll('article[data-testid="tweet"]')
        .forEach(widenMedia);
    });
  }
  new MutationObserver(scanTweets).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
