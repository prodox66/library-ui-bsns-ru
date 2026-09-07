# library-ui.bsns.ru

Статический самодостаточный интерфейс библиотек BZN: окно с вкладками и пагинацией, Resource Library controller и Lightbox.

## Публичные файлы

- `assets/resource-library-v2.js`
- `assets/resource-library.css`
- `assets/lightbox.js`
- `assets/lightbox.css`
- `NewUI/Library_Window.js`
- `NewUI/windows/library_window.json`
- `NewUI/windows/library_window.data.js`

`index.html` — автономная проверочная страница. Она использует локальный JS-provider и не требует PHP или доступа к контентным библиотекам.

## Настройка

`runtime-config.js` задаёт адреса интерфейса, API и контента для автономной страницы. Редактор может определить собственный `window.BZNLibraryRuntimeConfig` до подключения публичных скриптов.

После изменения `NewUI/windows/library_window.json` необходимо обновить file-mode bridge:

```bash
node NewUI/tools/build-library-window-config.mjs
```

## Развёртывание

Сайт полностью статический. Корень репозитория размещается в корне `library-ui.bsns.ru`. Для междоменных загрузок сервер должен возвращать `Access-Control-Allow-Origin`; включённая `.htaccess` задаёт эту политику на Apache.
