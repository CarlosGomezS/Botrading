# Bot Trading en la nube (gratis, sin ordenador encendido)

Qué hace este paquete:

- **Web pública** (GitHub Pages): la abres desde el móvil o el ordenador y ves el bot tal cual, con los datos más recientes. Es de solo lectura.
- **Actualización diaria tras el cierre de Wall Street (hacia las 23:17, hora de España)**: GitHub ejecuta el botón «Actualizar precios y que el bot decida» por ti, lunes a viernes. Hay **5 disparos** (21:17, 21:47, 22:17, 22:47 y 23:17 UTC) y cada uno comprueba primero, en segundos, si el día de hoy ya está hecho; si lo está, no hace nada. Así, si GitHub retrasa o descarta un disparo, el siguiente lo recupera. Cubre horario de verano e invierno sin tocar nada. **Por qué después del cierre y no a la apertura:** el bot decide con velas diarias completas; a la apertura solo existiría la vela de ayer, que ya está procesada. Durante la sesión ya trabaja el vigilante.
- **Prueba histórica diaria**: justo después de la actualización, con un número **aleatorio de acciones entre 200 y el máximo** (por defecto 300) elegidas al azar.
- **Vigilante**: GitHub lo mantiene encendido en turnos de 55 minutos mientras Wall Street está abierto (lunes a viernes). Es lo más parecido a «siempre escuchando» que permite GitHub gratis: entre turno y turno puede haber unos minutos sin consulta (el arranque del navegador tarda 2-3 min) y GitHub no garantiza la hora exacta. Consulta **cada X minutos según el desplegable** (10, 15, 30 o 60).
- **Cada ejecución** (actualización, prueba histórica y cada turno del vigilante) deja **su informe individual** en la web (Informe → Registro). La actualización diaria y la prueba histórica mandan **un aviso al móvil (ntfy) y un correo**. **El vigilante NO avisa** (solo deja el informe) salvo que falle: entonces sí llega un aviso de error.
- Todo gratis: el repositorio es público, y en repositorios públicos GitHub Actions y Pages no cobran.

## Puesta en marcha (unos 15 minutos)

1. Crea una cuenta gratis en github.com y pulsa **New repository**. Ponle un nombre (p. ej. `bot-trading`) y márcalo **Public**.
2. Sube el contenido de esta carpeta al repositorio (**Add file → Upload files**): `index.html`, la carpeta `runner` y la carpeta `.github`.
   Si tu sistema oculta `.github`, créala a mano: **Add file → Create new file**, escribe `.github/workflows/diario.yml` como nombre y pega el contenido; repite con `vigilante.yml`.
3. **Settings → Secrets and variables → Actions → New repository secret**. Crea los que tengas (son tus claves de la pestaña Ajustes del bot; no se ven nunca en la web):
   - `ALPACA_KEY` → en formato `ID:SECRETO`. **Recomendada:** el vigilante necesita Alpaca o Twelve Data para consultar cotizaciones.
   - `TWELVEDATA_KEY`, `POLYGON_KEY`, `ALPHAVANTAGE_KEY`, `FMP_KEY` (opcionales).
   - **Correo (recomendado: Gmail por SMTP):** `SMTP_USER` (tu dirección de Gmail), `SMTP_PASS` (una **contraseña de aplicación** de 16 letras: myaccount.google.com/apppasswords, requiere tener la verificación en dos pasos) y `EMAIL` (dónde quieres recibirlo; si lo dejas vacío se envía a `SMTP_USER`). Para otro proveedor añade `SMTP_HOST` y `SMTP_PORT`.
   - `WEB3FORMS_KEY` (opcional, solo como respaldo): la versión gratuita de Web3Forms suele rechazar los envíos que no salen de un navegador normal, por eso en la nube puede fallar.
   - `NTFY_TOPIC` → el nombre del tema de la app **ntfy** del móvil (instala «ntfy», suscríbete a un tema largo y secreto, p. ej. `botrade-x7k29qpl4m`, y pon aquí exactamente ese nombre). **Sin este secreto no llega ninguna notificación al móvil.**
   - Para la prueba histórica diaria hace falta `ALPACA_KEY` (o `TWELVEDATA_KEY`, que con su cuota gratuita no llega a 200+ acciones al día).
4. **Settings → Actions → General → Workflow permissions → Read and write permissions → Save.**
5. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.**
6. **Actions → «Actualización diaria» → Run workflow.** La primera vez descarga mucho histórico y puede tardar horas; si no termina, continúa por donde se quedó en la siguiente ejecución.
7. Tu web quedará en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`. Ábrela desde el móvil y guárdala en favoritos o en la pantalla de inicio.

## Comprobar que los avisos llegan

**Actions → «Probar avisos (móvil y correo)» → Run workflow.** En un par de minutos debe sonar el móvil y llegar un correo. Además deja un informe «prueba-de-avisos» que indica qué secretos faltan (✖ FALTA). Cada informe real termina con un apartado «Avisos de esta ejecución» que dice si el móvil y el correo se enviaron (✔) o por qué no (✖).

## Cambiar los ajustes desde la web (con clave)

En la pestaña **Ajustes** de la web aparece el recuadro **«☁️ Ajustes de la nube»**. Desde ahí puedes editar **todos los parámetros del bot** (los 8 que el bot usa de verdad: nº de ETFs, riesgo por operación, frenos de pérdida diaria y de caída, comisión, deslizamiento, orden mínima y % de ahorro), el **método principal**, el **vigilante** (intervalo, subida mínima, nº de acciones extra, operar sí/no), el **tiempo máximo por actualización** y el **máximo de la prueba histórica**. Cada valor tiene su rango seguro; si te pasas, lo rechaza. Los parámetros del antiguo motor de notas (nota de compra/venta, stops, objetivo, sesiones máximas…) se han quitado de Ajustes porque ningún método actual los usa.

**Claves y avisos (nuevo en v6):** el mismo recuadro tiene un campo por cada secreto (Alpaca, Twelve Data, Polygon, Alpha Vantage, FMP, usuario/contraseña SMTP, correo de destino, servidor y puerto SMTP, tema de ntfy y Web3Forms). Dejas en blanco lo que no quieras cambiar; lo que escribas se cifra en tu navegador y se guarda en GitHub Secrets al pulsar «Aplicar en la nube». Nunca se muestran de vuelta: solo ves ✔/✖ de si están puestos. También puedes apagar los avisos al móvil y por correo (los errores avisan siempre).

**También el capital inicial y el resto de casillas (v6):** capital inicial, cambio €/$, notificaciones de la app y el correo automático de la app (activar, incluir cartera, incluir vigilante). **Ojo con el capital:** si lo cambias, la web te pide confirmación y en la siguiente ejecución el bot **reinicia todas las cuentas** con ese capital (archiva antes una copia; conserva ajustes, claves, reglas e informes). Solo se reinicia una vez: cuando el capital del bot ya coincide, no hace nada.

La casilla «seguir actualizando con la app minimizada» se ha eliminado de Ajustes: en la nube el bot corre solo y no hacía nada.

**Primera vez en cada navegador:**
1. En GitHub: Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate. Limítalo a **este repositorio** y dale el permiso **Actions: Read and write** y, si quieres cambiar claves desde la web, también **Secrets: Read and write**.
2. Pega el token en el recuadro y **elige una clave** (mínimo 8 caracteres). El token se guarda **cifrado** con tu clave en ese navegador; la clave no se guarda en ningún sitio.
3. Pulsa «Guardar y desbloquear».

**Después:** solo escribes tu clave, cambias lo que quieras y pulsas **«Aplicar en la nube»**. En 1-2 minutos queda guardado en `ajustes.json` y el bot lo usa desde su siguiente ejecución. Se vuelve a bloquear a los 10 minutos.

Importante: la web sigue siendo pública y solo de lectura para los demás. Lo que impide que otra persona cambie tus ajustes no es la clave en sí, sino que hace falta tu token de GitHub, que solo está cifrado en tus navegadores. Elige una clave larga. El **capital inicial** no se edita aquí porque implicaría reiniciar las cuentas.

Sin token (alternativa): Actions → «Ajustes de la nube» → Run workflow.

## Qué queda registrado

- Actualización diaria → informe «actualizado / ya-actualizado / sin-datos / error…» (o «actualizacion-incompleta» si no cabe en el tiempo).
- Prueba histórica → informe «prueba-historica-completada / error / incompleta», con el nº de acciones sorteado y el resumen de resultados arriba.
- Vigilante → un informe **«vigilante-turno»** por turno: intervalo elegido y efectivo, cada consulta (hora, fuente, cotizaciones, entradas, errores), operaciones simuladas y ranking de métodos. El detalle completo del día sigue en Vigilante → Registros e informes.
- Cualquier fallo del proceso → informe «error-ejecucion» + aviso.
- Los informes de más de 30 días conservan el texto pero pierden los datos pesados (cotizaciones, curvas), para que el archivo no crezca sin límite.

## Conservar el historial que ya tienes (opcional)

En la app: **Ajustes → copia de seguridad → descargar .json**, con la casilla «Incluir claves» **desmarcada**. Renombra el archivo a `backup-inicial.json` y súbelo a la raíz del repositorio **antes del paso 6**. Se importa solo en la primera ejecución. Como el repositorio es público, ese archivo también lo será: bórralo después. Si tienes el correo configurado en el bot, revisa que la copia no incluya su clave.
Si no lo subes, el bot empieza de cero con 500 €.

## Qué debes saber

- La web muestra los datos publicados por el último turno: el vigilante los actualiza cada 10 minutos aproximadamente. La web **mira cada 5 minutos si hay datos nuevos**: si estás sin tocarla se recarga sola; si la estás usando, la barra de arriba cambia a «Hay datos nuevos · toca aquí para actualizar».
- GitHub no garantiza la hora exacta de las tareas programadas: pueden retrasarse varios minutos en horas de mucha carga y, muy de vez en cuando, saltarse un turno. Entre turnos del vigilante puede haber huecos de unos 5 minutos.
- El repositorio es público, así que cualquiera con el enlace puede ver tu cartera ficticia. Las claves no se publican nunca.
- Las fuentes sin clave (Yahoo y Stooq) pasan por proxies públicos que pueden bloquear a GitHub. Con una clave de Alpaca funciona mejor.
- Si el repositorio no tiene actividad durante 60 días, GitHub pausa las tareas programadas. Las publicaciones del bot cuentan como actividad; si un día aparecen pausadas, pulsa **Enable workflow** en la pestaña Actions.
- **Límite de correos:** con SMTP/Gmail no hay el límite mensual de abajo. Web3Forms gratis admite 250 envíos al mes. Con un correo por actualización (~22), por prueba histórica (~22) y por turno del vigilante (~8 al día, ~175) salen unos 220 al mes: muy justo. Si te quedas sin cupo, el informe lo anota (✖) y el aviso al móvil sigue funcionando.
- Los correos se envían desde el navegador de la nube igual que hace la app; si Web3Forms rechazara ese origen, el informe lo dirá en «Avisos de esta ejecución».
- Para parar el bot, desactiva los workflows en la pestaña Actions.

## Cambios en la web respecto a tu archivo

Solo estos: la nueva función de informes individuales y la prueba histórica diaria (el campo «Máximo» ahora vale 300 por defecto), el recuadro «☁️ Ajustes de la nube» del modo visor; y lo que ya había: se quitó tu correo del código (ahora viene de los Secrets); se añadió el modo visor (carga los datos publicados, muestra una barra con la fecha del último dato y desactiva los botones que consultarían precios); y dos líneas que avisan a la app de cuándo ha terminado de cargar. Abierto en tu ordenador como archivo, funciona como siempre.

## Si un día no se ejecutó la actualización

Actions → «Actualización diaria…» → abre las ejecuciones de esa noche. En el paso «¿Toca ejecutar algo en este disparo?» el registro dice la decisión y el motivo (por ejemplo «actualización ya hecha hoy» o «aún no ha pasado una hora desde el cierre»). Si no hay ninguna ejecución esa noche, es que GitHub descartó los 5 disparos: lanza «Run workflow» a mano y avísame para revisarlo.

## Cambios de esta versión (v7)

- Pestaña Ajustes de la web: arriba del todo el campo de la **clave** y el botón **Editar**. Al pulsarlo aparecen debajo **todos** los ajustes (claves de datos, avisos y correo, parámetros del bot, método principal, vigilante, prueba histórica, capital y cambio €/$). **Guardar edición** los envía a la nube y avisa cuando GitHub ha terminado de guardarlos. Cada clave puesta tiene casilla «quitar esta clave». Los cuadros antiguos de Ajustes (que solo cambiaban el navegador) se ocultan en la web pública.
- **Reiniciar todo**: borra todos los datos (cuentas, operaciones, informes, pruebas históricas, vigilante, precios) y los ajustes guardados; la web queda vacía como el primer día. Opcionalmente borra también las claves. Usa el flujo nuevo `.github/workflows/reiniciar.yml` (**hay que subirlo al repositorio**) y para las ejecuciones en marcha antes de borrar. Pide escribir REINICIAR.
- La web pública ahora elimina los datos locales antiguos del navegador cuando la copia publicada está vacía.
- El token necesita **Actions: Read and write** y, para claves, **Secrets: Read and write**.

## Cambios de la versión v6

- Limpieza de Ajustes: se quitan los 13 parámetros del motor antiguo de notas que ningún método usa y la casilla de segundo plano.
- Ajustes de la nube: ahora también se editan las **claves y secretos** (con permiso extra «Secrets: Read and write» en el token) y los **avisos** al móvil y por correo.
- Ajustes de la nube: también capital inicial (con reinicio de cuentas), cambio €/$, notificaciones y correo automático de la app.
- Corregido: `SMTP_HOST` y `SMTP_PORT` existían en el runner pero ningún workflow los pasaba, así que nunca funcionaban. Ahora sí (y se pueden poner desde la web).

## Cambios de la versión v5

- Actualización diaria: 5 disparos con comprobación de «ya hecho hoy» en vez de exigir las 23 h exactas (si GitHub se retrasaba pasada la medianoche, el día se perdía y tampoco corría la prueba histórica).
- Ajustes de la web: ahora editan todos los parámetros, el método principal, el vigilante y el tiempo máximo. Corregido un fallo: los campos del recuadro salían vacíos y «Aplicar» daba «vacío» hasta que existiera un valor guardado.
- Pantalla de Ajustes de la app (también en el ordenador): «Parámetros del bot» muestra los 19 parámetros y admite 0 donde es válido.
- Visor: se refresca solo cuando hay datos nuevos.
