# Bot Trading en la nube (gratis, sin ordenador encendido)

Qué hace este paquete:

- **Web pública** (GitHub Pages): la abres desde el móvil o el ordenador y ves el bot tal cual, con los datos más recientes. Es de solo lectura.
- **Actualización diaria tras el cierre de Wall Street (hacia las 23:17, hora de España)**: GitHub ejecuta el botón «Actualizar precios y que el bot decida» por ti, lunes a viernes. Hay **5 disparos** (21:17, 21:47, 22:17, 22:47 y 23:17 UTC) y cada uno comprueba primero, en segundos, si el día de hoy ya está hecho; si lo está, no hace nada. Así, si GitHub retrasa o descarta un disparo, el siguiente lo recupera. Cubre horario de verano e invierno sin tocar nada. **Por qué después del cierre y no a la apertura:** el bot decide con velas diarias completas; a la apertura solo existiría la vela de ayer, que ya está procesada. Durante la sesión ya trabaja el vigilante.
- **Prueba histórica diaria** (flujo aparte, `historico.yml`): se lanza sola en cuanto termina la actualización de precios (y tiene 3 disparos de seguridad), solo si la actualización de ese día ya está hecha, con un número **aleatorio de acciones entre 200 y el máximo** (por defecto 300) elegidas al azar.
- **Vigilante**: GitHub lo mantiene encendido en turnos de 55 minutos mientras Wall Street está abierto (lunes a viernes). Es lo más parecido a «siempre escuchando» que permite GitHub gratis: entre turno y turno puede haber unos minutos sin consulta (el arranque del navegador tarda 2-3 min) y GitHub no garantiza la hora exacta. Consulta **cada X minutos según el desplegable** (10, 15, 30 o 60).
- **Cada ejecución** (actualización, prueba histórica y cada turno del vigilante) deja **su informe individual** en la web (Histórico → Informes y descargas). La actualización diaria y la prueba histórica mandan **un aviso al móvil (ntfy) y un correo**. **El vigilante NO avisa** (solo deja el informe) salvo que falle: entonces sí llega un aviso de error.
- Todo gratis: el repositorio es público, y en repositorios públicos GitHub Actions y Pages no cobran.

## Novedades v25 (web v64): valor en directo y pantalla más simple en el móvil
- Nuevo flujo **«Cartera real · valor en directo»** (`real-pulso.yml`): cada ~15 min con la bolsa abierta (lunes a viernes, 9:00–18:15 de Madrid) lee tu cuenta de Trading 212 **solo para mirar** (no compra ni vende ni manda avisos) y guarda el valor del bot.
- La gráfica tiene la opción **«Hoy»**: cómo va el dinero del bot durante el día frente al cierre de ayer.
- La tarjeta principal enseña cifra, resultado, «Invertido / Efectivo» y «Actualizado hace N min». La web se recarga sola cada ~2 min con la pestaña abierta.
- Orden en la Real: tarjeta → gráfica → qué va a hacer → botones → posiciones → detalle → configuración.

## Novedades v24 (web v63): todos los avisos por Telegram

- La cartera real y el simulador (actualización diaria, prueba histórica, vigilante con operaciones y errores) avisan **solo por Telegram**, con importes, órdenes y, si hay propuesta, botones para aprobar o rechazar.
- El móvil (ntfy) y el correo quedan **solo de respaldo**: se usan si Telegram no está configurado o falla tras 4 intentos.
- En los ajustes de la web desaparecen los interruptores de móvil, correo y avisos discretos.

## Novedades v23 (web v62): pantalla reestructurada y diseño nuevo («billete» azul tinta y oro)

- Pestañas: 💶 Real (primera, y se abre sola en tus dispositivos) · 🧪 Ficticia · 📈 Histórico · 👁️ Vigilante · ⚙️ Ajustes · ❓ Ayuda. La web recuerda la última pestaña.
- Real: arriba cuánto vale, qué va a hacer y los botones («Revisar ahora» destacado); debajo, plegado, Detalle (órdenes, informes, contabilidad) y Configuración (método, ajustes, seguridad). Los avisos menores se agrupan.
- Ficticia: valor y ranking arriba; gráfica y detalle del método plegados. Sin las casillas vacías de stop/objetivo en métodos que no los usan.
- Vigilante: explicación, controles y tabla plegados. Ayuda reescrita con el flujo Histórico → Ficticia → Real.
- Solo cambia index.html.

## Novedades v21 (web v57)

- Prueba histórica: solo métodos que se pueden usar en Trading 212 (58), con etiqueta «T212 ✔ / según tu cuenta / acciones EE. UU.» y filtro «Directos en T212». «Quitar las acciones que más subieron»: 0, 10, 20, 30 o 40.
- Telegram: avisos de la cartera real con botones «Aprobar» / «Rechazar» (runner/telegram.mjs y .github/workflows/telegram.yml; secretos TELEGRAM_TOKEN y TELEGRAM_CHAT).
- Cartera real: casilla «Invertir sin mi aprobación» (y «Pausa: solo mirar»); ISIN con botón para copiarlo en órdenes y posiciones; más equivalentes europeos (inmobiliario, bonos de empresa, materias primas, factores y apalancados) y lista «Productos disponibles en tu cuenta» en «Probar conexión».

## Novedades v18 (web v56): prueba histórica con unos 60 métodos

- Unos 60 métodos en 10 familias: rotación de sectores, tendencia, multi-activo (Faber, Keller VAA/DAA, dual momentum), apalancados (x2 y x3 con filtro de tendencia; antes de existir el ETF se simulan con su índice), IA y tecnología, momentum de acciones, reparto fijo (All Weather, Golden Butterfly, paridad de riesgo…), Buffett, estacionales y combinados.
- Pantalla compacta: filtros por familia, «✅ Ganadores», orden por rentabilidad / menor caída / equilibrio, 12 primeros y «Ver los restantes». Al tocar un método se abre su detalle.
- «⚙️ Ajustes de la prueba» desde la web (se guardan en la nube, ajustes.json → bt): incluir acciones sueltas, excluir las 12 ganadoras, mínimo y máximo de acciones, año de inicio y prueba automática diaria.
- «🧪 Pasar a la cartera ficticia»: el método empieza a operar con 500 € ficticios tras la próxima actualización diaria.
- Archivos cambiados: index.html, runner/runner.mjs, runner/hecho.mjs y .github/workflows/ajustes.yml.

## Novedades v17 (web v54): prueba histórica ampliada

- **Solo en la prueba histórica** (no tocan la simulación diaria ni la cartera real), 11 métodos nuevos marcados «solo prueba»:
  - 8 versiones de la Rotación de sectores: 11 sectores (con inmobiliario), fórmula original de Faber (1/3/6/9/12 meses), sin el último mes (12-1), pesos según el riesgo, fuerza ajustada por riesgo, solo los 2 mejores, los 4 mejores y sin filtro de media de 10 meses (control).
  - 3 inspirados en Warren Buffett: Berkshire Hathaway (BRK.B) comprar y mantener; su consejo 90/10 (S&P 500 + bonos cortos); calidad (SPHQ) con reserva que se invierte cuando el S&P 500 cae un 15 %.
- **Unos 28 años de histórico** de los ETFs con Twelve Data (desde 1998-1999): entran las crisis de 2000-2002, 2008, 2020 y 2022. Todos los métodos y el SPY empiezan el mismo día (cuando los sectores tienen un año de datos).
- Como ningún método usa ya acciones sueltas, no se bajan acciones: la prueba tarda unos 10 minutos.
- En «Detalle de un método» puedes elegir cualquiera, también los nuevos, ordenados por rentabilidad anual.

## Puesta en marcha (unos 15 minutos)

1. Crea una cuenta gratis en github.com y pulsa **New repository**. Ponle un nombre (p. ej. `bot-trading`) y márcalo **Public**.
2. Sube el contenido de esta carpeta al repositorio (**Add file → Upload files**): `index.html`, la carpeta `runner` y la carpeta `.github`.
   Si tu sistema oculta `.github`, créala a mano: **Add file → Create new file**, escribe `.github/workflows/diario.yml` como nombre y pega el contenido; repite con `historico.yml` y `vigilante.yml`.
3. **Settings → Secrets and variables → Actions → New repository secret**. Crea los que tengas (son tus claves de la pestaña Ajustes del bot; no se ven nunca en la web):
   - `ALPACA_KEY` → en formato `ID:SECRETO`. **Recomendada:** el vigilante necesita Alpaca o Twelve Data para consultar cotizaciones.
   - `TWELVEDATA_KEY`, `POLYGON_KEY`, `ALPHAVANTAGE_KEY`, `FMP_KEY` (opcionales).
   - **Correo (recomendado: Gmail por SMTP):** `SMTP_USER` (tu dirección de Gmail), `SMTP_PASS` (una **contraseña de aplicación** de 16 letras: myaccount.google.com/apppasswords, requiere tener la verificación en dos pasos) y `EMAIL` (dónde quieres recibirlo; si lo dejas vacío se envía a `SMTP_USER`). Para otro proveedor añade `SMTP_HOST` y `SMTP_PORT`.
   - `WEB3FORMS_KEY` (opcional, solo como respaldo): la versión gratuita de Web3Forms suele rechazar los envíos que no salen de un navegador normal, por eso en la nube puede fallar.
   - `NTFY_TOPIC` → el nombre del tema de la app **ntfy** del móvil (instala «ntfy», suscríbete a un tema largo y secreto, p. ej. `botrade-x7k29qpl4m`, y pon aquí exactamente ese nombre). **Sin este secreto no llega ninguna notificación al móvil.**
   - Para la prueba histórica diaria hace falta `ALPACA_KEY` (o `TWELVEDATA_KEY`, que con su cuota gratuita no llega a 200+ acciones al día).
4. **Settings → Actions → General → Workflow permissions → Read and write permissions → Save.**
5. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.**
6. **Actions → «Actualización de precios» → Run workflow** (y después, si quieres, «Prueba histórica diaria» → Run workflow). La primera vez descarga mucho histórico y puede tardar horas; si no termina, continúa por donde se quedó en la siguiente ejecución.
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

Actions → «Actualización de precios…» (o «Prueba histórica diaria…») → abre las ejecuciones de esa noche. En el paso «¿Toca… en este disparo?» el registro dice la decisión y el motivo (por ejemplo «actualización ya hecha hoy» o «aún no ha pasado una hora desde el cierre»). Si no hay ninguna ejecución esa noche, es que GitHub descartó los 5 disparos: lanza «Run workflow» a mano y avísame para revisarlo.

## Cambios de esta versión (v16) · seguridad reforzada y motor blindado

### Seguridad (para que nadie más vea ni toque tu cartera real)
- **Cifrado más fuerte:** AES-256-GCM con la clave derivada por PBKDF2-SHA256 de **600.000 iteraciones** (recomendación OWASP), para los datos, los ajustes y el token de GitHub. Lo cifrado con versiones anteriores se sigue leyendo y se actualiza solo.
- **«Recordarla en este dispositivo»** ya no guarda la contraseña en claro: la cifra con una clave propia del navegador que no se puede exportar.
- **Contraseña de la cartera obligatoria y fuerte:** 12 caracteres o más, mezclando al menos 3 tipos (o una frase de 20 caracteres o más), y distinta de tus claves de Trading 212. La clave de ⚙️ Ajustes nueva, también de 12 o más.
- **Avisos al móvil «discretos»** (por defecto): sin importes ni posiciones. El correo sigue llevando el informe completo.
- **Panel «🛡️ Seguridad»** en la pestaña Real: explica las capas de protección y tiene «Bloquear ahora», «Olvidar la contraseña en este dispositivo» y «Olvidar el token».
- **Las direcciones de prueba quedan bloqueadas en el motor:** solo se aceptan con REAL_TEST=1 y en 127.0.0.1. En GitHub el bot solo habla con el Trading 212 oficial.

### Motor más robusto
- **Festivos de la bolsa de Fráncfort** (1 ene, Viernes Santo, Lunes de Pascua, 1 may, 24, 25, 26 y 31 dic): no envía órdenes.
- **Desdoblamientos (splits)** detectados: ajusta las participaciones del bot sin confundirlo con una venta.
- **Guardas duras antes de cada orden:** nunca vende más participaciones de las que compró el bot, nunca compra por encima de su dinero y bloquea compras con un precio que se aleje más de un 15 % del último conocido.
- **Pesos de la señal que sumen más del 100 %:** se reducen.
- **Corregido:** al bajar «Dinero que trabaja el bot» después de pérdidas, salía dinero negativo y una pausa falsa. Ahora el bot pasa a trabajar exactamente con esa cantidad.
- **Corregido:** el sobrante invertido se vende aunque esté repartido entre varias posiciones.
- **Corregido:** el freno de pérdidas se mide con la rentabilidad del bot, así que tus aportaciones o retiradas no lo disparan.
- **Pruebas automáticas del motor** en `tests/` (`node --test tests/`): 33 pruebas, incluido un año simulado de uso. Todas pasan.

Archivos que cambian respecto a v15: `index.html`, `runner/real.mjs`, `runner/real-cfg.mjs`, `real-ajustes.json` y la carpeta nueva `tests/`.

## Cambios de la versión v15 · cartera real revisada al milímetro

### El bot tiene su propia «subcuenta» dentro de tu cuenta de Trading 212
- **Capital del bot** = el ajuste **«Dinero que trabaja el bot»** (antes «Dinero máximo»). El bot solo usa eso más lo que vaya ganando, que **se reinvierte**. Antes, tras una rotación, las ganancias se quedaban paradas en efectivo.
- **Lleva la cuenta de las participaciones que ha comprado ÉL**, con su coste. Si tú tienes por tu cuenta el mismo ETF, nunca te lo vende. Antes podía vender cualquier ETF de la lista de equivalentes que tuvieras en la cuenta, aunque fuera tuyo.
- **Si ingresas dinero** en Trading 212, el bot no lo toca y te avisa. Para que lo use, sube «Dinero que trabaja el bot».
- **Subir o bajar ese ajuste** cuenta como aportación o retirada, nunca como ganancia o pérdida. Al bajarlo, vende lo necesario.
- **Si vendes tú a mano** participaciones del bot, lo detecta y las descuenta.
- **Ganancia realizada de cada venta** (precio de venta menos su coste): es la que se declara en la renta.
- **Rentabilidad «ponderada en el tiempo»**: tus aportaciones y retiradas no la alteran. El freno de pérdidas también se calcula sobre el dinero del bot, no sobre toda tu cuenta.

### Órdenes
- **Con la bolsa europea cerrada** (fuera de 9:05-17:20) no se envían órdenes a mercado: quedan «aplazadas». Si las habías aprobado, se ejecutan solas en la siguiente revisión con la bolsa abierta, sin volver a preguntarte (salvo que cambien los activos).
- **Órdenes que Trading 212 deja pendientes**: cada ejecución mira cómo terminaron y apunta precio, cantidad y resultado.
- **Rechazadas o canceladas** por Trading 212: cuentan como error y avisan.

### Todo registrado
- **Informes agrupados por día** (del más nuevo al más antiguo) y, dentro, por hora. Descarga por informe, por día o todos.
- **Historial de órdenes por día**, con hora, cantidad, precio, importe, coste, resultado, quién la aprobó y el efectivo del bot después.
- **Nuevo «📒 Movimientos del bot»**: su libro de cuentas (capital, compras, ventas, aportaciones, retiradas y ajustes) y tus ingresos y retiradas en Trading 212.
- **Descargas .csv** de órdenes, movimientos y valor diario (con la rentabilidad acumulada). Se conservan hasta 5.000 informes.
- **Si un día GitHub no deja guardar el historial**, te llega el informe completo por correo.

Probado contra un Trading 212 simulado con 10 escenarios seguidos: primer día con 100 € (y 0,5 participaciones tuyas del mismo ETF), rotación de sectores, ingreso de 200 €, subida a 150 €, aprobación por la noche (ejecutada sola a la mañana siguiente), órdenes pendientes, una rechazada, una venta tuya a mano, el día siguiente sin cambios y bajada a 80 €. Sigue sin estar probado contra tu cuenta real: la primera vez usa «Probar conexión».

Archivos que cambian respecto a v14: `index.html` y `runner/real.mjs`.

## Cambios de la versión v14 · un solo «Guardar todo» en la cartera real

- En 💶 Real → «Ajustes de la cartera real» hay **un único botón al final, «💾 Guardar todos los ajustes y enviarlos a GitHub»**. Guarda de una vez: activación, entorno, modo, cuándo reajusta, método, importes y frenos, divisa, avisos, informe semanal, sustituciones y las claves escritas (contraseña de la cartera, clave y secreto de Trading 212). Se cifra en el navegador y se envía a GitHub.
- Si está bloqueado, el campo para tu clave de ⚙️ Ajustes aparece **justo encima del botón**: ya no hace falta subir arriba para desbloquear.
- Elegir un método en «🧭 Elige el método» ya no guarda nada por separado: lo deja marcado en el formulario y el botón «Ir a guardar» te lleva al final.
- Aviso «✏️ Tienes cambios sin guardar», y lo que estás escribiendo ya no se pierde si la pantalla se refresca sola.
- Los mensajes de guardado se ven también junto al botón.

Archivo que cambia respecto a v13: `index.html`.

## Cambios de la versión v13

### Arreglado: «No se pudo cargar la librería de cifrado»
Para guardar claves en GitHub Secrets la web tiene que cifrarlas antes, y hasta ahora descargaba esa librería (libsodium) de un CDN; en algunos navegadores o en la APK no cargaba y no se podía guardar ninguna clave. Ahora el cifrado va **dentro de la propia web** (tweetnacl, de dominio público, + BLAKE2b), sin descargar nada. Verificado: la libsodium real (la que usa GitHub) abre todos los secretos que cifra la web. Arregla también el guardado de claves de ⚙️ Ajustes.

### Vigilante: 5 métodos nuevos con estudios publicados, sin estar pendiente cada día
Se retiran los 5 métodos intradía (arranque, hueco, ruptura, fuerza y caída en tendencia): no tenían evidencia y obligaban a mirar cada día. Los nuevos solo revisan su cartera en sus días, a partir de las 15:00 de Nueva York (21:00 en España). Si GitHub se salta la consulta de ese día, revisan en la siguiente.

| Método | Revisa | Evidencia |
|---|---|---|
| Tendencia S&P 500 ×2 (SPY sobre su media de 200 → SSO; si no, efectivo) | lunes y jueves | Gayed y Bilello (2016), 1928-2015: Sharpe 0,51 frente a 0,30 del índice y mucho más capital final; caída máxima −78% |
| Tendencia Nasdaq 100 ×2 (QQQ → QLD) | viernes | adaptación de la misma regla; menos estudiada |
| Cerca del máximo de 52 semanas (8 acciones) | viernes | George y Hwang (2004), Journal of Finance |
| Reversión semanal en las 100 mayores (5 que más caen) | viernes | de Groot, Huij y Zhou (2012): ~0,29% semanal neto 1990-2009; efecto debilitado después |
| Fin de mes ×2 (SPY siempre; SSO del último día al 3.º del mes) | 2 veces al mes | Lakonishok y Smidt (1988), McConnell y Xu (2008); la combinación es nueva, sin probar |

Ninguno garantiza batir al S&P 500 en el futuro: por eso se miden aquí con dinero ficticio. Si quieres, más adelante se pueden añadir a la prueba histórica.

**Avisos:** cuando uno de estos métodos compra o vende, el turno del vigilante te manda un aviso al móvil y un correo con las operaciones (antes el vigilante no avisaba nunca, salvo errores).

Archivos que cambian respecto a v12: `index.html` y `runner/runner.mjs`.

## Cambios de la versión v12 · privacidad total y avisos de todo

**Solo tú puedes ver la cartera real**, aunque la web y el repositorio sean públicos:
- La **contraseña de la cartera** (`REAL_VIEW_PASS`) es **obligatoria**. Sin ella el bot no consulta tu cuenta ni guarda nada.
- Todo lo de la cuenta real (saldo, posiciones, órdenes, informes) se guarda **cifrado** (AES-256) en la rama `real`. Los **ajustes** (`real-ajustes.json`) también: se cifran en tu navegador antes de enviarlos a GitHub.
- Los **registros de GitHub Actions** (que en un repositorio público ve cualquiera) solo dicen «Cartera real · normal · ok»: ni importes, ni ETFs, ni ajustes.
- El botón **💶 Real** solo aparece en tus dispositivos (los que tienen tu token o la contraseña recordada). Si alguien entra por `…/#real`, solo ve «🔐 Zona privada». En un móvil nuevo, abre el enlace de cualquier aviso (lleva `#real`) y escribe la contraseña.
- **Cambiar la contraseña**: escríbela nueva en «Ajustes de la cartera real» (estando dentro con la actual) y guarda. La web guarda también la anterior (`REAL_VIEW_PASS_OLD`) para que el bot recifre el historial sin perder nada.
- Para aprobar órdenes o cambiar ajustes sigue haciendo falta tu token de GitHub (cifrado en tu navegador) y tu clave de ⚙️ Ajustes.

**Avisos de todo lo que hace** (móvil por ntfy y correo, los mismos que ya usa el simulador): cada revisión diaria (con o sin cambios), cada propuesta, cada orden ejecutada o con error, la foto diaria del valor, tus aprobaciones y rechazos, las pausas, la prueba de conexión y el informe semanal. El correo lleva el informe completo. En los ajustes puedes elegir «Avisarme de: solo lo importante». Si falta el tema de ntfy o el correo, la pestaña Real te lo avisa. Recuerda que en ntfy cualquiera que sepa el nombre del tema puede leer sus avisos: usa un nombre largo y raro.

Archivos que cambian respecto a v11: `index.html`, `runner/real.mjs`, `runner/real-cfg.mjs`, `real-ajustes.json`, `.github/workflows/real.yml` y `.github/workflows/real-ajustes.yml`.

## Cambios de la versión v11 · 💶 Cartera real con Trading 212

Nueva pestaña **💶 Real** (al lado de Hoy): tu cuenta de Trading 212 con **dinero de verdad**, siguiendo el método que elijas. Es como la cartera simulada, pero con su propia gráfica, sus ajustes y sus informes. La web nunca habla con Trading 212: lo hace GitHub (flujo `real.yml`) con tus claves guardadas en Secrets.

**Qué hay en la pestaña:** tu cartera real hoy (valor, resultado sobre lo aportado, entorno y modo) · gráfica del dinero real frente al mismo método en la simulación · «Qué va a hacer con tu dinero» (la propuesta del día con **Aprobar y ejecutar / Rechazar**) · lo que tienes en Trading 212 · historial de órdenes · elegir método · «¿Se puede comprar todo?» (qué ETF europeo se compra por cada activo del bot) · acciones (Probar conexión, Revisar ahora, Guardar valor, Reanudar) · informes (resumen, cada ejecución con fecha y hora y descargas .md / .csv / .json) · ajustes propios.

**¿Puede operar todo lo que usa el bot?** Los 5 métodos actuales solo usan ETFs: los 10 sectores del S&P 500, QQQ, SMH e IWM. Los ETFs de EE. UU. no se pueden comprar desde España (normativa PRIIPs), así que el bot compra el **equivalente europeo (UCITS) en euros** que sigue el mismo índice (p. ej. XLK → iShares S&P 500 Information Technology Sector). La señal sale del ETF de EE. UU.; la orden, del europeo. «Probar conexión» lo comprueba con la lista real de tu cuenta y te enseña la tabla. Si alguno no está, esa parte queda en efectivo (o eliges otro ETF en «Sustituciones manuales»).

**Puesta en marcha:**
1. Sube a GitHub todos los archivos (cambian `index.html`, `runner/real.mjs`, `runner/real-cfg.mjs` y `real-ajustes.json`; `real.yml` y `real-ajustes.yml` tienen que estar en `.github/workflows`).
2. En Trading 212: **Ajustes → API (Beta) → Generar clave**, con permisos Account data, Portfolio, Orders (read y execute), History y Metadata, **sin** límite de IP.
3. En la web → 💶 Real → «Ajustes de la cartera real»: escribe tu clave (la misma de ⚙️ Ajustes), pega la *API key* y el *API secret* y pon la **contraseña de la cartera** (REAL_VIEW_PASS, obligatoria): todo lo de tu cuenta real se guarda cifrado con ella. Guardar → te ofrece «Probar conexión».
4. Elige el método (por defecto **Rotación de sectores**, el único que batió al SPY en la prueba histórica), deja el modo **«Con mi confirmación»**, dinero máximo **100 €**, marca «Entiendo que…» y activa.
5. Cada día de bolsa hacia las 10:15 (hora de España) revisa. Si hay órdenes, te llega «🟡 Cartera real: confirma estas órdenes»; ábrelo y pulsa «Aprobar y ejecutar». Foto del valor hacia las 18:45 y **informe semanal los viernes** (móvil y correo).

**Ajustes nuevos de la cartera real:** «Cuándo reajusta» → **Igual que la simulación** (por defecto: solo opera cuando el método revisa su cartera, normalmente una vez al mes; no reajusta por pequeños movimientos de precio) o «También si se desvía» (el comportamiento anterior) · **Informe semanal** (sí/no).

**Seguridad:** modo con confirmación por defecto; freno de pérdidas (pausa sola si cae un 25% desde lo aportado); no opera con datos del bot de más de 5 días; máximo de órdenes por vez; si se pierde la respuesta de Trading 212 al enviar una orden, comprueba antes de repetirla para no duplicarla; las posiciones que tengas tú en la cuenta no se tocan; el número de cuenta no se guarda.

**Con 100 €:** Trading 212 no cobra comisión por orden y admite fracciones de ETF: son 3 ETFs de ~32 €. Lo que más cuesta con poco dinero es el diferencial compra-venta (céntimos por orden) — por eso el modo por defecto opera lo mínimo.

**Mejoras del motor (`runner/real.mjs`):** búsqueda de ETFs UCITS más tolerante con los nombres de Trading 212 (y preferencia por los fondos más líquidos), segunda fuente de precios (Stooq) y último precio ejecutado como respaldo si Yahoo no responde, recuerda los decimales que acepta cada ETF, foto del valor justo después de ejecutar, resumen al final de cada informe con la comparación frente a la simulación, y revisión de la mañana desde las 9:05 (en invierno el disparo de las 9:17 ya cuenta).

Probado contra un Trading 212 simulado (mismos endpoints y respuestas que la API oficial v0): prueba de conexión, propuesta → aprobación → 3 compras, rotación mensual (vende 2 sectores y compra 2), y movimientos de precio con los dos modos de reajuste. **No** se ha probado contra tu cuenta real: la primera vez usa «Probar conexión» y, si quieres, el entorno **Demo**.

## Cambios de la versión v9

- **Flujos separados:** `diario.yml` solo actualiza precios y deja decidir al bot (hasta ~3,5 h); `historico.yml` solo hace la prueba histórica (hasta 3 h) y se lanza sola al terminar la actualización de precios, solo si esa actualización de hoy ya se hizo. Si la actualización falla o no hay sesión (festivo), no se lanza. Los tres flujos (precios, histórico y vigilante) comparten el estado, así que GitHub los ejecuta de uno en uno. El flujo «Reiniciar todo» también para el histórico. Hay que subir `historico.yml` y los dos archivos cambiados (`diario.yml`, `reiniciar.yml`) más `runner/hecho.mjs`.

- **Cartera en dos apartados, siempre por método** (el selector de arriba): **«Datos de la cartera»** (valor, ganancia, efectivo, invertido, ganancia abierta y cerrada, ahorro, órdenes y comisiones, lo que tiene comprado y el riesgo) y **«Qué hacer con esta cartera»** (🟢 COMPRAR / 🔴 VENDER nuevos, el botón «Ya lo he hecho» y el historial de lo que ha hecho el bot). Los títulos tienen el mismo formato que el resto de pantallas.
- **Comisión por defecto: 0,15 € por orden.** Sigue siendo editable (0 a 5 €) en Ajustes y en el recuadro de la nube.
- **Recalcular la cartera con la comisión nueva.** Corrige solo lo que depende de la comisión en las órdenes ya hechas: la comisión de cada orden, el importe, el efectivo, el coste de las posiciones abiertas, el resultado de las ventas y las curvas de valor. No cambia precios, unidades, stops ni decisiones. El ahorro (MSCI World) ya apartado no se toca. Es idempotente (repetirlo no cambia nada) y archiva antes una copia del estado.
  - Desde la web: Ajustes → Editar → «Parámetros del bot» → pon la comisión, marca **«Recalcular también la cartera ya hecha…»** → Guardar edición.
  - Sin token: Actions → «Ajustes de la nube» → Run workflow → **recalcular = si** (y, en `cfg`, `{"fee": 0.15}`).
  - Este paquete ya trae `ajustes.json` con `fee 0,15` y una petición de recálculo: al subirlo, **la siguiente ejecución del bot recalcula la cartera una sola vez**.
- Archivos que cambian respecto a v8: `index.html`, `runner/runner.mjs`, `.github/workflows/ajustes.yml` y `ajustes.json`.

## Simplificación de la app (v9)

- **Menú (v46):** Hoy · Histórico · Vigilante · Ajustes · Ayuda. La antigua pestaña «Cartera» ya no existe: su contenido está dentro de Hoy.
- **Hoy:** nuevo panel «🏆 Qué método va ganando»: tarjetas con la rentabilidad de cada método, sus ventas cerradas y lo que hizo en el último día; al tocar una, te lleva a su Cartera.
- **Ayuda:** de 32 apartados técnicos (~67 KB) a una guía corta de una pantalla: qué mirar y cómo replicar el bot en tu app de trading (comprar, stop loss, objetivo, vender).
- **Ocultos (siguen funcionando por detrás, no se ven):** «Qué ha hecho el bot (en cristiano)» en Hoy; «Informe de rendimiento por método», «Neto frente a bruto» y «Alertas automáticas» en Métodos; «Envío automático por correo», «Auditoría de parámetros y datos» y «Diagnóstico técnico» en Ajustes.
- No se ha borrado ningún archivo: el vigilante, sus flujos y sus datos siguen igual.

## Cambios de la versión v8

- **Cartera → «🧾 Qué hacer con esta cartera»**: bloque desplegable (abierto por defecto) debajo del selector de método. Muestra 🟢 COMPRAR / 🔴 VENDER con activo, fecha, precio y motivo; lo que sigue en cartera (precio de compra y actual, ganancia, peso, stop loss y objetivo del bot) y las ya vendidas. El botón «Ya lo he hecho» hace que la próxima vez solo enseñe lo nuevo.
- Avisa si los datos del bot llevan más de 4 días sin actualizarse.
- No añade ajustes ni cambia el bot ni el runner: solo se sustituye `index.html`.

## Cambios de la versión v7

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

## v46 · Hoy simplificado

- **Hoy** es ahora tu cartera entera, en este orden: gráfica pequeña (botón «Agrandar») · tu cartera ficticia hoy · **Qué hacer con esta cartera** (comprar, vender, stop) · lo que tiene comprado y historial de operaciones (plegados) · qué método va ganando · botón «Actualizar precios y que el bot decida».
- El método elegido (selector de «Tu cartera ficticia hoy» o tarjeta del ranking) gobierna a la vez la gráfica y «Qué hacer».
- **Histórico** (antes «Métodos»): solo la prueba histórica y los informes descargables. Quitados: comparativa de métodos, informe de rendimiento, neto frente a bruto y alertas automáticas (siguen calculándose por detrás, pero no se ven).
- Vigilante, Ajustes y el funcionamiento de la nube no cambian.
