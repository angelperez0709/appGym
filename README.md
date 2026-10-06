# Bilbo Tracker PWA

Bilbo Tracker es una aplicación **mobile-first y offline** para registrar exclusivamente la serie Bilbo. Esta versión sustituye por completo React Native/Expo: está hecha con **HTML, JavaScript modular, Tailwind CSS e IndexedDB**.

## Funcionalidad

- Varios ejercicios independientes.
- Ciclo Bilbo progresivo.
- Ciclo de 3 pesos × 4 entrenamientos por peso.
- Peso de cada entrenamiento prescrito automáticamente.
- Cierre automático del ciclo progresivo al hacer **15 repeticiones o menos**.
- Cierre automático del 3×4 al completar sus 12 entrenamientos.
- Repeticiones totales y volumen total por ciclo.
- Volumen de cada serie: `peso × repeticiones`.
- 1RM estimado con Epley.
- Gráfica de volumen y de 1RM estimado.
- Comparación de ciclos.
- Récord de repeticiones para cada peso.
- Exportación CSV.
- Instalación como PWA en Android.
- Funcionamiento offline una vez instalada/cargada.

No se registran RIR, RPE, descansos, notas ni series accesorias.

## Arquitectura

```text
src/
├── domain/
│   └── bilbo.js                 # Reglas y cálculos puros
├── data/
│   ├── indexed-db.js            # Infraestructura IndexedDB
│   └── training-repository.js   # Repository de persistencia
├── application/
│   └── training-service.js      # Casos de uso / orquestación
├── services/
│   ├── csv-exporter.js
│   └── pwa-install.js
└── ui/
    ├── app-controller.js        # Shell, navegación y estado de presentación
    ├── components/
    └── screens/
```

Los principios aplicados son:

- **Dominio independiente**: `domain/` no conoce el navegador, IndexedDB ni la UI.
- **Repository pattern**: `TrainingService` no sabe cómo IndexedDB almacena los datos.
- **Application Service**: las pantallas llaman casos de uso y no implementan reglas Bilbo.
- **Inyección de dependencias**: las dependencias se ensamblan únicamente en `src/main.js`.
- **Alta cohesión**: cada módulo tiene una responsabilidad concreta.
- **Bajo acoplamiento**: cambiar IndexedDB, la UI o la exportación no obliga a reescribir el dominio.
- **JavaScript nativo**: no hay React, Vue, Angular ni otra capa de framework.

## Persistencia

La PWA utiliza **IndexedDB** para conservar los entrenamientos sin conexión y **Supabase** para sincronizarlos al iniciar sesión. Cada cuenta tiene una base local separada. Las altas y ediciones se marcan como pendientes dentro de la misma transacción que guarda el entrenamiento; los borrados se conservan hasta que Supabase los confirma.

En **Datos → Cuenta y nube**, crea una cuenta, confirma el correo e inicia sesión. En el móvil que contiene tu historial anterior, pulsa **Subir mi historial local**. La copia original se conserva y la importación puede reintentarse sin duplicar las sesiones. Después comprueba el mensaje **Todos los cambios están guardados en la nube** antes de borrar datos del navegador.

La sincronización se comprueba al abrir la aplicación, al volver a ella, al recuperar Internet y periódicamente mientras está visible. Si dos dispositivos editan un registro a partir de versiones distintas, se muestra un conflicto en Datos para elegir qué versión conservar. Los cambios locales siguen disponibles ante errores de red.

Configuración:

- `src/config/supabase.js`: URL y clave publishable pública; nunca una clave secret o service_role.
- `supabase/schema.sql`: tablas, permisos por usuario y relaciones con borrado en cascada. Ejecutar en SQL Editor del proyecto antes de usar la sincronización.
- Supabase → Authentication → URL Configuration: Site URL y Redirect URL `https://angelperez0709.github.io/appGym/`.
- Para probar registro y recuperación de contraseña en local, añadir también `http://localhost:5173/` y `http://localhost:4173/` como Redirect URLs.

La antigua base SQLite de la versión Expo no se comparte automáticamente con la PWA. La exportación CSV permite conservar una copia externa de los entrenamientos.

## Requisitos

Solo necesitas Node.js para desarrollar o generar el build.

```bash
npm install
```

La compilación usa Tailwind CSS y esbuild. El cliente oficial de Supabase se empaqueta en `assets/supabase.js` para incluirlo en la caché offline de la PWA. Las pruebas de persistencia usan fake-indexeddb.

## Ejecutar en el PC

```bash
npm run dev
```

Después abre:

```text
http://localhost:5173
```

El servidor de desarrollo es un pequeño servidor HTTP escrito con módulos nativos de Node. No usa Expo ni Vite.

> Si modificas clases de Tailwind, reinicia `npm run dev` para regenerar `assets/app.css`.

## Pruebas y comprobaciones

```bash
npm test
npm run check
```

Las pruebas cubren, entre otras cosas:

- cálculo del peso inicial;
- progresión de carga;
- final a ≤15 reps;
- secuencia 3×4;
- volumen/e1RM;
- acumulados y cierre de ciclos en la capa de aplicación.

## Generar la PWA de producción

```bash
npm run build
```

El resultado queda en:

```text
dist/
```

Para probar exactamente ese build:

```bash
npm run preview
```

Y abre:

```text
http://localhost:4173
```

## Instalarla en Android

Una PWA instalable debe servirse mediante **HTTPS** (excepto `localhost`, que se considera seguro para desarrollo). El proyecto incluye despliegue automático a GitHub Pages.

1. Sube el proyecto a GitHub.
2. En el repositorio abre **Settings → Pages**.
3. En **Build and deployment**, selecciona **GitHub Actions**.
4. Haz `push` a `main`.
5. La acción `.github/workflows/deploy-pages.yml` ejecutará pruebas, generará `dist/` y publicará la PWA.
6. Abre la URL de GitHub Pages desde Chrome en Android.
7. Pulsa **Instalar aplicación** o usa el menú de Chrome → **Añadir a pantalla de inicio / Instalar aplicación**.

Después Bilbo Tracker tendrá su propio icono y se abrirá en modo `standalone`, como una aplicación normal.

## PWA y offline

- `public/manifest.webmanifest`: metadatos, orientación e iconos.
- `public/sw.js`: service worker.
- `scripts/build.js`: genera automáticamente la lista completa de archivos que debe precachear el service worker.
- `public/icons/`: iconos 192×192 y 512×512.

Al generar `dist/`, todos los módulos JS, el CSS y los recursos quedan incluidos en la caché de aplicación para poder iniciar Bilbo Tracker offline.

Cada compilación calcula una versión a partir del contenido de los archivos. Cuando cambian, la PWA descarga la versión nueva en una caché separada y muestra **Actualización disponible → Actualizar**. Comprueba las actualizaciones al abrirla y al volver a ella con conexión. Al pulsar el botón se activa la versión nueva y se recarga la app; los entrenamientos de IndexedDB se conservan.

Para pasar desde la versión antigua sin este aviso, abre la app con conexión, deja que descargue la actualización y cierra completamente la PWA y las pestañas de esta app en el navegador. Al volver a abrirla cargará la nueva versión. No borres los datos del sitio.

## Tailwind CSS

El CSS se genera con:

```bash
npm run css
```

El script `scripts/build-css.js` usa la API de compilación de Tailwind y escanea `index.html` y los módulos JavaScript para generar únicamente las utilidades utilizadas. El resultado se guarda en:

```text
assets/app.css
```

## Exportación CSV

La pestaña **Datos** descarga un CSV con:

- ejercicio;
- ciclo;
- tipo y estado del ciclo;
- fórmula de e1RM;
- repeticiones totales del ciclo;
- volumen total del ciclo;
- fecha de la sesión;
- peso;
- repeticiones;
- volumen de la serie;
- 1RM estimado.
