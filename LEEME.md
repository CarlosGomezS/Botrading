# Bot Trading en la nube (gratis, sin ordenador encendido)

Qué hace este paquete:

- **Web pública** (GitHub Pages): la abres desde el móvil o el ordenador y ves el bot tal cual, con los datos más recientes. Es de solo lectura.
- **Actualización diaria a las 23:00 (hora de España)**: GitHub ejecuta el botón «Actualizar precios y que el bot decida» por ti, lunes a viernes. Cambia sola entre horario de verano e invierno.
- **Prueba histórica diaria**: justo después de la actualización, con un número **aleatorio de acciones entre 200 y el máximo** (por defecto 300) elegidas al azar.
- **Vigilante**: GitHub lo mantiene encendido en turnos de 55 minutos mientras Wall Street está abierto (lunes a viernes). Consulta **cada X minutos según el desplegable** (10, 15, 30 o 60).
- **Cada ejecución** (actualización, prueba histórica y cada turno del vigilante) deja **su informe individual** en la web (Informe → Registro). La actualización diaria y la prueba histórica mandan **un aviso al móvil (ntfy) y un correo**. **El vigilante NO avisa** (solo deja el informe) salvo que falle: entonces sí llega un aviso de error.
- Todo gratis: el repositorio es público, y en repositorios públicos GitHub Actions y Pages no cobran.

## Puesta en marcha (unos 15 minutos)

1. Crea una cuenta gratis en github.com y pulsa **New repository**. Ponle un nombre (p. ej. `bot-trading`) y márcalo **Public**.
2. Sube el contenido de esta carpeta al repositorio (**Add file → Upload files**): `index.html`, la carpeta `runner` y la carpeta `.github`.
   Si tu sistema oculta `.github`, créala a mano: **Add file → Create new file**, escribe `.github/workflows/diario.yml` como nombre y pega el contenido; repite con `vigilante.yml`.
3. **Settings → Secrets and variables → Actions → New repository secret**. Crea los que tengas (son tus claves de la pestaña Ajustes del bot; no se ven nunca en la web):
   - `ALPACA_KEY` → en formato `ID:SECRETO`. **Recomendada:** el vigilante necesita Alpaca o Twelve Data para consultar cotizaciones.
   - `TWELVEDATA_KEY`, `POLYGON_KEY`, `ALPHAVANTAGE_KEY`, `FMP_KEY` (opcionales).
   - `WEB3FORMS_KEY` (clave de web3forms.com; es la que hace llegar los **correos**) y `EMAIL` (tu correo, solo de recordatorio).
   - `NTFY_TOPIC` → el nombre del tema de la app **ntfy** del móvil (instala «ntfy», suscríbete a un tema largo y secreto, p. ej. `botrade-x7k29qpl4m`, y pon aquí exactamente ese nombre). **Sin este secreto no llega ninguna notificación al móvil.**
   - Para la prueba histórica diaria hace falta `ALPACA_KEY` (o `TWELVEDATA_KEY`, que con su cuota gratuita no llega a 200+ acciones al día).
4. **Settings → Actions → General → Workflow permissions → Read and write permissions → Save.**
5. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.**
6. **Actions → «Actualización diaria» → Run workflow.** La primera vez descarga mucho histórico y puede tardar horas; si no termina, continúa por donde se quedó en la siguiente ejecución.
7. Tu web quedará en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`. Ábrela desde el móvil y guárdala en favoritos o en la pantalla de inicio.

## Comprobar que los avisos llegan

**Actions → «Probar avisos (móvil y correo)» → Run workflow.** En un par de minutos debe sonar el móvil y llegar un correo. Además deja un informe «prueba-de-avisos» que indica qué secretos faltan (✖ FALTA). Cada informe real termina con un apartado «Avisos de esta ejecución» que dice si el móvil y el correo se enviaron (✔) o por qué no (✖).

## Cambiar el intervalo del vigilante y el máximo del histórico

El desplegable «Cada … min» (pestaña Vigilante) y el máximo de acciones (pestaña Informe) de la web son de solo lectura para la nube; para que cambien lo que hace GitHub:

- **Sin token (lo más simple):** Actions → «Ajustes de la nube» → Run workflow → elige el intervalo y el máximo. Se guarda en `ajustes.json` y se aplica desde el siguiente turno.
- **Desde la web (opcional):** crea en GitHub un token «fine-grained» limitado a este repositorio con permiso **Actions: Read and write**, pégalo en el recuadro «☁️ Ajustes de la nube» (pestaña Vigilante; solo se guarda en ese navegador) y pulsa «Aplicar en la nube» después de cambiar el desplegable o el máximo.

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

- La web muestra los datos publicados por el último turno: el vigilante los actualiza cada 10 minutos aproximadamente, y GitHub puede tardar unos minutos más en servirlos.
- GitHub no garantiza la hora exacta de las tareas programadas: pueden retrasarse varios minutos en horas de mucha carga y, muy de vez en cuando, saltarse un turno. Entre turnos del vigilante puede haber huecos de unos 5 minutos.
- El repositorio es público, así que cualquiera con el enlace puede ver tu cartera ficticia. Las claves no se publican nunca.
- Las fuentes sin clave (Yahoo y Stooq) pasan por proxies públicos que pueden bloquear a GitHub. Con una clave de Alpaca funciona mejor.
- Si el repositorio no tiene actividad durante 60 días, GitHub pausa las tareas programadas. Las publicaciones del bot cuentan como actividad; si un día aparecen pausadas, pulsa **Enable workflow** en la pestaña Actions.
- **Límite de correos:** Web3Forms gratis admite 250 envíos al mes. Con un correo por actualización (~22), por prueba histórica (~22) y por turno del vigilante (~8 al día, ~175) salen unos 220 al mes: muy justo. Si te quedas sin cupo, el informe lo anota (✖) y el aviso al móvil sigue funcionando.
- Los correos se envían desde el navegador de la nube igual que hace la app; si Web3Forms rechazara ese origen, el informe lo dirá en «Avisos de esta ejecución».
- Para parar el bot, desactiva los workflows en la pestaña Actions.

## Cambios en la web respecto a tu archivo

Solo estos: la nueva función de informes individuales y la prueba histórica diaria (el campo «Máximo» ahora vale 300 por defecto), el recuadro «☁️ Ajustes de la nube» del modo visor; y lo que ya había: se quitó tu correo del código (ahora viene de los Secrets); se añadió el modo visor (carga los datos publicados, muestra una barra con la fecha del último dato y desactiva los botones que consultarían precios); y dos líneas que avisan a la app de cuándo ha terminado de cargar. Abierto en tu ordenador como archivo, funciona como siempre.
