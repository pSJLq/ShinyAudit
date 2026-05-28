# Дизайн-ревью {s}hinyAudit (прототип от Claude Design)

Проверено: 2026-05-24, разрешения 1440×900 / 375×812.
DOM/runtime — без ошибок, только ожидаемый warning про in-browser Babel.

## ✅ Что попало в цель

| Чек | Статус |
|-----|--------|
| 8 секций промта в правильном порядке | ✓ |
| Сплит violet (user) / blue (system) везде | ✓ |
| Brand-маркер `{s}` фиолетовый, остальное белое | ✓ |
| Анимированный pixel-grid в hero (диагональная волна, canvas + RAF) | ✓ |
| Force-directed swarm graph (intent + 6 агентов + поток данных) | ✓ |
| CRT scanlines + vignette overlay | ✓ |
| Реалистичные mock-логи (txhash, eth_call, consensus N/M) | ✓ |
| Cost ledger + founder mode `> sudo dispatch` | ✓ |
| Easter eggs: `/` фокус, Konami, idle-силуэт `{s}` | ✓ |
| Real sankey-флоу с amber/red flagged путями | ✓ |
| Адаптив: nav-links и ambient прячутся на mobile | ✓ |
| Geist Mono подключён через Google Fonts | ✓ |
| Все 4 agent-rows с rolling log + progress bar в runtime | ✓ |

Дизайн **точно следует брифу** и реализует все 16 секций промта.

## ⚠️ Что нужно поправить (по убыванию приоритета)

### CRIT-1 · Hero title вылазит за вьюпорт на 1440 и на mobile
Видно на 1440 px: "any contract," обрезается до "any contra". На mobile 375 px — даже clamped 56 px вылазит ("investigate" → "investigat").
- **Фикс:** clamp нужно ужать до `clamp(40px, 8vw, 112px)`, добавить `overflow-wrap: break-word` или сократить строки до 2 на mobile ("> investigate / any flow.").

### CRIT-2 · Sample receipt JSON выводится с экранированными кавычками
В `capabilities-cost.jsx` строка `"{ \"verdict\": \"…\" }"` рендерится как литерал JSX-текст, в браузере отображается с обратными слешами.
- **Фикс:** заменить на JS-литерал без экранирования или использовать `<pre>{`{ "verdict": "..." }`}</pre>`.

### HIGH-1 · React + Babel-standalone через CDN — только для прототипа
Babel компилирует JSX в браузере → ~2-3 сек блокирующая загрузка + ворнинг в консоли. Для демо хакатона ок, для продакшена надо Next.js.
- **Фикс:** этап 2 (перевод в Next.js).

### HIGH-2 · Pixel grid в hero может тормозить
До ~1500 cells × 60 FPS + DPR multiplier. На слабых ноутах FPS просядет.
- **Фикс:** снизить `density` до 0.10–0.12 для hero и/или ограничить wave-зону.

### MED-1 · Footer 5 колонок (1.4 / 1 / 1 / 1 / 1)
В промте было 3 центральные колонки. Текущие 4 (`product / docs / community / build`) — нормально, но **пятая колонка "build"** дублирует половину функции nav и перегружает футер.
- **Фикс:** свести к `product / docs / community`, перенести `request access / bug bounty` в community.

### MED-2 · Иконки capability tiles все blue
В промте было `accent/blue stroke` — это норма, но стилистически 6 одинаково-синих квадратов выглядят однородно. Можно добавить лёгкое визуальное различие (плотность штриха или 1–2 акцентных штриха violet).
- **Фикс:** опционально, не критично.

### MED-3 · Ambient panel слишком плотный на 1440
Высота 380 px, hero 100vh = 900 → панель занимает ⅓ правой колонки и визуально "давит" на заголовок.
- **Фикс:** уменьшить до 320 px высоты или добавить больше gap между hero-content и panel.

### LOW-1 · Wallet connect — fake-toggle
`setConnected(true)` без реальной интеграции. Для прототипа ок.
- **Фикс:** этап 2 (wagmi + viem + Somnia chain config).

### LOW-2 · Heading-eyebrow нумерация `01 02 03 04 05 06`
Слегка перегружает страницу нумерацией. Можно оставить, но в дизайне Somnia такого паттерна не было.
- **Фикс:** опционально убрать.

### LOW-3 · Footer ссылки все `href="#"`
Нет реальных ссылок на Telegram/Discord/GitHub. Для прототипа ок.
- **Фикс:** проставить реальные URL Somnia в этапе 2.

## 🎬 Видео-демо потенциал

Дизайн **отлично выглядит в записи**: scroll-сториз через 8 секций + dispatch swarm с runtime-анимацией = идеальный 2-минутный демо-ролик для отправки в Somnia Agentathon. Hero pixel-grid + swarm graph + sankey flow — три "wow"-момента, которые судьи запомнят.

## 📦 Что у нас на руках

```
Design/
  ShinyAudit.html         ← entry (React UMD + Babel standalone)
  js/
    app.jsx               ← root, easter eggs (konami, idle)
    nav-hero.jsx          ← nav + hero + ticker + ambient
    pixel-grid.jsx        ← canvas pixel grid с wave
    console.jsx           ← intent input + plan + runtime + dispatch
    swarm-graph.jsx       ← SVG force-graph анимация
    capabilities-cost.jsx ← grid + billing + receipt
    dossier.jsx           ← banner + summary + timeline + sankey + flagged + cit
    footer.jsx            ← 4-col + bottom strip
    mock.js               ← все фейк-данные
  styles/
    tokens.css            ← переменные палитры + utility
    sections.css          ← все секции
```

Полный объём ~30 КБ JSX + ~10 КБ CSS. Чисто.
