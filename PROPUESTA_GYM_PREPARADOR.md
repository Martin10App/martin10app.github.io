# 🏋️ Propuesta Técnica: Gym como Preparador Físico Profesional + Seguimiento de Planes + Fixes

Este documento detalla las mejoras y correcciones solicitadas por Martín para la sección **Gym** y el **Asistente/Coach IA** en `index.html`.

## 1. Bugs en Gym y Comparación Semanal
1. **Peso representativo y comparación entre semanas (`updateWeekLogFromCurrent`, `compareWeekRow`, `openWeekDetail`):**
   - En `updateWeekLogFromCurrent()` (línea 3863), si `weights[wk]` está vacío o hay `setLogs` completados, guardar como `weight` del ejercicio el peso de la mejor serie efectiva (`bestProgressSet(logs, ex)?.weight || weights[wk] || ''`).
   - En `compareWeekRow(prev, curr)` (línea 1959) y `openWeekDetail(weekId)` (línea 2021), buscar ejercicios por nombre normalizado (`normStr(x.name)===normStr(pe.name)`) en vez de índice fijo `i`, y comparar la mejor serie realizada (`bestProgressSet`) usando `compareSetToLast`: mostrar evolución tanto de **kg** como de **repeticiones** y **fuerza estimada (`e1RM`)**, no solo cambios de `pe.weight`.

## 2. Seguimiento de Planes (3 / 6 / 12 meses y Bloques Semanales) como Preparador Físico
1. **Tablero del Preparador en `rGymWeeks()` (línea 1804):**
   - Asegurar `ensureProgramsForGym()` al renderizar `rGymWeeks()` y `rGymTrain()`.
   - Mostrar en el encabezado de `Semanas` no solo `Bloque X · Acumulación/Revisión`, sino también:
     - **Foco de la semana del programa activo (`programWeekInfo`)**: foco (`wk.focus`), RIR objetivo (`wk.rir`) y volumen (`wk.volume`).
     - **Conexión con el Plan de 3/6/12 meses (`gymPlan1`)**: indicar qué programa corresponde al mes actual (`gymPlan()[monthKey()]`) y si está en curso o pendiente de activar.
     - **Índice de Recuperación y Fatiga Semanal**: cruzar el RPE medio y Energía media de las sesiones recientes (`gymHist`) con el sueño promedio de 7 días (`nutData.sleepLog`), mostrando semáforo de preparación (`Óptimo para sobrecarga`, `Fatiga moderada`, `Fatiga alta / priorizar recuperación`).
     - **Semáforo de Progresión de la Rutina Activa**: agrupar los ejercicios de la rutina activa según `exerciseProgression(r.id, d.id, ei, ex)` + detección de estancamiento (3 semanas sin mejora de `estimatedStrength`):
       - `⬆️ Subir carga` (con el peso sugerido en kg)
       - `➡️ Mantener y sumar reps`
       - `⚠️ Revisar / Estancados`
       - `📝 Faltan datos (RIR/reps)`
2. **Check-in del Preparador al cerrar semana (`startNewWeek`, línea 3883):**
   - Al cerrar la semana y preparar la siguiente, mostrar un resumen claro de preparador físico con:
     - Cumplimiento de la semana cerrada (`%`).
     - Cambios automáticos del programa para la nueva semana (`seriesByWeek`, `repsByWeek`, `rirByWeek`, `weekPlan.focus`).
     - Ejercicios que tienen luz verde para subir kg en la semana que empieza.
     - Si se completó la última semana del bloque (`cycle.week === cycle.length`), sugerir evaluación de descarga/revisión o transición al programa del mes en `gymPlan1`.

## 3. Coach IA y Reporte de Sobrecarga (`buildGymProgressContext`, `coachPrompt`, `generarAnalisisSobrecargaIA`)
1. En `buildGymProgressContext()` (línea 1183):
   - Incluir el estado del **Plan de 3/6/12 meses (`gymPlan1`)** del mes actual y próximo.
   - Incluir resumen de **fatiga de las últimas sesiones (`gymHist`)**: RPE, energía `/5` y notas.
   - Incluir resumen de **volumen semanal por músculo (`computeWeeklyMuscleVolume`)** (`done/planned` series y estado).
2. En `coachPrompt()` (línea 6651) y `generarAnalisisSobrecargaIA()` (línea 7944):
   - Hacer que el Coach actúe como **Preparador Físico Profesional** en consultas de entrenamiento (usando formato `Lectura`, `Decisión`, `Próxima sesión`, `Qué registrar`).
   - En `generarAnalisisSobrecargaIA()`, pasar el contexto completo de `buildGymProgressContext(3200)`, volumen muscular semanal, sueño promedio 7d y plan de 3/6/12 meses.

## 4. Tres Fixes Rápidos Adicionales en `index.html`
1. `sendChat()` línea 6417: usar `(c.name||c.n||'')` en `cards1` para que los nombres de tarjetas no salgan como `"undefined"`.
2. `analizarGastos()` línea 4643: filtrar `!c.ahorro` en `catLines` e informar `totalAhorroMes(m,y)` por separado.
3. `sendChat()` línea 6411: incluir resumen detallado de `🐷 Ahorros` (`cats.filter(c=>c.ahorro&&!c.archived)`, saldos `ahorroAcumCat`, moneda y vencimientos de plazos fijos) en `dataCtx`.

---

## Respuesta de Claude: implementado (rama `gym/preparador-profesional`, sin commit)

126/126 tests (nuevo: `tests/gym-preparador.test.js`). Probado a 375 px con datos ficticios, sin errores en consola.

**Correcciones al diagnóstico:**
- `compareWeekRow` ya emparejaba por nombre. El emparejamiento por índice estaba solo en `openWeekDetail`. El problema real de los dos era comparar solo `pe.weight`.
- **Bug extra encontrado:** en la lista de semanas anteriores, cada tarjeta se comparaba contra la semana **más nueva** (`pastWeeks[wi-1]`), así que las flechas salían al revés. Además podía comparar contra otra rutina. Ahora usa la semana anterior de la misma rutina.
- Los campos `pfVencimiento`, `pfTasa` y `pfEstado` no existen: el plazo fijo usa `fechaVence`, `tasa` y `plazoFijoInfo(c)`.
- Subir kilos sin salir del rango (80×10 → 82,5×8 en 8-10) `compareSetToLast` lo da como "igual". En la comparación semanal ahora cuenta como progreso ("más peso, dentro del rango").

**Qué se hizo:**
1. `weekExerciseDiffs` + `weekBestSet`: emparejan por nombre en todos los días y usan la mejor serie. Si la serie 1 fue Bilbo, se compara aparte. Las semanas viejas sin reps comparan solo kg. Se usa en `compareWeekRow` y `openWeekDetail`.
2. `updateWeekLogFromCurrent`: `weight` = la mejor serie hecha, o `wts2` si no hay series.
3. `coachBoardHtml` en Semanas: plan del mes (con "Empezar" si la rutina activa es otra), semana del programa o del bloque, recuperación (`recoveryStatus`: energía, RPE de las sesiones de la semana y sueño de 7 días) y semáforo de sobrecarga (`overloadSummary`, con estancamiento de 3 semanas).
4. `finishGymSession` guarda `ts` y `weekId`, para medir la semana. Las sesiones viejas sin fecha no cuentan.
5. Check-in semanal en `startNewWeek` (`weeklyCheckinData` antes de borrar las series y `showWeeklyCheckin` después):
   - Adherencia y progreso contra la semana anterior.
   - Qué subir y qué revisar.
   - Foco y RIR de la semana nueva, y si el programa cambió series/reps/RIR.
   - Fin de bloque, con "Empezar programa del mes" o "Configurar el próximo bloque".
6. IA:
   - `gymCoachContextLines`: plan y recuperación arriba; sesiones y volumen al final, porque `buildAppContext` corta en 1800.
   - Coach con rol de preparador (Lectura / Decisión / Próxima sesión / Qué registrar).
   - "Revisar con IA" recibe `buildGymProgressContext(3200)` y devuelve el reporte con ese formato.
7. Fixes rápidos:
   - Nombres de tarjetas en los dos `dataCtx`.
   - `ahorrosContextText()` en el chat.
   - `analizarGastos` sin ahorros, con una línea aparte de lo guardado.

**Pendiente:** el aviso del plazo fijo en Agenda (de la entrega de Ahorros).
