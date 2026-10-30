# Bot Trading en la nube (gratis, sin ordenador encendido)

Qué hace este paquete:

- **Web pública** (GitHub Pages): la abres desde el móvil o el ordenador y ves el bot tal cual, con los datos más recientes. Es de solo lectura.
- **Actualización diaria tras el cierre de Wall Street (hacia las 23:17, hora de España)**: GitHub ejecuta el botón «Actualizar precios y que el bot decida» por ti, lunes a viernes. Hay **5 disparos** (21:17, 21:47, 22:17, 22:47 y 23:17 UTC) y cada uno comprueba primero, en segundos, si el día de hoy ya está hecho; si lo está, no hace nada. Así, si GitHub retrasa o descarta un disparo, el siguiente lo recupera. Cubre horario de verano e invierno sin tocar nada. **Por qué después del cierre y no a la apertura:** el bot decide con velas diarias completas; a la apertura solo existiría la vela de ayer, que ya está procesada.
- **Prueba histórica diaria** (flujo aparte, `historico.yml`): se lanza sola en cuanto termina la actualización de precios (y tiene 3 disparos de seguridad), solo si la actualización de ese día ya está hecha, con un número **aleatorio de acciones entre 200 y el máximo** (por defecto 300) elegidas al azar.
- **Laboratorio** (`laboratorio.yml`): cada 2 horas prueba 48 métodos nuevos y aprende de ellos. Si GitHub no lo arranca a su hora, lo lanza el flujo de Telegram.
- **Cada ejecución** (actualización, prueba histórica y ronda del laboratorio) deja **su informe individual** en la web (Laboratorio → Informes y descargas).
- Todo gratis: el repositorio es público, y en repositorios públicos GitHub Actions y Pages no cobran.

## Novedades v84: menos efectivo parado en la cartera real

- Para comprar basta con que a una posición le falte la orden mínima (5 €): el efectivo que sobra por encima de la reserva se invierte en la siguiente revisión.
- Cada informe de la cartera real explica el efectivo que queda sin invertir (reserva + lo que no llega a la orden mínima).

## Novedades v83: guardián de 24 horas

- El 30-oct GitHub no lanzó **ningún** horario por la mañana, y las cadenas (que se paraban por la noche) no arrancaron. Ahora la cadena del valor en directo es un **guardián que no se para nunca**: fuera del horario de bolsa no lee la cuenta, pero sigue vigilando cada ~10-20 minutos.
- El vigilante, además de la revisión de la cartera real y la actualización de precios, **relanza la cadena del laboratorio** si lleva más de 70 min parada, y el laboratorio **relanza al guardián** si lleva más de 40 min parado: se vigilan el uno al otro.

## Novedades v82: vigilante contra los horarios que se salta GitHub

- GitHub no garantiza los horarios programados. Ahora las dos cadenas que se relanzan solas (laboratorio, 05-20 h, y valor en directo, con la bolsa abierta) hacen de **vigilante** en cada vuelta:
  - si a partir de las 9:10 la **revisión diaria de la cartera real** aún no está hecha, la lanzan;
  - si por la mañana no hay ninguna **actualización de precios** completada desde la tarde anterior, la lanzan.
- Mientras esperan, leen los **botones de Telegram** cada ~2,5 minutos (antes el flujo de Telegram a veces tardaba horas en ejecutarse).
- `real.json` guarda en claro solo la fecha de la última revisión diaria (`meta.revD`), sin importes.

## Novedades v81 (web v133): semillero diario de mixtos y de acciones

- Cada día nacen **2 mezclas nuevas** (ETF, acciones, bitcoin y métodos del laboratorio) y **1 método de acciones**, como variaciones de los que mejor van frente al SPY (o al azar si aún no hay datos). Se prueban con precios reales desde ese día.
- Como mucho 30 en observación: cuando no caben, sale el que peor va frente al SPY de los que llevan al menos 45 días (nunca uno que esté en la ficticia o en tu cartera real).
- La lista «En observación» se ordena por lo que ganan **al SPY** (cada uno desde su día de inicio): 10 a la vista y el resto plegado. Con 12 meses ganándole por 2 puntos, entran solos en la ficticia.
- Las mezclas siempre suman 100 %.

## Novedades v80: el dinero de la cartera real no se queda parado

- Las compras se calculan con un margen de precio (1-3 %) para que Trading 212 no las rechace, y a veces se quedaban cortas. Ahora, si faltan al menos 5 €, se compra el resto **en la misma revisión** con el precio real de la compra que se acaba de hacer.
- Y en las revisiones siguientes, si al bot le sobra efectivo y a una posición le falta al menos un 2 % del presupuesto, se compra lo que falta (antes hacía falta un 5 %). Las ventas siguen con el umbral normal.

## Novedades v79 (web v130): el autorrelleno del móvil no puede tocar ningún ajuste

- En los ajustes de la cartera real, una casilla de texto o importe solo cambia si la escribes o la pegas tú: lo que meta el gestor de contraseñas del móvil se deshace al momento y, al guardar, vale lo que ya estaba guardado.
- Un campo «usuario» invisible recoge el autorrelleno del nombre de usuario junto a tu clave de ⚙️ Ajustes.

## Novedades v78 (web v129): nombres en los avisos y ajustes a prueba de autorrelleno

- Los avisos de la cartera real dicen el nombre del método y no su clave interna (p. ej. «g_1f6605j»).
- Las casillas numéricas de los ajustes de la cartera real tampoco las toca el autorrelleno del móvil.
- En «Elige el método», el primero de cada familia ya no sale resaltado: solo se resalta el que tienes elegido.

## Novedades v77 (web v127): el gestor de contraseñas del móvil ya no rellena tus claves

- Las casillas de claves de la cartera real (Trading 212, Telegram y la contraseña de la cartera) ya no las reconoce el gestor de contraseñas del móvil como «contraseñas», así que no las rellena solo.
- Además, al guardar, una clave solo cuenta si la has escrito o pegado tú: lo que haya rellenado el móvil se descarta y tus claves guardadas no se tocan.

## Novedades v76 (web v126): arreglo de la prueba histórica y liga recuperada

- La v121 rompía la prueba histórica de los métodos con refugio en oro: antes de 2004 el ETF de oro no existía y, en vez de salir a efectivo, se quedaban invertidos en la caída de 2000-2002. Casi todos suspendieron y salieron de la liga y de la ficticia. Se quita esa regla (la protección contra precios que llegan tarde es la de la v122, que solo actúa en la actualización diaria) y se recupera el estado del laboratorio de antes del fallo.

## Novedades v75 (web v125): ajustes de la cartera real siempre con sus valores

- Al abrir «Ajustes de la cartera real», cada casilla toma el valor bueno más reciente: si el guardado llega vacío o roto, se usa el que está usando el bot de verdad. Un valor vacío nunca pisa uno bueno.
- El importe del bot nunca se rellena con el valor por defecto (100 €), para no reducir la cartera sin querer.

## Novedades v74 (web v124): guardar ajustes sin errores falsos

- Si una casilla de importe llega vacía al guardar (pasa en algunos móviles), se conserva el valor ya guardado en vez de dar «debe estar entre…». Acepta coma decimal y, si hay un error de verdad, dice qué valor se ha puesto.

## Novedades v73 (web v123): segunda vuelta de precios

- Si al descargar algún activo se queda sin el precio de la última sesión (Polygon gratis y Yahoo a veces van un día por detrás), se vuelve a pedir **a otro proveedor** en la misma actualización. Así los métodos no se quedan días sin decidir (el 27 y el 28-oct les pasó a XLK y XLE).
- El informe diario dice cuántos se completaron en la segunda vuelta y cuáles siguen sin el precio.

## Novedades v72 (web v122): blindaje contra datos que llegan tarde

- **Barrera 1 (simulador)**: en cada actualización se mira qué activos tienen precios de estos días pero no el de la sesión (el proveedor lo da tarde; el 27-oct le pasó a 40, entre ellos GLD y XLK). Un método que use alguno **no decide ese día** y lo hace en la siguiente actualización. Vale para todos los métodos de ETF, no solo para el refugio.
- **Barrera 2 (cartera real)**: si la cartera objetivo de un método con refugio (oro o bonos) sale vacía, la cartera real **no vende nada** y avisa. También en un reparto entre varios métodos.
- **Aviso**: la revisión automática del aviso diario dice qué ETF llegaron tarde ese día.
- Prueba nueva en el motor de la cartera real (41 pruebas).

## Novedades v71 (web v121): un dato que llega tarde ya no saca a un método del mercado

- Si el precio del refugio (oro o bonos) de ese día aún no ha llegado, el método no decide y lo repite al día siguiente. Antes se quedaba «todo en efectivo» hasta la siguiente revisión (pasó el 27-oct con el oro: la cartera real vendió el oro el 28-oct).
- Autoarreglo: si un método del laboratorio con refugio aparece con la cartera vacía, se recalcula en la siguiente actualización.
- Laboratorio: si una ronda falla al empezar, se reintenta una vez; el motivo de cualquier fallo queda en el resumen de GitHub.

## Novedades v70 (web v120): fuera la pestaña Acciones

- Se quita la pestaña 📈 Acciones (ideas de acciones sueltas sin prueba histórica del conjunto). Todo lo demás sigue igual.

## Novedades v69 (web v119): un laboratorio con más variedad

- 🌈 **Variedad de familias**: el 30 % de cada ronda del laboratorio busca en familias distintas de la que domina la liga (otros grupos de ETF, comprar 2 o 3 en vez de 1…), partiendo de lo mejor que ya sabe de cada una. El 25 % sigue siendo siempre al azar.
- En la liga, como mucho 12 métodos de la misma familia si hay otras que también aprueban el examen (si no, se rellena con los mejores, como antes).
- **Valor en directo de verdad cada ~15 minutos**: el flujo «Cartera real · valor en directo» va en cadena (GitHub solo lo lanzaba 2 veces al día). Solo lee, nunca envía órdenes.
- Flujos de GitHub actualizados a checkout@v5 y setup-node@v5 (los v4 quedaban obsoletos).

## Novedades v68 (web v118): métodos por familias en la cartera real

- En 💶 Real → «Elige el método», los métodos se agrupan por **familias** (los que nacen de la misma idea), cada una plegable: «El mejor de 5 ETF de crecimiento», mezclas del laboratorio, tendencia y tecnología, rotación de sectores, asignación táctica, carteras prudentes…
- Hasta 40 métodos (máximo 6 por familia, los mejores). Cada uno muestra su **riesgo** (🟢 arriesga poco, 🟡 medio, 🔴 mucho, según su peor caída en 26 años) y si gana al SPY.
- Se puede elegir cualquiera, aunque no esté en la ficticia: entra en la ficticia en la siguiente actualización diaria y desde entonces la cartera real lo sigue (hasta entonces no compra ni vende).
- Para repartir el riesgo de verdad, elige métodos de familias distintas.

## Novedades v67 (web v117): reparto entre 2 o 3 métodos y revisión automática

- **Reparto de la cartera real**: además del método principal puedes elegir un 2.º y un 3.º método (💶 Real → «Elige el método» → «➕ Añadir al reparto», o en «Ajustes de la cartera real»). El dinero se reparte a partes iguales: la cartera objetivo es la media de las carteras de cada método. Si no eliges ninguno más, todo sigue exactamente igual que antes.
- Con reparto, las propuestas de cambio sustituyen al método **más flojo** del reparto (nunca proponen uno que ya tienes), y la gráfica deja de comparar con una sola simulación.
- **Revisión automática**: cada día el aviso de la actualización empieza con «🩺 Revisión automática» (todo en orden o qué mirar): precios sin actualizar, muchos símbolos con datos viejos, laboratorio parado, cartera real sin revisar o métodos sin cartera. Si algo falla entre medias, las rondas del laboratorio avisan por Telegram como mucho una vez al día por el mismo problema.

## Novedades v66 (web v114): ideas de traders profesionales en el laboratorio
- Piezas nuevas que el laboratorio combinará solo (y probará con el examen y el examen oculto):
  - **Canal de Donchian** (Richard Dennis y las «tortugas»): en tendencia si el precio está en la mitad alta de su rango de 6 meses.
  - **Momentum absoluto** (Gary Antonacci): solo se queda lo que ha ganado más que la liquidez en 12 meses.
  - **Estacionalidad** (Larry Williams, Yale Hirsch; «efecto Halloween»): de mayo a octubre, media posición.
- 4 métodos de partida con estas piezas sobre el campeón actual y sobre la rotación de sectores.
- 📈 Acciones: el **%R de Larry Williams** (sobreventa por debajo de −80) también cuenta como buen momento para entrar.

## Novedades v65 (web v110): pestaña 📈 Acciones
- Las 10 mejores acciones grandes de EE. UU. para entrar ahora, con: precio de entrada (comprar ya si está en un retroceso dentro de su tendencia o esperar a un precio), stop loss, take profit y % de la cartera.
- Reglas: filtro de mercado (S&P 500 sobre su media de 200), plantilla de tendencia de Minervini, nota por fuerza de 12 meses (Jegadeesh y Titman), cercanía al máximo anual (George y Hwang) y fuerza por riesgo (Barroso y Santa-Clara); entrada en retroceso (Connors), stop 2,5 ATR (Wilder), objetivo 2,5R, peso arriesgando el 1 % (Van Tharp, máx. 10 %), y nunca dos que se muevan casi igual.
- Solo orientativo: el bot no compra estas acciones.

## Novedades v64 (web v108): arreglos en los métodos en vivo
- «En observación» y la comparación con el SPY cuentan desde el capital inicial (500 €), no desde el cierre del primer día: ya se ve lo que llevan ganado o perdido desde el principio.
- Precios: si un proveedor trae menos historia que la que había (Alpha Vantage solo da 100 días), se conserva la anterior. Por eso QQQ se había quedado con 100 velas y las mezclas con «Nasdaq 100 en tendencia» dejaban esa parte en efectivo.
- Si a una parte de una mezcla le faltan datos, se vuelve a intentar al día siguiente en vez de esperar al mes siguiente.

## Novedades v63 (web v107): «🔭 En observación» en el Laboratorio
- Recuadro plegable con los métodos de acciones, mixtos (ETF + acciones + cripto) y cripto que se prueban en vivo: cuánto llevan ganado con precios reales, frente al SPY en el mismo tiempo, y cuántos meses les faltan para poder entrar. Solo para mirar: no se pueden elegir.

## Novedades v62 (web v106): «Elige el método» con 10 y comparado con el tuyo
- En 💶 Real → «🧭 Elige el método» (y en el desplegable de los ajustes) solo salen 10: tu método y los 9 mejores que pasan tus condiciones.
- Cada uno dice cuánto gana en la prueba de 26 años (después de impuestos) y cuántos puntos al año más o menos que el tuyo, y cuánto lleva con precios reales desde la misma fecha que el tuyo (según lo que compraría, su cartera en la ficticia).
- Se ordenan de más a menos ganancia; dos botones para ordenar por la prueba o por lo que llevan con precios reales.

## Novedades v61 (web v105): top 20 y avisos solo por el podio
- La pestaña Laboratorio muestra solo los 20 que más ganan al SPY (con tus condiciones), ordenados: los 5 primeros a la vista y los puestos 6-20 en un recuadro plegable. El resto ya no se muestra.
- Avisos: solo cuando entra en el top 3 un método MEJOR que el que estaba 3.º. La prueba de cada noche y las rondas del laboratorio ya no avisan por cada ganador nuevo (los errores siguen avisando siempre).

## Novedades v60 (web v104): métodos «⚡ invencibles»
- Si un método cumple TODO esto, se te propone para la cartera real sin esperar los 30 días de ficticia (basta con 1 día, para que tenga su cartera calculada): ≥5 puntos al año más que el SPY después de impuestos, le gana en los 3 tramos, caída máxima no peor del −30 %, y en el examen oculto le gana por ≥10 puntos.
- El aviso de Telegram lo dice claro: todavía no tiene resultados con precios reales. Siempre con tu aprobación, y como mucho un cambio al mes.

## Novedades v59 (web v103): de la ficticia a tu dinero real, más rápido
- Un método se considera confirmado tras **30 días** en la ficticia (antes 3 meses) sin quedarse más de 2 puntos por detrás de tu método ni del SPY. Los del laboratorio, además, con el examen oculto aprobado.
- Solo se te propone si gana a tu método por **2 puntos al año o más** (antes medio punto).
- Como mucho **un cambio cada 3 meses**; si el nuevo es **4 puntos o más** mejor, basta con 1 mes desde el último cambio.
- Siempre con tu aprobación («✅ Cambiar» en Telegram o en la web).

## Novedades v58 (web v102): la ficticia lleva siempre los 20 más rentables
- En cada ronda la ficticia se queda con los 20 métodos más rentables (después de impuestos) que pasan tus condiciones y, los del laboratorio, el examen oculto. Un ganador nuevo entra en la misma ronda en que aprueba; el que baja del puesto 20 sale. El que ya está tiene 0,25 puntos de ventaja para no cambiar por décimas.
- El método de tu cartera real (y el que te propone el bot) no sale nunca: la cartera real publica solo sus claves (sin importes) y el bot las respeta.
- La pestaña Ficticia ordena por lo que gana cada método al año: los 5 primeros a la vista, los otros en un recuadro plegable y tu método actual aparte.

## Novedades v57 (web v100): examen oculto
- El laboratorio busca y aprende solo con los datos hasta hace ~2 años (505 sesiones). Esos 2 últimos años son un **examen oculto**: para entrar en la liga, un método tiene que ganar también al SPY ahí, en datos que no pudo ver al buscar (después de impuestos).
- El modelo de la búsqueda inteligente tampoco ve el examen oculto: así no puede «aprendérselo».
- Los de la liga se vuelven a examinar cada noche con esta regla; el top 5 y la ficticia solo muestran a los del laboratorio que la pasan.
- El aviso de «MUY bueno» sube el listón cuantos más métodos se han probado: 4 puntos sobre el SPY con 1 000 probados, 5 con 10 000, 6 con 100 000.

## Novedades v56: laboratorio en cadena
- GitHub casi no respeta los horarios frecuentes (el laboratorio «cada 2 horas» arrancaba 2-3 veces al día). Ahora cada ronda lanza la siguiente al terminar: una cada ~35-40 minutos entre las 03 y las 19 UTC (05-21 en España), como mucho 30 al día.
- Si la cadena se corta, el horario del flujo y el de Telegram la vuelven a arrancar.

## Novedades v55 (web v99): búsqueda inteligente en el laboratorio
- Antes de probar un método, un modelo predice su nota con todos los ya examinados (los más parecidos) y el laboratorio prueba sobre todo los más prometedores (75 % de cada ronda).
- Regla fija: el otro 25 % es SIEMPRE al azar, para que nunca deje de descubrir cosas nuevas ni se encierre en una idea.
- Guarda la nota de los últimos 6 000 examinados y mide cuánto acierta el modelo (se ve en el recuadro del laboratorio).
- En una simulación, los elegidos por el modelo sacaron de media un 0,74 frente al 0,55 de los elegidos al azar.

## Novedades v54 (web v97): todo a Telegram y claves recordadas
- Cada botón de descarga (informes, datos, copias, CSV de la cartera real…) deja elegir **📤 Enviar a mi Telegram** o descargar. Se configura una vez en ⚙️ Ajustes → «📤 Telegram en este dispositivo» (al guardar las claves de Telegram en la cartera real se configura solo).
- La **clave de ajustes** también se puede recordar en el dispositivo (cifrada con una clave propia del navegador): la web se desbloquea sola al abrirla y ya no se bloquea a los 10 minutos. «Bloquear» la olvida.
- «Recordarla en este dispositivo» viene marcado por defecto.

## Novedades v53 (web v95): el laboratorio no se para nunca
- Piezas con números (media del filtro de tendencia, media de la alarma, nivel del freno de volatilidad): cientos de millones de combinaciones, así que nunca se queda sin métodos por probar.
- Si todo lo cercano ya está probado, salta más lejos (cambia 2-4 piezas a la vez) y mezcla entre sí a los de la liga.
- Recuerda los últimos 30 000 métodos probados (antes 4 000) para no repetir.
- Mantenimiento automático: una vez al día comprueba que todos los procesos de GitHub siguen activos (los reactiva si hace falta) y, si la rama principal lleva 30 días sin cambios, deja una marca para que GitHub no desactive los horarios (lo hace a los 60 días sin actividad).

## Novedades v52 (web v92): fuera el Vigilante
- Se quita la pestaña **👁️ Vigilante** y todo su código (también el antiguo vigilante intradía, que ya no funcionaba). La prueba histórica y la ficticia ya cubren lo que hacía: la histórica examina 26 años y la ficticia prueba los ganadores con precios de hoy.
- La web pesa menos (unas 400 líneas menos) y el estado publicado también (ya no guarda las curvas del último año de cada método).
- «Ajustes de la nube» ya no pide el intervalo del vigilante.

## Novedades v51 (web v91): en la ficticia solo los que ganan
- Solo se ven los ✅ Ganadores del histórico y tu método actual. Los de acciones, mixtos y bitcoin siguen probándose en segundo plano y aparecen si llevan 12 meses ganando al SPY por ≥2 puntos.

## Novedades v50 (web v89): métodos inventados por Claude y piezas nuevas
- Tres métodos nuevos diseñados a mano. Por ejemplo, el primero: «los 2 mejores ETF de crecimiento, con alarma del S&P 500, freno de volatilidad y refugio dinámico». Pasan el mismo examen que todos y, si no aprueban, no se quedan.
- Piezas nuevas para el laboratorio: **freno de volatilidad** (si el Nasdaq está muy nervioso, solo media posición) y **refugio dinámico** (va al más fuerte de oro, bonos o liquidez en los últimos 3 meses).

## Novedades v49 (web v88): el laboratorio aprende a aprobar, no solo a ganar más
- Antes, lo que aprendía el laboratorio premiaba solo ganar más que el SPY. Eso le empujaba a métodos muy rentables pero con caídas enormes (−45 %), que luego suspendían el examen.
- Ahora cada método saca una **nota de 0 a 10** según lo cerca que se queda de cada condición del examen (2 puntos más que el SPY, caída no peor del −35 %, ganar en 2000-2015 y en 2016-hoy, pocas ventas). El laboratorio aprende de esa nota y cría a partir de los que más se acercan.
- Pieza nueva: **alarma del S&P 500** (si el S&P 500 cae bajo su media de 10 meses, todo al refugio). Sirve para recortar las caídas grandes.
- La web y el aviso de Telegram dicen cuál se ha quedado más cerca y **qué le falta** para aprobar.

## Novedades v48 (web v87): mezclas que evolucionan solas (ETF + acciones + bitcoin)
- Siempre hay 4 mezclas compitiendo en la ficticia (al principio: bitcoin en tendencia, QQQ 80 % + bitcoin 20 %, QQQ 50 % + 10 acciones 50 %, sectores 70 % + bitcoin 30 %).
- Cada 2 meses, la que peor va frente al SPY (con ≥4 meses de datos) se sustituye por una **variación de la mejor**: cambia porcentajes, cambia una pieza o añade o quita una. Piezas: Nasdaq 100 en tendencia, rotación de sectores, bitcoin en tendencia, estrategias de acciones y **el mejor ganador del laboratorio de ETF**.
- Para proponerse a tu cartera: 12 meses ganando al SPY por ≥2 puntos. Si a una parte le faltan datos, esa parte queda en efectivo.

## Novedades v47 (web v86): mixtos y bitcoin en prueba en vivo
- 4 métodos más en la ficticia, marcados 🔭: **bitcoin en tendencia**, **Tendencia QQQ 80 % + bitcoin 20 %**, **Tendencia QQQ 50 % + 10 acciones con momentum 50 %** y **sectores 70 % + bitcoin 30 %**. El bitcoin no tiene historia desde 2000, así que se prueban desde hoy (12 meses ganando al SPY por ≥2 puntos para proponerse).
- Precio del bitcoin: IBIT (ETF de bitcoin de BlackRock). En Trading 212 se compraría un ETP de bitcoin en euros (sin apalancar), si tu cuenta lo tiene; el bot lo comprueba antes de proponerlo.
- Al aprobar un método con acciones o productos en dólares se activa también la compra de acciones y de productos en dólares.

## Novedades v46 (web v85): ETF o acciones, gana el mejor
- Si el método confirmado es de acciones y tienes desactivada su compra, la propuesta llega igual con «✅ Cambiar»; al aprobarla se activa también la compra de acciones (te avisa del 0,15 % de cambio de divisa salvo saldo en dólares).

## Novedades v45 (web v84): el laboratorio no para nunca
- Nuevo flujo **`laboratorio.yml`**: además de la prueba de la noche, cada 2 horas de 03:00 a 19:00 UTC (también fines de semana) hace una ronda de 48 métodos nuevos. Unos 450 métodos al día.
- No coincide con la actualización de precios ni con la prueba de la noche, y si hay otra tarea del bot en marcha se salta esa ronda. Las rondas extra no cuentan como «la prueba de hoy».
- Solo avisa por Telegram si encuentra un ganador. De sus informes solo se guardan los 5 últimos.

## Novedades v44 (web v83): el laboratorio prueba 48 métodos por noche (antes 12)
- Aprende 4 veces más rápido. La prueba de cada noche tardará algo más (~20-30 min).

## Novedades v43 (web v82): todos los recuadros se pueden minimizar
- Cada recuadro de todas las pestañas tiene un botón «–» arriba a la derecha para minimizarlo (y «+» para abrirlo). Se recuerda en cada dispositivo, también tras recargar.

## Novedades v42 (web v81): las acciones también evolucionan solas
- Cada 3 meses, el método de acciones 🔭 que peor va frente al SPY (con ≥6 meses en la ficticia) se sustituye por una **variación del que mejor va** (otro criterio: 3, 6 o 12 meses, máximo de 52 semanas, fuertes y tranquilas; o más o menos acciones: 5 a 20). Siempre hay 3, sin fin. Queda en «Últimos movimientos» como 🔄 evoluciona.

## Novedades v41 (web v80): acciones en prueba en vivo
- La prueba histórica con acciones hace trampa (usa la lista de empresas de hoy: ya «sabe» quién sobrevivió). Por eso 3 métodos de acciones con estudios detrás (momentum de 10 grandes con filtro de mercado, cerca del máximo de 52 semanas y momentum tranquilo) **van directos a la ficticia, marcados «🔭 en vivo»**, y solo cuentan sus resultados desde hoy.
- Para proponerse a tu cartera real necesitan **12 meses en la ficticia ganando al SPY por ≥2 puntos**. Si tienes desactivada la compra de acciones, el aviso te lo dice y no trae botón de cambiar.
- No entran en la prueba histórica (no se bajan cientos de acciones cada noche).

## Novedades v40: avisos del laboratorio por Telegram
- El aviso de cada noche (prueba histórica) empieza con lo que ha hecho el laboratorio: probados, aprobados, liga, y los movimientos del día (🌱 nace, 📝 aprueba, 🎲 descartado, 🧪 a la ficticia…).
- Si aparece un ganador nuevo, el título lo dice: «🌱 nuevo método ganador»; si además gana al SPY por ≥4 puntos al año, «🌟 método MUY bueno».
- Cuando un ganador se confirma 3 meses en la ficticia y es mejor que tu método, llega la propuesta con «✅ Cambiar / ❌ No cambiar» (cartera real).

## Novedades v39 (web v78): el laboratorio aprende de verdad y no se agota
- **Aprende**: apunta qué piezas ganan más al SPY y las elige más a menudo (sin dejar de explorar). Cada noche: variaciones de los mejores y de los que casi aprueban (evolución), mezclas 50/50 de dos buenos (o de uno bueno con la Tendencia QQQ) y exploración guiada. En el Histórico: «🧠 Lo que va aprendiendo».
- **~40.000 combinaciones** (7 grupos de ETF, 9 plazos, ajuste por riesgo, refugio en bonos u oro, mensual o trimestral…) más las mezclas: no se agota.
- **Prueba de estabilidad**: el que aprueba el examen queda «📝 en prueba de estabilidad»; la noche siguiente se prueban dos variantes cercanas y al menos una tiene que ganar al SPY. Si no, se descarta («era suerte»).
- **Cartera real**: solo te propone métodos que se pueden comprar enteros en tu Trading 212.

## Novedades v38 (web v77): el bot aprende solo (laboratorio) y te propone cambios por Telegram
- **🤖 Laboratorio**: cada noche, con la prueba histórica, inventa 12 métodos nuevos combinando piezas con estudios (qué ETF, fuerza de 1 a 12 meses, cuántos compra, filtro de tendencia, mensual o trimestral). Solo se quedan los que aprueban el **examen contra la suerte**. La liga tiene como mucho 20; los que dejan de aprobar salen solos. Todo queda en el Histórico («🤖 Laboratorio» y «Últimos movimientos»).
- **Examen contra la suerte para todos**: ✅ Ganador = ≥2 puntos al año más que el SPY (después de impuestos), le gana en 2000-2015 **y** en 2016-hoy, peor caída no peor del −35 %, pocas operaciones y datos desde el principio.
- **Ficticia**: entran solos los ganadores (como mucho 5 a la vez); si en 12 meses van más de 5 puntos peor que el SPY, se apartan.
- **Cartera real**: si un ganador lleva 3 meses en la ficticia sin ir peor que tu método ni que el SPY, y ganó más en la prueba, **te llega a Telegram con «✅ Cambiar» / «❌ No cambiar»**. Sin tu sí no cambia nada; si dices que no, no se repite en 60 días. Si guardas los ajustes desde la web, manda el método que tengas elegido allí.
- Pruebas nuevas del motor: propuesta, aprobación y cambio de método (`node tests/engine.test.mjs`, 39 pruebas).

## Novedades v37 (web v76): vuelve el Vigilante, sencillo: «¿funcionan ahora?»
- Pestaña **👁️ Vigilante**: cómo les va a los ~40 candidatos en el último mes, 3 meses, 6 meses o 1 año, frente al SPY, con una minigráfica de cada uno. Arriba, los ✅ Ganadores; debajo, todos de más a menos.
- Sale de la prueba histórica de cada noche (guarda los últimos 12 meses de cada método en `S.btm.rec`): no hace consultas nuevas ni operaciones. Aparece después de la próxima prueba.

## Novedades v36 (web v75): web más ligera, cambios solo confirmados e impuestos
- **Web ~6 veces más ligera** (de ~60 MB a ~10 MB): los informes de la prueba histórica ya no publican todas las operaciones y curvas de cada método, los informes de más de 7 días se resumen, se guardan como mucho 150, y se borran los restos del vigilante.
- **«¿Hay algo mejor?» solo recomienda cambiar** cuando un ganador lleva **3 meses en la ficticia** sin ir peor que tu método ni que el SPY. Antes sale como «⏳ en observación».
- **Impuestos (España, 19 % aprox.)**: la prueba histórica calcula también la rentabilidad después de impuestos (los que venden mucho pagan cada año; comprar y mantener aplaza el pago). El filtro de ✅ Ganador compara después de impuestos desde la próxima prueba.

## Novedades v35 (web v74): la app, ordenada para encontrar métodos para la cartera real
- **Histórico = buscador.** Prueba cada noche unos 40 candidatos: ETF europeos en euros (sin comisión ni cambio de divisa en Trading 212), revisión mensual o más lenta y sin apalancar. Fuera las acciones sueltas (dólares: 0,15 % de cambio por operación y sesgo de supervivencia), los métodos semanales o diarios y los apalancados. Mucho más rápido: ya no baja cientos de acciones.
- **Filtro de ✅ Ganador**: ≥2 puntos al año más que el SPY, le gana en 2 de 3 tramos, peor caída no peor del −35 %, ≤12 ventas al año y datos desde el principio.
- **Ficticia:** los ganadores entran solos (y ya no salen) y operan con precios de hoy junto al método base.
- **Real:** nueva tarjeta «🔎 ¿Hay algo mejor?», que compara tu método con los ganadores y te lleva a cambiarlo si quieres (no cambia nada hasta que guardes).
- **Vigilante intradía retirado** (muchas operaciones al día: lo contrario de lo que se busca). Se borran su flujo `vigilante.yml` y sus pruebas.

## Novedades v34 (web v73): la gráfica de «Hoy» no cuenta los ingresos como ganancia
- Si metes o sacas dinero durante el día, la gráfica de «Hoy» lo descuenta desde ese momento (antes salía, por ejemplo, +33 % al ingresar 100 €).

## Novedades v33 (web v72): la Real enseña tu cuenta como Trading 212
- Arriba: el valor de tu cuenta, inversiones, efectivo, lo de desde ayer y el rendimiento, con las mismas cifras que la app de Trading 212. Si en la cuenta hay dinero tuyo que el bot no maneja, lo indica.
- Nuevo «🧭 Resultado por método»: cuánto ganó o perdió el bot con cada método que has tenido, con sus fechas (lo que metes o sacas no cuenta).

## Novedades v32 (web v71): la cartera real se actualiza de verdad durante el día
- Las revisiones programadas de la cartera real (cada media hora de 9:17 a 17:47) leen el valor de tu cuenta cuando la revisión del día ya está hecha (antes terminaban sin hacer nada). Así la web sigue a Trading 212 aunque GitHub no haya activado todavía «valor en directo».
- El botón «↻ Actualizar» de la pestaña Real lee ahora tu cuenta de Trading 212 en el momento (tarda ~1 minuto).

## Novedades v31 (web v70): vigilante más rápido
- Pide los datos a Alpaca de 4 en 4 (en paralelo): rehacer el año pasa de varias horas a una o dos ejecuciones. Mientras falte año por calcular, cada ejecución trabaja hasta 32 minutos.
- En «Cómo se calcula» se ve cuántas consultas hizo y cuánto tardó.
- La etiqueta pasa a «Mejor que el SPY» (puede serlo perdiendo dinero, si el SPY cae más).

## Novedades v30 (web v69): el Vigilante, solo con lo que se puede hacer en Trading 212
- Quedan 4 métodos: «acciones en juego» de Zarattini, Barbon y Aziz (2024) con rango de apertura de 5, 15, 30 y 60 minutos. Acciones de EE. UU., **solo compras y sin apalancar** (Trading 212 no permite cortos ni apalancamiento), todo vendido antes del cierre.
- Costes: sin comisión, 0,03 % de deslizamiento por lado. Se muestra también el resultado pagando el 0,15 % de cambio € → $ en cada operación (con saldo en dólares no se paga).
- Se recalcula el último año desde cero en la próxima ejecución.

## Novedades v29 (web v68): Vigilante intradía con 10 métodos de day trading
- El Vigilante ahora prueba **10 métodos intradía con estudios publicados** (zona de ruido del SPY, ruptura de los 5 primeros minutos en QQQ y TQQQ, acciones «en juego», VWAP en QQQ y TQQQ, primera media hora y resto del día → última media hora). Todos abren y cierran dentro del mismo día.
- Se calculan con **velas reales de 1 minuto de Alpaca** (secreto `ALPACA_KEY`). La primera vez rehace el **último año entero**; después añade cada día de bolsa y el día en curso cada hora.
- Pantalla corta: clasificación frente al SPY (1 mes / 3 meses / todo), y en cada método su gráfica, «solo compras», peor bajada, operaciones, qué dice el estudio y si se puede en Trading 212.
- Al cerrarse un día te llega el resumen al Telegram. Los 5 métodos semanales del vigilante anterior dejan de ejecutarse (no eran intradía).
- Pruebas: `node tests/vigilante.test.mjs`.

## Novedades v28 (web v67): «Actualizar precios y que el bot decida» funciona desde la web
- En la Ficticia, el botón lanza en GitHub la actualización de precios (`diario.yml`), espera a que termine y recarga la web con los datos nuevos. Usa el mismo token y la misma clave de ajustes que «Ejecutar prueba».

## Novedades v27 (web v66): modo sencillo
- La web se abre en **modo sencillo**: solo lo importante (cuánto tienes, si gana o pierde, qué hará y qué métodos van mejor), con palabras para quien no sabe de trading.
- En el Histórico cada método dice en qué se habrían convertido **100 €** desde el inicio de la prueba y su peor bajada.
- Arriba a la derecha, **«👓 Ver todo»** enseña todo lo demás (Vigilante, informes, contabilidad, seguridad, filtros…). Se recuerda en cada dispositivo. No se ha borrado nada.

## Novedades v26 (web v65): todos los botones enseñan que están trabajando
- Al pulsar cualquier botón que tarda (revisar, aprobar, guardar ajustes, prueba histórica, recargar, desbloquear…), el botón muestra un círculo girando y abajo aparece una barra con lo que está haciendo en cada momento y el tiempo que lleva.
- Al terminar, la barra dice «✔ Listo» (verde) o avisa si hubo un problema (rojo) durante unos segundos.

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
