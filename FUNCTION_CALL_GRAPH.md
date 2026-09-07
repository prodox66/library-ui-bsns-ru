# Library UI call graph

`runtime-config.js::resolveInterfaceUrl <- runtime-config.js::window.BZNLibraryRuntimeConfig initialization`

`assets/resource-library-v2.js::open <- external window.BZNResourceLibrary.open consumers, demo.js::openLibrary`

`assets/resource-library-v2.js::createModal <- assets/resource-library-v2.js::open`

`NewUI/Library_Window.js::configuration <- NewUI/Library_Window.js::BZNNewUILibraryWindow.create, NewUI/Library_Window.js::BZNNewUILibraryWindow.pageSize`

`NewUI/Library_Window.js::loadBridgeConfiguration <- NewUI/Library_Window.js::configuration [file and cross-origin consumers]`

`NewUI/Library_Window.js::LibraryWindow.resolve <- assets/resource-library-v2.js::open`

`NewUI/Library_Window.js::LibraryWindow.configure <- assets/resource-library-v2.js::open`

`assets/resource-library-v2.js::loadPage <- assets/resource-library-v2.js::open, assets/resource-library-v2.js::activateTab, assets/resource-library-v2.js::navigate, assets/resource-library-v2.js::refresh`

`assets/resource-library-v2.js::openItemPreview <- assets/resource-library-v2.js::renderItems`

`assets/lightbox.js::open <- assets/resource-library-v2.js::openItemPreview, external window.BZNLightbox.open consumers, demo.js::openLightbox`

`assets/lightbox.js::close <- assets/lightbox.js::ensureModal callbacks, assets/resource-library-v2.js::closeOwnedPreview, external window.BZNLightbox.close consumers`

`assets/resource-library-v2.js::useItem <- assets/resource-library-v2.js::openItemPreview, assets/lightbox.js::open onUse callback`
