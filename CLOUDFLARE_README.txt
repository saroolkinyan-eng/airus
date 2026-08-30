AIRUS — ПОЛНАЯ СБОРКА ДЛЯ CLOUDFLARE WORKERS + D1
==================================================

Что изменено
------------
Эта версия больше НЕ требует Render, Express или локальный SQLite-файл.

Вся серверная часть перенесена в Cloudflare:
- сайт и статика: Cloudflare Workers Static Assets
- API: Cloudflare Worker
- заявки, история и сессии: Cloudflare D1
- вход в админку: Worker + HttpOnly Secure cookie
- remembered-device: до 30 дней
- rate limit входа и отправки заявок: D1
- CSV-экспорт сохранён
- /healthz и /api/health сохранены
- /admin/dashboard.html защищён на уровне Worker

Исходный дизайн и public/ сохранены.

ВАЖНО ПРО БАЗУ D1
-----------------
В wrangler.jsonc указана D1 binding "DB" без account-specific database_id.
Современный Wrangler умеет автоматически создать и привязать D1 при первом deploy.
Worker также сам создаёт недостающие таблицы через CREATE TABLE IF NOT EXISTS,
поэтому отдельная ручная миграция для первого запуска не обязательна.

Быстрый деплой с компьютера
---------------------------
1. Установите Node.js 20+.
2. Распакуйте архив.
3. На Windows можно просто запустить:

   DEPLOY_CLOUDFLARE_WINDOWS.cmd

   На Linux/macOS:

   ./deploy-cloudflare.sh

   Или вручную:

   npm install
   npx wrangler login
   npm run deploy

4. Wrangler 4.45+ автоматически создаст D1 для draft binding DB при первом deploy (эта функция Cloudflare сейчас помечена как beta).
5. В конце команды будет адрес вида:
   https://airus-cloudflare.<ваш-subdomain>.workers.dev

Проверка
--------
Откройте:
- /healthz              -> должно быть: ok
- /api/health           -> JSON с runtime=cloudflare-workers и database=d1
- /admin/login.html     -> форма входа
- /admin/dashboard.html -> без сессии перекидывает на login

Текущий временный админ
-----------------------
Логин сохранён прежний.
Пароль в исходном коде НЕ хранится открытым текстом: в Worker лежит PBKDF2-хэш.
То есть прежние учётные данные продолжают работать сразу после деплоя.

Как безопасно поменять пароль без изменения исходников
-------------------------------------------------------
Выполните:

   npx wrangler secret put ADMIN_PASSWORD

Wrangler попросит ввести новое значение. После установки secret оно автоматически
получит приоритет над встроенным временным хэшем.

Логин можно поменять в wrangler.jsonc в vars.ADMIN_LOGIN.

Если хотите удалить override-пароль и снова использовать встроенный хэш:

   npx wrangler secret delete ADMIN_PASSWORD

Локальный запуск
----------------
   npm install
   npm run dev

Локальный D1 создаётся Wrangler автоматически. Таблицы Worker создаст сам при первом API-запросе.

Legacy-фотографии
-----------------
В исходной сборке часть старых изображений подгружается с climber74.ru.
При необходимости перед deploy можно зеркалировать доступные старые /static/ ресурсы:

   npm run legacy:import

Если источник недоступен, сайт не должен падать: в страницах сохранены HTTPS fallback-ссылки.

GitHub + Cloudflare Builds
--------------------------
Можно положить эту папку в GitHub и подключить репозиторий в Workers & Pages.
Для Worker-проекта используйте команду деплоя:

   npx wrangler deploy

Cloudflare может автоматически provision D1 binding из wrangler.jsonc.
После первого деплоя проверьте в Worker -> Bindings, что DB имеет тип D1 database.

Пользовательский домен
----------------------
После успешного запуска workers.dev можно добавить домен в Cloudflare Dashboard:
Workers & Pages -> airus-cloudflare -> Settings / Domains & Routes -> Add Custom Domain.

Файлы, которые больше не нужны
------------------------------
server.js, render.yaml и Render README удалены из этой сборки намеренно.
База данных теперь не является файлом database.sqlite — данные живут в D1 и не теряются при deploy.

Миграции
--------
В migrations/0001_init.sql оставлена явная схема для контроля версий.
Worker сам инициализирует ту же схему, поэтому первый deploy не зависит от ручной миграции.
Для последующих управляемых миграций можно использовать:

   npm run cf:db:migrate:remote

Примечание
----------
Перед публичным запуском проверьте реальные реквизиты оператора персональных данных в:
public/privacy.html
public/consent.html


Если автоматическое создание D1 отключено
----------------------------------------
Обычно ничего делать не нужно: Wrangler 4.45+ умеет provision draft D1 binding из записи { "binding": "DB" }.
Если в вашем аккаунте эта beta-функция отключена или deploy сообщает, что DB не привязан, выполните:

   npx wrangler d1 create airus-cloudflare-db

Wrangler предложит добавить binding в wrangler.jsonc. Согласитесь и укажите имя binding: DB.
После этого снова выполните:

   npm run deploy

Worker сам создаст таблицы при первом API-запросе. При желании схему можно применить явно:

   npm run cf:db:migrate:remote

Важно
------
Это Cloudflare Worker + Static Assets + D1, а не обычный статический Pages upload.
Если загрузить только папку public как Pages/Direct Upload, форма будет отображаться, но /api/login и CRM работать не будут.
