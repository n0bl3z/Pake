(function () {
    'use strict';

    // ====== Видео: не даём X ставить на паузу, пока оно на экране ======
    (function keepVideoPlaying() {
        const DEBUG = false; // true — писать в консоль, кто и когда вызывает паузу
        const origPause = HTMLMediaElement.prototype.pause;
        const origPlay = HTMLMediaElement.prototype.play;

        // Ручные действия пользователя (клик, перемотка, K / пробел)
        let lastUserAction = 0;
        let pointerDown = false;
        const mark = () => { lastUserAction = Date.now(); };
        window.addEventListener('pointerdown', () => { pointerDown = true; mark(); }, true);
        ['pointerup', 'pointercancel', 'mouseup', 'click', 'touchstart'].forEach((t) =>
            window.addEventListener(t, () => { pointerDown = false; mark(); }, true)
        );
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyK' || e.code === 'Space') mark();
        }, true);
        const userIsActing = () => pointerDown || Date.now() - lastUserAction < 800;

        const isOnScreen = (v) => {
            const r = v.getBoundingClientRect();
            return r.width > 0 && r.height > 0 &&
                r.bottom > 0 && r.top < window.innerHeight &&
                r.right > 0 && r.left < window.innerWidth;
        };

        // 1) Блокируем программные вызовы pause()
        HTMLMediaElement.prototype.pause = function () {
            try {
                if (this instanceof HTMLVideoElement && !document.hidden &&
                    !userIsActing() && isOnScreen(this)) {
                    if (DEBUG) console.log('[x-wide] pause() blocked', new Error().stack);
                    return;
                }
            } catch (e) { }
            return origPause.apply(this, arguments);
        };

        // 2) Если паузу всё же обошли другим путём — сразу возобновляем
        const resumes = new WeakMap();
        document.addEventListener('pause', (e) => {
            const v = e.target;
            if (!(v instanceof HTMLVideoElement)) return;
            if (document.hidden || v.ended || userIsActing() || !isOnScreen(v)) return;
            const now = Date.now();
            const hist = (resumes.get(v) || []).filter((t) => now - t < 1000);
            if (hist.length >= 5) return; // защита от бесконечной борьбы с X
            hist.push(now);
            resumes.set(v, hist);
            if (DEBUG) console.log('[x-wide] pause event -> resume');
            const pr = origPlay.call(v);
            if (pr && pr.catch) pr.catch(() => { });
        }, true);
    })();

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

        /* ====== Видео и фото: по пропорциям, но не выше окна ====== */
        [data-vfit="1"] {
            --w: min(calc(100% + var(--xoff, 0px)), calc(90vh * var(--ar, 1)));
            width: var(--w) !important;
            margin-left: calc((100% + var(--xoff, 0px) - var(--w)) / 2 - var(--xoff, 0px)) !important;
            max-width: none !important;
        }

        /* Фото внутри подогнанного блока — без собственного потолка по высоте */
        [data-vfit="1"] div[data-testid="tweetPhoto"] img {
            max-height: none !important;
        }

        /* ====== Видео ====== */
        div[data-testid="videoPlayer"] video,
        div[data-testid="videoComponent"] video {
            object-fit: contain !important;
        }
    `;

    // Замена GM_addStyle
    function addStyle(text) {
        const style = document.createElement('style');
        style.textContent = text;
        (document.head || document.documentElement).appendChild(style);
    }

    // Скрипт в Pake может выполниться до появления DOM — ждём
    function onReady(fn) {
        if (document.documentElement) fn();
        else new MutationObserver((_, obs) => {
            if (document.documentElement) { obs.disconnect(); fn(); }
        }).observe(document, { childList: true });
    }

    onReady(addStyle.bind(null, css));

    // Режим скрытой панели. Класс на body периодически проверяем:
    // после навигации «назад» X может пересоздать элементы и сбросить его.
    let navEnabled = true;
    const applyNav = () => {
        if (navEnabled && document.body && !document.body.classList.contains('hide-nav')) {
            document.body.classList.add('hide-nav');
        }
    };
    applyNav();
    setInterval(applyNav, 500);
    window.addEventListener('popstate', applyNav);

    // Открытие/закрытие панели по курсору через делегирование событий:
    // работает с любым header, даже если X пересоздал его (кнопка «назад»).
    const HEADER_SEL = 'header[role="banner"]';
    document.addEventListener('mouseover', (e) => {
        const h = e.target.closest && e.target.closest(HEADER_SEL);
        if (h) h.classList.add('nav-open');
    }, true);
    document.addEventListener('mouseout', (e) => {
        const h = e.target.closest && e.target.closest(HEADER_SEL);
        if (h && !(e.relatedTarget && h.contains(e.relatedTarget))) {
            h.classList.remove('nav-open');
        }
    }, true);

    // Alt+B — включить/выключить режим скрытой панели
    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.code === 'KeyB') {
            navEnabled = !navEnabled;
            if (document.body) document.body.classList.toggle('hide-nav', navEnabled);
        }
    });

    // Растягиваем медиа на всю ширину карточки (под аватар)
    function widenMedia(article) {
        const avatar = article.querySelector('[data-testid="Tweet-User-Avatar"]');
        const nameEl = article.querySelector('[data-testid="User-Name"]');
        if (!avatar || !nameEl) return;

        const media = article.querySelectorAll(
            '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="card.wrapper"]'
        );
        if (!media.length) return;

        // Колонка контента = ближайший общий предок имени автора и медиа
        let column = nameEl.parentElement;
        while (column && !column.contains(media[0])) column = column.parentElement;
        if (!column) return;

        const offset = column.getBoundingClientRect().left - avatar.getBoundingClientRect().left;
        if (offset <= 0) return;

        media.forEach((m) => {
            // Прямой потомок колонки, внутри которого лежит медиа
            let block = m;
            while (block.parentElement && block.parentElement !== column) block = block.parentElement;
            if (block.parentElement !== column || block.dataset.wide === '1') return;
            block.dataset.wide = '1';
            block.classList.add('x-media-wide');
            block.style.marginLeft = `-${offset}px`;
            block.style.width = `calc(100% + ${offset}px)`;
            block.style.maxWidth = 'none';
            block.style.setProperty('--xoff', offset + 'px');
        });
    }

    // Подгоняем блок видео/фото: ширина = min(вся ширина, 90% высоты окна * пропорции)
    function fitMedia(article) {
        article
            .querySelectorAll('[data-testid="videoPlayer"], [data-testid="tweetPhoto"]')
            .forEach((player) => {
                const block = player.closest('[data-wide="1"]');
                if (!block || block.dataset.vfit === '1') return;

                // Сетку из нескольких фото не трогаем — X раскладывает её сам
                if (block.querySelectorAll('[data-testid="tweetPhoto"]').length > 1) return;

                const r = player.getBoundingClientRect();
                if (r.width < 50 || r.height < 50) return; // ещё не отрисован — повторим
                const ratio = r.width / r.height;
                if (ratio < 0.2 || ratio > 5) return;
                block.style.setProperty('--ar', ratio.toFixed(4));
                block.dataset.vfit = '1';

                // X сам сужает высокие медиа (max-height/max-width у обёрток).
                // Снимаем эти ограничения и растягиваем узкие обёртки на весь блок.
                const bw = block.getBoundingClientRect().width;
                let el = player;
                while (el && el !== block) {
                    el.style.setProperty('max-width', 'none', 'important');
                    el.style.setProperty('max-height', 'none', 'important');
                    if (el.getBoundingClientRect().width < bw - 8) {
                        el.style.setProperty('width', '100%', 'important');
                    }
                    el = el.parentElement;
                }
            });
    }

    let rafPending = false;
    function scanTweets() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => {
                widenMedia(a);
                fitMedia(a);
            });
        });
    }
    new MutationObserver(scanTweets).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
})();
