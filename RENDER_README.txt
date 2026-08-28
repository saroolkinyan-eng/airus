AIRUS — СБОРКА ДЛЯ RENDER
=========================

Это production-сборка. В корне уже находятся package.json и server.js.
Локальные PREVIEW.html, .bat и CHANGED_FILES намеренно не включены — Render они не нужны.

Что включено
------------
- Новый лендинг AIRUS.
- Компактная мобильная версия.
- Реальные материалы/фото старого climber74.ru через legacy-импорт при сборке.
- Блок «Новости» на главной.
- Архив /news/ и 4 отдельные рабочие страницы новостей.
- Страницы услуг: /cleaning/, /roof/, /installation/, /facade_works/.
- Форма заявки и API.
- Защищённая серверная админка /admin/login.html.
- Статусы заявок, заметки, следующий контакт, CSV-экспорт.
- Политика и отдельное согласие на обработку персональных данных.
- robots.txt, sitemap.xml, favicon, Open Graph, Schema.org.
- Health check: /healthz.

Настройки существующего Web Service в Render
--------------------------------------------
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /healthz

Обязательные Environment Variables
----------------------------------
NODE_ENV=production
TRUST_PROXY=1
ADMIN_LOGIN=ваш_логин
ADMIN_PASSWORD=длинный_случайный_пароль

Не храните ADMIN_PASSWORD в GitHub.

Заявки и SQLite на Render
-------------------------
По умолчанию SQLite создаётся в корне приложения. Файловая система обычного Render deploy
не подходит для постоянного хранения рабочих заявок между заменами инстанса/деплоями.

Если у Web Service подключён Render Persistent Disk, например с Mount Path:
/var/data

добавьте Environment Variable:
AIRUS_DATA_DIR=/var/data

Тогда одновременно в /var/data будут храниться:
- database.sqlite
- admin-auth.json (если ADMIN_PASSWORD не задан через Environment Variables)

Для production всё равно рекомендуется задавать ADMIN_LOGIN и ADMIN_PASSWORD через Environment Variables.

ВАЖНО: если Persistent Disk не подключён, AIRUS_DATA_DIR=/var/data НЕ задавайте.

Старые фото climber74.ru
------------------------
Во время npm install автоматически запускается:
node scripts/import-legacy-assets.js

Он копирует доступные /static/ ресурсы старого climber74.ru в public/static/.
Не используйте Build Command с --ignore-scripts.

В логах нормальной сборки будут строки:
[legacy] copied: ...
[legacy] mirror ready: ...

Если старый сайт временно недоступен, сборка не падает; для ключевых изображений в HTML
также оставлен HTTPS fallback на climber74.ru.

Как обновить через GitHub Desktop
---------------------------------
1. Распакуйте этот ZIP.
2. Откройте GitHub Desktop -> Repository -> Show in Explorer.
3. Скопируйте СОДЕРЖИМОЕ распакованной папки в корень репозитория с заменой файлов.
4. Удалите старые PREVIEW/CHANGED_FILES/.bat из репозитория, если они там были и вам не нужны.
5. Commit to main.
6. Push origin.
7. Render при включённом Auto-Deploy сам запустит новый deploy.

Проверка после деплоя
---------------------
Откройте:
/
/healthz
/news/
/news/spring-2023/
/news/novy-urengoy/
/news/seams/
/news/collective-2022/
/admin/login.html

В админке проверьте вход, затем отправьте одну тестовую заявку с главной страницы.

Примечание по юридическим страницам
-----------------------------------
Перед публичным запуском заполните реальные реквизиты оператора в:
public/privacy.html
public/consent.html


ADMIN PANEL (v13)
-----------------
Public button: /admin/login.html
Temporary login is configured server-side. The temporary password is intentionally not written to this repository.
To switch to Render environment credentials later, set ADMIN_USE_ENV=1 and provide ADMIN_LOGIN + ADMIN_PASSWORD.
Orders shown in the dashboard come from the same SQLite database used by /api/orders.

V14 ADMIN NAVIGATION
- The AIRUS logo inside the admin panel returns to /admin/dashboard.html (city selection).
- A "К выбору городов" button is shown when a city/order scope is open.
- The sidebar primary button returns to city selection instead of the public homepage.
- The public homepage remains available only through the separate "Открыть сайт" button.


ADMIN DEVICE MEMORY
After a successful admin login, the device can be remembered for 30 days (enabled by default on the login screen).
Going back to the public website does NOT log the admin out. The main-site button changes from "Войти" to "Админка" while the session is valid.
The logout button in the admin panel invalidates the token and forgets the device.
Remembered sessions are stored in the same SQLite database, so for persistence across Render restarts/deploys use AIRUS_DATA_DIR on a Persistent Disk.
