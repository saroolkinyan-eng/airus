AIRUS — CLOUDFLARE WORKERS + D1 — REPAIR BUILD 3.1
====================================================

Эта сборка исправляет ошибку «Внутренняя ошибка сервера» при входе в админку.

Что исправлено
--------------
1. Вход в админку больше не зависит от D1.
   Админ-сессия теперь подписывается HMAC и хранится только в защищённой HttpOnly cookie.
   Поэтому неисправность или пустая D1 не ломает сам /api/login.

2. SESSION_SECRET создаётся автоматически при развёртывании и отправляется в Cloudflare
   через `wrangler secret put`. В исходниках секрет не хранится.

3. D1 создаётся и привязывается детерминированно как `airus-db`.
   Скрипт применяет migrations/0001_init.sql к удалённой базе до рабочего запуска.

4. Worker называется `airus`, поэтому повторный deploy обновляет текущий Worker
   и сохраняет адрес вида airus.<ваш workers.dev subdomain>.workers.dev.

5. Упрощён D1 rate-limit: убран сложный SQL RETURNING из критического пути входа.

6. /api/health теперь отдельно показывает состояние D1 и наличие секрета сессии.

КАК ИСПРАВИТЬ ТЕКУЩИЙ САЙТ НА WINDOWS
--------------------------------------
1. Распакуйте ZIP в отдельную папку.
2. Запустите:

   REPAIR_EXISTING_CLOUDFLARE_WINDOWS.cmd

   Можно также запустить DEPLOY_CLOUDFLARE_WINDOWS.cmd — результат тот же.

3. При первом запуске откроется авторизация Cloudflare. Разрешите Wrangler доступ к
   тому же аккаунту, где сейчас находится Worker `airus`.

4. Скрипт автоматически:
   - установит Wrangler
   - проверит JavaScript
   - найдёт или создаст D1 `airus-db`
   - пропишет database_name/database_id в wrangler.jsonc
   - применит миграции к удалённой D1
   - обновит Worker `airus`
   - создаст новый случайный SESSION_SECRET
   - загрузит секрет в Cloudflare
   - ещё раз проверит deploy

ПРОВЕРКА ПОСЛЕ DEPLOY
---------------------
Откройте:

   https://airus.saro-olkinyan.workers.dev/api/health

Нормальный ответ:

   {"ok":true,"runtime":"cloudflare-workers","database":"d1","session":"configured"}

Затем:

   https://airus.saro-olkinyan.workers.dev/admin/login

Используйте прежние данные администратора.

Если /api/health показывает session=missing
-------------------------------------------
В папке проекта выполните:

   npx wrangler secret put SESSION_SECRET

Введите длинную случайную строку не короче 32 символов, затем:

   npx wrangler deploy

Если /api/health показывает database=error
------------------------------------------
Выполните:

   npx wrangler d1 migrations apply DB --remote
   npx wrangler deploy

После этого снова проверьте /api/health.

ВАЖНО ПРО СТАРУЮ D1
-------------------
Если предыдущая версия автоматически создала другую D1, новая сборка может переключить
Worker на `airus-db`. Старая база при этом НЕ удаляется из Cloudflare. Если в ней уже были
реальные заявки, их можно отдельно перенести в `airus-db`.

БЕЗОПАСНАЯ СМЕНА ПАРОЛЯ
-----------------------
Чтобы поменять пароль без изменения кода:

   npx wrangler secret put ADMIN_PASSWORD

После установки этот secret имеет приоритет над встроенным PBKDF2-хэшем.

Структура
---------
public/                         статический сайт
src/worker.mjs                  API + админ-аутентификация + D1
migrations/0001_init.sql        схема D1
scripts/provision-cloudflare.mjs автоматическая настройка Cloudflare
DEPLOY_CLOUDFLARE_WINDOWS.cmd   полный deploy
REPAIR_EXISTING_CLOUDFLARE_WINDOWS.cmd ремонт существующего Worker
