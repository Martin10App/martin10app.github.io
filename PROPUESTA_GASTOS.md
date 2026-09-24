# Gastos · auditoría y propuestas

**Para:** Martín · **Estado:** propuesta, sin código de pantallas de Gastos hasta que elijas · **Rama:** `claude/zen-bohr-090uw3`

Tiene dos fuentes:
1. **Recorrido a 375 px con datos de prueba ficticios:**
   - 3 tarjetas y 10 compras en cuotas, una que cruza el año.
   - 11 categorías, con una meta de ahorro.
   - 60 gastos variables entre julio y septiembre de 2026.
   - Sueldos y pagos marcados.
   - Cada error de abajo se reprodujo en el navegador.
2. **Tu respaldo real, analizado en tu PC sin sacarlo de ahí:** solo se pasaron conteos y patrones, nunca montos ni nombres. Cambia las prioridades: ver la sección 2.

---

## 1. Resumen en 30 segundos

- **Usás Gastos como planilla de compromisos mensuales:** cada mes, cuánto hay que pagar de cada cosa y si ya está pagado, contra el sueldo, con meses futuros planificados. No la usás como registro diario: no hay gastos variables ni compras en cuotas cargadas. La propuesta se ordena para **ese** uso.
- **Se perdió de vista tu historial de 2025:** ~190 montos están en categorías que ya no existen (se borraron y se recrearon con ids nuevos en enero de 2026). Anual y Comparar no ven 2025. Se puede recuperar sin perder nada con la herramienta **Vincular historial** (sección 6).
- **Dos errores que rompen una planilla:**
  - B22: cambiar el monto base de una categoría reescribe meses pasados ya pagados.
  - B23: borrar una categoría deja su historial huérfano. Así se perdió lo de 2025.
- **Pagos dice "Todo pagado" aunque falte una tarjeta o el ahorro** (B1).
- **Recomendación:** A · Planilla de compromisos (sección 5), en 3 entregas. Las tarjetas por cierre (B) quedan para más adelante, si empezás a usar cuotas.

---

## 2. Tu uso real (respaldo anonimizado)

| Dato | Qué dice |
|---|---|
| Respaldo | 1,2 MB, 42 claves, formato v2 correcto; exportado con la APK 5 (funciona) |
| `pf4` (montos por mes) | 260 montos, desde enero de 2025 hasta marzo de 2027 (meses futuros planificados) |
| Montos huérfanos | ~190 de esos 260 están en **15 ids de categoría que ya no existen**. Entre enero y junio de 2026 hay meses con monto en el id viejo **y** en el nuevo para la misma categoría. |
| `pe4` (pagado) | 46 marcas de "pagado" sin monto en `pf4`: se pagó con el monto base. Es válido, pero ver B22. |
| `gst4` (gastos variables) | 0 |
| `cpurch1` (compras en cuotas) | 0. Hay 2 tarjetas sin compras: el monto de la tarjeta se carga a mano cada mes. |
| `cats4` | 20 categorías; 10 sin ningún pago (3 de ellas de ahorro) |
| `sld4` (sueldo) | Cargado en 3 meses |
| Claves de IA | 5 claves viajaban en el respaldo. **Ya corregido en T0c:** ahora salen solo si tildás "Incluir claves de IA". |

**Conclusión:** lo que más importa es ver el mes, qué falta pagar, el total del mes contra el sueldo, planificar los meses que vienen y el histórico anual. Los gastos variables y las cuotas son secundarios.

---

## 3. Errores encontrados

Severidad: 🔴 cambia totales o pierde información · 🟠 confunde o muestra mal · 🟡 detalle. **Para vos** indica si pega en tu uso real.

| # | Sev. | Para vos | Qué pasa | Cómo reproducirlo | Resultado medido |
|---|---|---|---|---|---|
| **B22** | 🔴 | **Sí** | **Cambiar el monto base reescribe meses pasados.** Un mes marcado pagado sin monto propio en `pf4` toma la base de hoy. | Agua con base 900, julio marcado pagado sin editar. Cambiar la base a 1.400. | Julio pasa de 900 a 1.400 aunque pagaste 900. Tenés 46 meses así. |
| **B23** | 🔴 | **Sí** | **Borrar una categoría deja su historial huérfano.** `delCat` quita la categoría pero sus montos quedan en `pf4`/`pe4` con un id que nadie muestra. | Borrar "Luz" (con julio y agosto cargados) y mirar agosto. | Agosto baja de 81.109 a 77.659; `luz_6_2026` y `luz_7_2026` siguen en `pf4` sin categoría. Así se perdió 2025. |
| B1 | 🔴 | **Sí** | **Pagos dice "Todo pagado" con tarjetas sin pagar.** El encabezado deja afuera tarjetas y ahorro; la lista los incluye. | Marcar pagados los fijos y dejar las tarjetas sin marcar. | "✅ Todo pagado" con 4 pendientes abajo. |
| B14 | 🔴 | Sí | Borrar una tarjeta cambia los meses pasados (su categoría desaparece). | Borrar una tarjeta y mirar el mes anterior. | Agosto baja de 80.609 a 76.309. |
| B17 | 🟡 | Sí | Las metas de ahorro aparecen en Pagos como "pago pendiente". | Pagos con una meta con aporte mensual. | "AHORRO … · MARCAR PAGO". |
| B6 | 🟠 | Sí | El ahorro acumulado solo suma los meses editados; los que usan la base no cuentan. | Meta con base 1.500/mes, sin editar el mes. | Mes muestra "1.500/mes", pero el acumulado no lo suma. |
| B9 | 🟡 | Sí | "Distribución del sueldo" llama "Ahorro" a lo que queda sin gastar (ahorro + disponible). | Mes con sueldo cargado. | Etiqueta engañosa. |
| B12 | 🟠 | Sí | La misma tarjeta muestra dos cifras: Mes usa el monto cargado y Tarjetas las cuotas (que para vos son 0). | Monto de tarjeta cargado a mano. | Mes 15.000, Tarjetas "cuota del mes" 0 o distinta. |
| B20 | 🟡 | Poco | La proyección de fin de mes se dispara al principio del mes (es lineal). | Día 2 con 5.000 en variables. | Proyecta 75.000. |
| B2 | 🔴 | Hoy no | La acción de IA `compra` se rompe siempre: busca `c.n` y las tarjetas usan `name`. | "Anotá 1.200 en la Visa" en el chat. | `TypeError … toLowerCase`. |
| B3 | 🟠 | Hoy no | "Sumame X en la tarjeta" congela el total: para vos es lo esperado (cargás el resumen a mano); con cuotas congelaría las compras. | Ajuste + compra posterior en el mismo mes. | 13.900 en vez de 17.700. |
| B4 | 🔴 | Hoy no | La fecha de la compra no se usa: la primera cuota sale de "hoy". | Compra con fecha 15/07 y 0 pagadas. | Primera cuota: septiembre. |
| B5 | 🟠 | Hoy no | Anual compara las tarjetas con la deuda de hoy. | Anual, fila de tarjeta. | La misma cifra en los dos años. |
| B7 | 🔴 | Hoy no | Un gasto variable en la categoría de una tarjeta se suma a sus cuotas (se duplica). | "+ Gasto" en la categoría Visa. | 89.381 → 93.581. |
| B15 | 🔴 | Hoy no | La deuda de las tarjetas no baja con los meses. | 6 cuotas desde junio, con 2 marcadas. | Deuda 12.000 contra 6.000 real. |
| B16 | 🟠 | Hoy no | "Total restante a futuro: **$2**" muestra la cantidad de cuotas como plata. | Detalle de tarjeta con cuotas. | `$2`, `$1`… |
| B18 | 🟡 | Hoy no | La fecha y el mes del gasto no coinciden. | Mes = septiembre, Fecha = 05/03. | Se guarda así. |
| B19 | 🟠 | Hoy no | Las compras migradas quedan corridas un mes. | 6 cuotas con 2 pagadas, antes y después de la migración. | Cuota 2/6 contra 3/6. |
| B21 | 🟡 | No | Latente: `_id` sin comillas en los botones de gastos variables. | — | Sin efecto hoy. |

**Lo que está bien:** `parseMoney` (entiende `1.250`, `1.250,50`, `12,5`, `$ 3.400`), las cuotas que cruzan el año y las acciones de IA `fijo`, `pago`, `ingreso`, `ahorro`, metas y `editar_gasto`.

---

## 4. Cuánto cuesta hoy lo que más hacés

| Tarea | Hoy | Con A |
|---|---|---|
| **Ver qué falta pagar este mes** | 2 toques (Gastos → Pagos), y el total deja afuera tarjetas y ahorro (B1) | **0**: es lo primero que ves en Gastos |
| **Marcar algo como pagado** | 2–3 toques; el círculo ○ es chico, de 33 px | 1 toque en un botón de 44 px; guarda el monto pagado (arregla B22) |
| **Cargar el monto de la tarjeta de este mes** | Mes → deslizar hasta la fila → tocar el número → escribir (el campo mide 30 px) | Tocar la fila → teclado numérico grande → listo |
| **Planificar un monto para los próximos meses** | Mes por mes: avanzar el mes → buscar la fila → escribir, 12 veces para un año | "Repetir hasta…" en la fila, o la grilla de 12 meses |
| **Ver el año** | Anual (sin 2025, por los huérfanos) | Tabla anual por categoría, con 2025 recuperado |

---

## 5. Formas de organizarlo

_Las maquetas son de 375 px y las cifras son de ejemplo._ Todas son compatibles con `gst4`, `pf4`, `pe4`, `sld4`, `cats4`, `cards1` y `cpurch1`: nada se borra ni cambia de formato.

### A · Planilla de compromisos (recomendada)

```
┌─────────────────────────────────────┐
│ ‹  Septiembre 2026  ›               │
│ ┌─────────┬──────────┬────────────┐ │
│ │Este mes │Falta     │Te queda    │ │
│ │ $96.400 │ $38.700  │  $5.100    │ │
│ └─────────┴──────────┴────────────┘ │
│ ████████████████░░░░  60% pagado    │
│ FALTA PAGAR (5)                     │
│ ● Alquiler     22.000   [ Pagar ]   │
│ 💳 Tarjeta A   12.700   [ Pagar ]   │
│ ● Luz           3.200   [ Pagar ]   │
│ PAGADO (8)                   ver ▾  │
│ AHORRO              1.500 este mes  │
│ ▸ Planificar próximos meses         │
└─────────────────────────────────────┘
 Tocar una fila → monto, "repetir
 hasta…", nota, pagado con fecha
```

- **Mes = la planilla.** Arriba: total del mes, lo que falta y lo que te queda del sueldo. Después, "Falta pagar" (tarjetas incluidas, sin el ahorro) y "Pagado" plegado. Pagos se integra acá (arregla B1 y B17).
- **Pagar guarda el monto** en `pf4` si no tenía uno propio. Así cambiar la base nunca reescribe el pasado (B22). La base cambia solo desde el mes actual en adelante, con aviso.
- **Tocar una fila** abre una hoja con el monto, "repetir este monto hasta…" (llena meses futuros sin pisar los que ya tienen monto), una nota y "pagado el día…". Todo de 44 px.
- **Planificar próximos meses:** una grilla de 12 meses por categoría para ver y cargar lo que viene (hoy tenés montos hasta marzo de 2027).
- **Categorías:** en lugar de borrar, **archivar**. Se ocultan de la planilla, pero el historial sigue contando (arregla B23 y B14).
- **Anual:** tabla por categoría y mes, con total, promedio y comparación con el año anterior.
- **Ahorro:** una sección propia, sin pasar por Pagos, con el acumulado bien calculado (B6).
- **Claves:** ninguna nueva para la planilla. Archivar usa un campo opcional `archived` en `cats4`. Las notas y la fecha de pago irían en una clave nueva opcional (`pf4n`), si las querés.
- **A favor:** es exactamente lo que usás; poco riesgo; arregla B1, B6, B9, B12, B14, B17, B22 y B23.
- **En contra:** no agrega nada para cuotas ni gastos diarios (hoy no los usás).

### B · Tarjetas por cierre (más adelante, si empezás a usar cuotas)

Cada tarjeta con día de cierre y de vencimiento. La compra cae en el resumen que corresponde; pagar el resumen baja la deuda sola; "sumame X" crea una compra en vez de congelar el mes. Arregla B2–B5, B7, B15, B16, B18 y B19.
- **Claves:** `cierre` y `vence` opcionales en `cards1`; fecha ISO en las compras nuevas de `cpurch1`.
- **Hoy tiene poco valor:** no cargás compras en cuotas.

### C · Libro único de movimientos

Una clave nueva `mov1` con cada movimiento (fecha, monto, medio de pago, cuotas y categoría), de la que se calculan todas las pantallas. Es el modelo más limpio, pero pide la migración más grande y mantener dos formatos durante un tiempo. **No se recomienda** para tu uso actual.

**Recomendación: A, en 3 entregas.**
1. Arreglos de datos:
   - "Vincular historial" (sección 6).
   - Pagar guarda el monto (B22).
   - Archivar en vez de borrar (B23 y B14).
   - Totales de Pagos (B1 y B17).
   - Acumulado de ahorro (B6).
2. Mes como planilla: "Falta pagar", "Pagado", hoja por fila con "repetir hasta…" y 44 px.
3. Planificar 12 meses y la tabla anual.

Los errores de cuotas (B2, B4, B15, B16 y B19) se pueden arreglar igual en la entrega 1, porque son chicos. Pero no son prioridad.

---

## 6. Vincular historial (arreglo de datos, sin esperar la elección)

- **Detectar:** busca en `pf4`/`pe4` los montos cuyo id de categoría no existe en `cats4`. Los agrupa por id, con cantidad de meses, rango (por ejemplo "ene 2025 – jun 2026") y total. No hay nombres ni ids escritos en el código: todo sale de tus datos.
- **Elegir, por grupo:**
  - "Unir a <categoría existente>".
  - "Crear categoría" con un nombre que escribís vos.
  - "Dejar como está".
- **Reglas al unir:**
  - Si el mes ya tiene monto en la categoría destino, **se conserva el actual**: lo viejo solo llena huecos.
  - La marca de pagado (`pe4`) viaja con su monto.
  - Se muestra cuántos meses se completan y cuántos se ignoran.
- **Seguridad:**
  - Vista previa antes de confirmar.
  - Si hoy no hiciste respaldo, primero se ofrece exportarlo.
  - No se borra nada hasta confirmar. Las claves viejas quedan hasta que confirmes "limpiar".
  - Se puede deshacer en la misma sesión.

---

## 7. Qué se puede arreglar ya, elijas lo que elijas

"Vincular historial", B22, B23/B14 (archivar), B1, B17, B6, B9 y B12, más los chicos de cuotas si querés: B2, B16 y B19. No cambian el formato de ninguna clave y cada uno lleva su prueba.
