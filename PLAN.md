# {s}hinyAudit · план до сабмита (deadline 2026-06-07)

Сегодня **2026-05-24**, у нас **14 дней**. Программа уже идёт неделю — нагоняем темп.

## Этап 0 · быстрые фиксы дизайна (1 день)
Исправляем CRIT-1 / CRIT-2 / HIGH-2 прямо в текущем HTML/JSX, чтобы было что показывать ментору и можно было пилить демо-ролик на этом.
- Hero clamp → `clamp(40px, 8vw, 112px)` + line-break правила
- Receipt JSON → template literal без экранирования
- Pixel-grid density 0.16 → 0.11 в hero (FPS на слабых машинах)

## Этап 1 · перенос в Next.js + Tailwind (2 дня)
Бьём прототип на компоненты Next.js App Router, чтобы дальше работать как с production-кодом.

```
app/
  layout.tsx              ← Geist Mono, scanlines, vignette
  page.tsx                ← компоновка секций
  api/
    investigate/route.ts  ← POST {prompt, target} → SSE stream of swarm events
components/
  Nav.tsx / Hero.tsx / Console.tsx / SwarmGraph.tsx / ...
lib/
  somnia.ts               ← chain config + viem client
  agents.ts               ← обёртки над json-fetch / llm-inference / llm-tools
  orchestrator.ts         ← планировщик + диспатч + сбор результатов
  blockscout.ts           ← обёртка над Shannon explorer API
```

Tech stack:
- **Next.js 15** (App Router, RSC, Server Actions)
- **Tailwind v4** + CSS variables (палитра из tokens.css)
- **viem 2.x** + **wagmi 2.x** для wallet/chain
- **@rainbow-me/rainbowkit** для connect-кнопки (или собственный UI)
- **framer-motion** для секционных анимаций
- **TypeScript strict**

## Этап 2 · реальная интеграция Somnia (3–4 дня)
Тут начинается *agent-native* часть, за которую судьи и платят $5k.

### 2a · Wallet + chain
- Подключение к Somnia Mainnet (5031) и Testnet (50312) через wagmi
- Кнопка `connect wallet` → реальные адреса/балансы STT/SOMI
- Чтение баланса для проверки достаточности средств перед dispatch

### 2b · Агенты Somnia
Используем три базовых агента Phase 1:

| Наш агент | Базовый агент Somnia | Что делает |
|-----------|----------------------|------------|
| **scout-fetch** | `json-fetch` | дёргает Blockscout API эксплорера (txlist, internal_txs, holders, source_code) |
| **contract-decoder** | `llm-inference` (`inferString`) | принимает ABI/source и возвращает structured findings |
| **flow-tracer** | `llm-inference` (`inferToolsChat`) | LLM с tool-use, рекурсивно дёргает scout-fetch до N hops |
| **synthesizer** | `llm-inference` (`inferString`) | агрегирует находки в финальный dossier |

Реализация:
- TypeScript обёртки в `lib/agents.ts` поверх ABI `AgentRequester`
- Отправка через viem `writeContract` + ожидание receipt
- Парсинг ABI-encoded output обратно в TS

### 2c · Оркестратор
Сердце "agent-native" подачи. Логика в `lib/orchestrator.ts`:

```
1. User prompt → planner (один inferString вызов) →
   возвращает план: какие агенты, в каком порядке, с какими args
2. Параллельно/последовательно (по плану) диспатчим Somnia-агентов
3. Между шагами — стримим события на фронт через SSE
4. Собираем все receipts, передаём synthesizer для финального dossier
5. dossier → markdown + sankey JSON + flagged items → возвращаем клиенту
```

Critical for judges: каждый шаг **on-chain**, каждый receipt **публично проверяем** на explorer.somnia.network. Это закрывает критерий "Agent-First Design" и "Autonomous Performance".

### 2d · Биллинг
- Перед dispatch: эстимация стоимости через `getAgentPrice()` на контракте
- + 50% маржа сервиса
- Депозит через `payable` функцию `requestInvocation()`
- Tracking через receipts: возврат сдачи + начисление в наш treasury

## Этап 3 · полировка + демо (3 дня)
- Реальный сценарий-демо: берём известный адрес из Somnia testnet с реальной активностью, прогоняем "trace funds from 0x… and flag risk" — записываем 2-5 мин ролик
- Подготовка GitHub README (badges, скриншоты, deploy link)
- Деплой на Vercel + custom domain `shinyaudit.xyz` или подобный
- Сабмит на платформу Agentathon

## Этап 4 · резервный буфер (2–3 дня)
Баги, фидбек ментора (Emre Yildiz / Anjali Singla), оптимизация, дополнительные фичи если успеваем:
- **Continuous watch** (фоновый агент через cron) — судьи это полюбят
- **Public dossier sharing** — каждый dossier как NFT с receipt-ID

## Критерии судейства — как мы их закрываем

| Критерий | Наше решение |
|----------|--------------|
| Functionality | Полностью работающий онлайн прототип на mainnet + Vercel deploy |
| Agent-First Design | Сеть из 4 агентов с tool-use оркестрацией, всё через Somnia Agentic L1 |
| Innovation | "Plain-English forensics" + composable swarm + on-chain receipts — уникальный угол |
| Autonomous Performance | Зеро-touch от user после dispatch, все шаги детерминированы, audit-trail публичный |

## Риски

1. **Phase 1 LLM-агенты могут быть медленные** — каждый вызов = consensus 5-7 узлов. Mitigation: distinct prompt каждого агента короткие, parallel где возможно.
2. **Blockscout API rate limits** — Mitigation: кеширование на сервере, retry с backoff.
3. **STT faucet может пересыхать** — Mitigation: запросить более крупный депозит у @emreyeth заранее.
4. **Determinism для LLM** — Mitigation: использовать `inferString` с строгими system prompts, schema-validated outputs (zod на клиенте).

## Что нужно от тебя сейчас

Решить какой подход к этапу 0 → 1:
- (a) Я правлю баги прямо в текущем HTML (часов 5-6) и потом мы вместе переезжаем в Next.js
- (b) Сразу переезжаем в Next.js, баги фиксим уже на новой кодовой базе (день-два дольше, но не делаем работу дважды)

Рекомендую **(b)** — экономнее по времени.
