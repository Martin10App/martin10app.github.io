# Gastos · auditoría y propuestas

**Para:** Martín · **Estado:** propuesta, sin código de Gastos hasta que elijas · **Rama:** `claude/zen-bohr-090uw3`

La app se recorrió a 375 px con datos de prueba **ficticios** pero realistas:
- 3 tarjetas: Visa, Mastercard y OCA.
- 10 compras. Hay de 1 pago y en cuotas (3, 6, 10 y 12), una que cruza el año (noviembre 2025 → octubre 2026) y algunas con cuotas ya pagadas.
- 11 categorías: 7 pagos fijos, 3 para gastos variables y una meta de ahorro con monto y fecha.
- 60 gastos variables repartidos en julio, agosto y septiembre de 2026.
- Sueldos cargados y pagos marcados en julio y agosto.

Cada error de abajo se reprodujo en el navegador con esos datos. Los pasos sirven para repetirlo.

---

## 1. Resumen en 30 segundos

- **La IA no puede anotar compras con tarjeta** (B2): la acción `compra` se rompe siempre. Entonces la IA, la voz o vos terminan anotándolas como gasto variable en la categoría de la tarjeta, y la compra se cuenta **dos veces** (B7).
- **La deuda de las tarjetas no baja sola** (B15): solo baja si tocás "Pagar 1" en cada compra, todos los meses.
- **Pagos dice "✅ Todo pagado"** aunque las tarjetas estén sin pagar (B1).
- **"Sumame 1.200 en la Visa" congela el total de la tarjeta de ese mes** (B3): las compras que agregues o borres después ya no cambian ese total.
- **Mes y cuándo se paga están mezclados:** la app pone cada compra en el mes en que la cargás. La fecha de la compra y el cierre de la tarjeta no cuentan (B4). Como pagás casi todo con crédito en 1 pago, eso define cómo tendría que funcionar la pantalla.
- La pantalla **Mes mide ~4,3 pantallas** (3.203 px) y tiene **62 controles de menos de 44 px**.

Propuesta recomendada: **B · Tarjetas por cierre**, con el orden visual de A. Ver la sección 5.

---

## 2. Recorrido por pestaña (375 px)

| Pestaña | Qué muestra | Problemas |
|---|---|---|
| **Mes** | Sueldo, "Gasto total" y "Disponible"; 4 cifras (Fijos, Variables, Tarjetas, Ahorro); proyección a fin de mes; objetivos de ahorro; comparación con el mes anterior y con el mismo mes del año pasado; distribución del sueldo; lista de compromisos con monto editable y ✓; lista de gastos variables; 3 botones | 3.203 px de alto. Las tarjetas aparecen dos veces (arriba y en Compromisos). En "Distribución del sueldo", "Ahorro" en realidad es lo que queda sin gastar (B9). Los montos editables se ven sin separador de miles (`12700`), y el resto con `$12.7k` o `$12.700`. |
| **Pagos** | Estado de pagos + pendientes + pagados | El total deja afuera tarjetas y ahorro, pero la lista los incluye (B1, B17). |
| **Anual** | Balance del año, comparación con el año anterior, meses, categorías | Las tarjetas muestran la **deuda de hoy** para los dos años, así que la comparación da siempre "→ 0" (B5). |
| **Comparar** | Dos meses lado a lado | Los meses para elegir arrancan en 2025, y no se pueden comparar datos viejos importados. |
| **Tarjetas** | Deuda total y cuota del mes por tarjeta | La deuda está inflada (B15). "Cuota del mes" ignora el monto editado a mano, mientras Mes lo usa (B12). |
| **Detalle de tarjeta** | Compras con barra de cuotas, "Pagar 1", ✕ | Dice "Total restante a futuro: **$2**", que es la cantidad de cuotas y no la plata (B16). |
| **+ Gasto** | Categoría, monto, descripción, mes, año y fecha | Deja elegir categorías de tarjeta y de ahorro (B7). Fecha y mes son campos separados y pueden no coincidir (B18). La pestaña no se ve a 375 px: hay que deslizar las pestañas. |
| **🛒 Súper** | Lista de compras | Sin problemas de datos (no es un gasto). |

---

## 3. Errores encontrados (con cómo reproducirlos)

Severidad: 🔴 cambia totales o pierde información · 🟠 confunde o muestra mal · 🟡 detalle.

| # | Sev. | Qué pasa | Cómo reproducirlo | Resultado medido |
|---|---|---|---|---|
| B1 | 🔴 | **Pagos dice "Todo pagado" con las tarjetas sin pagar.** El encabezado usa `totalCompromisosMes`, que deja afuera las tarjetas y el ahorro, pero la lista de pendientes los incluye. | Marcar pagados todos los fijos del mes y dejar las 3 tarjetas sin marcar. | Encabezado "✅ Todo pagado este mes" con 4 pendientes abajo. |
| B2 | 🔴 | **La IA no puede anotar una compra con tarjeta.** `compra` busca `c.n.toLowerCase()`, pero las tarjetas guardan el nombre en `name`. Si el id no coincide exacto, lanza un error. | Chat: "anotá 1.200 en la Visa, farmacia" → `{"op":"compra","n":"Visa Oro","v":1200}`. También con `cat:"card_…"`. | `Cannot read properties of undefined (reading 'toLowerCase')`. Si coincidiera, el mensaje diría "tarjeta undefined" y la fecha que dijiste se ignora. |
| B3 | 🔴 | **"Sumame X en la tarjeta" congela ese mes.** `ajustar_monto` guarda en `pf4` un total fijo (lo calculado + X). Después, `montoCat` usa ese valor fijo y no las compras. | Ajustar +1.200 la Visa en septiembre y después cargar una compra de 5.000 en septiembre. | Mes muestra 13.900; lo real es 17.700. |
| B4 | 🔴 | **La fecha de la compra no se usa.** `doSavePurch` y la acción `compra` calculan la primera cuota desde hoy. | Cargar una compra con fecha 15/07 y 0 cuotas pagadas. | Primera cuota: septiembre 2026. |
| B5 | 🟠 | **Anual compara tarjetas con la deuda de hoy.** `totalCatAnio` devuelve la deuda pendiente para cualquier año. | Anual 2026 vs 2025, fila Visa. | 48.700 en los dos años (lo cobrado en 2026 fue 45.700). |
| B6 | 🟠 | **El ahorro solo suma los meses editados.** `ahorroAcumCat` suma las claves de `pf4`, pero el aporte de cada mes sale de la base si no lo editaste. | Meta con base 1.500/mes, sin editar septiembre. | Mes muestra "1.500/mes", pero el acumulado no lo suma. |
| B7 | 🔴 | **Una compra con tarjeta puede contarse dos veces.** "+ Gasto" (y la IA y la voz) deja anotar un gasto variable en la categoría de una tarjeta, que se suma a sus cuotas. | Anotar "Supermercado 4.200" en la categoría Visa (esa compra ya estaba en la tarjeta). La IA resuelve "la Visa" como categoría. | El gasto del mes pasa de 89.381 a 93.581. |
| B9 | 🟡 | "Distribución del sueldo" llama "Ahorro" al resto, que es ahorro + disponible. | Mes con sueldo cargado. | Etiqueta engañosa. |
| B12 | 🟠 | **Dos cifras distintas para la misma tarjeta.** Mes usa el monto editado; Tarjetas usa las cuotas. | Editar a mano el monto de la Visa en septiembre a 15.000. | Mes 15.000; Tarjetas 12.700. |
| B14 | 🔴 | **Borrar una tarjeta cambia el pasado.** Al borrarla, desaparece su categoría y con ella lo que pagaste en meses anteriores. | Borrar la Mastercard y mirar agosto. | Agosto baja de 80.609 a 76.309. |
| B15 | 🔴 | **La deuda no baja con los meses.** `getCardDebt` usa `paidInstallments`, que solo sube con "Pagar 1" por compra. Marcar pagada la tarjeta del mes no toca las compras. | Compra en 6 cuotas desde junio, con 2 marcadas; ya vencieron 4. | Deuda contada 12.000; real 6.000. |
| B16 | 🟠 | "Total restante a futuro: **$2**" muestra la cantidad de cuotas como plata. | Detalle de cualquier tarjeta con cuotas. | `$2`, `$1`, `$1`… |
| B17 | 🟡 | La meta de ahorro aparece en Pagos como "pago pendiente". | Pagos con una meta de ahorro que tenga aporte mensual. | "AHORRO AUTO NUEVO · MARCAR PAGO". |
| B18 | 🟡 | Fecha y mes del gasto no coinciden. | "+ Gasto" con Mes = septiembre y Fecha = 05/03. | Se guarda en septiembre con fecha "05/03". |
| B19 | 🟠 | **Compras viejas corridas un mes.** La migración de compras sin `startM` usa `addedM − (pagadas − 1)`; las nuevas usan `mes − pagadas`. | Compra de 6 cuotas con 2 pagadas: cargada antes vs después de la migración. | En septiembre: cuota 2/6 vs 3/6. |
| B20 | 🟡 | La proyección de fin de mes se dispara al principio del mes: es lineal. | Día 2 con 5.000 en variables. | Proyecta 75.000. |
| B21 | 🟡 | Latente: los botones de editar y borrar gastos variables pasan `_id` sin comillas. Hoy todos los ids son números; uno de texto (datos viejos o importados) rompería esos botones. | — | Sin efecto hoy. |

**Lo que está bien:**
- `parseMoney` entiende `1.250`, `1.250,50`, `1,250.50`, `12,5`, `$ 3.400` y `1.234.567`. Solo ignora la moneda: "USD 40" se toma como 40 pesos.
- Las cuotas que cruzan el año se calculan bien (noviembre 2025 = 1/12 → octubre 2026 = 12/12).
- `gasto`, `editar_gasto`, `ingreso`, `pago`, `ahorro` y las metas funcionan y tienen pruebas.

### Qué anota hoy la IA (acciones)

| Acción | Estado |
|---|---|
| `gasto` | ✓ funciona, pero puede elegir la categoría de una tarjeta (B7) |
| `compra` (tarjeta) | ✗ se rompe (B2) |
| `ajustar_monto` | ⚠ congela las tarjetas (B3); en pagos fijos está bien |
| `fijo` | ✓ pone el monto del mes; en tarjetas tiene el mismo efecto que B3 |
| `pago`, `ingreso`, `ahorro`, `crear_meta`, `actualizar_meta`, `editar_gasto` | ✓ |

---

## 4. Cuánto cuesta hoy lo más común

| Tarea | Hoy | Con A | Con B |
|---|---|---|---|
| **Anotar una compra con tarjeta en 1 pago** | 7 toques y 2 campos: Gastos → Tarjetas → tarjeta → "+ Manual" → comercio → monto → Guardar → cerrar. Queda en el mes actual aunque la pagues el que viene. Por voz o chat se anota como gasto y se duplica (B2/B7). | 4: Gastos → **Anotar** → "Tarjeta" → monto y Guardar | 4, y cae en el resumen que corresponde por el cierre |
| **Ver cuánto va del mes** | 1 toque, pero "Gasto total" mezcla fijos + cuotas + variables, y la proyección exagera al principio del mes | 1: **Consumido / Por pagar / Disponible** | 1, con consumo por fecha real |
| **Ver qué falta pagar** | 2 toques (Gastos → Pagos). El total deja afuera las tarjetas (B1). | 1: sección **Por pagar** arriba en Mes | 1, con el resumen de cada tarjeta y su vencimiento |
| **Anotar un gasto en efectivo** | 3 toques + monto, deslizando las pestañas para encontrar "+ Gasto" | 3 | 3 |

---

## 5. Tres formas de organizarlo

_Las maquetas son de 375 px y las cifras son de ejemplo._

Todas son compatibles con `gst4`, `pf4`, `pe4`, `sld4`, `cats4`, `cards1` y `cpurch1`: ninguna borra ni cambia el formato de lo que ya tenés. Si hace falta algo nuevo, se agrega como campo opcional o clave nueva, con migración que no borra lo viejo.

### A · Ordenar y arreglar (sin tocar el modelo)

```
┌─────────────────────────────────────┐
│ ‹  Septiembre 2026  ›               │
│ ┌─────────┬──────────┬────────────┐ │
│ │Gastado  │Por pagar │Disponible  │ │
│ │ $89.381 │ $41.290  │  $10.619   │ │
│ └─────────┴──────────┴────────────┘ │
│ POR PAGAR (7)              ver todo │
│ ● Alquiler      22.000   [ Pagar ]  │
│ 💳 Visa Oro     12.700   [ Pagar ]  │
│ ● UTE            3.200   [ Pagar ]  │
│ ÚLTIMOS GASTOS             ver todo │
│ Hoy  Disco            1.320         │
│ Ayer Ancap            2.100         │
│ ▸ Objetivos  ▸ Comparaciones        │
│ [       ＋ Anotar un gasto        ] │
└─────────────────────────────────────┘
  Anotar → [Efectivo/débito | Tarjeta]
```

- Arregla B1–B21. Pagos queda dentro de Mes como "Por pagar", con tarjetas incluidas y sin el ahorro.
- Objetivos y comparaciones van en secciones plegables. Mes baja a ~1,5 pantallas y todo queda de 44 px.
- **Anotar** es una sola hoja con el medio de pago. "Tarjeta" escribe en `cpurch1` (1 pago por defecto) y nunca en una categoría de tarjeta (B7).
- La IA: `compra` arreglada, y "sumame X en la tarjeta" pasa a crear una compra en vez de congelar el mes (B3).
- **Claves:** ninguna nueva. Escribe en `gst4`, `cpurch1`, `pf4` y `pe4` como hoy.
- **A favor:** poco riesgo, rápido, se prueba por partes.
- **En contra:** la tarjeta sigue siendo "mes calendario". No responde "¿cuándo lo pago?".

### B · Tarjetas por cierre (recomendada)

```
┌─────────────────────────────────────┐
│ ‹  Septiembre 2026  ›               │
│ CONSUMISTE           PAGÁS ESTE MES │
│ $61.245              $78.100        │
│ efectivo + tarjetas  fijos + resúm. │
│─────────────────────────────────────│
│ RESÚMENES DE TARJETA                │
│ 💳 Visa Oro  cierra 22 · vence 5/10 │
│    $17.700  (8 compras)  [ Pagar ]  │
│ 💳 OCA       cierra 25 · vence 8/10 │
│    $8.490              ✓ pagado     │
│ FIJOS                     3 de 7 ✓  │
│ ● Alquiler 22.000 [Pagar] ● UTE ✓   │
│ [       ＋ Anotar un gasto        ] │
└─────────────────────────────────────┘
```

- Cada tarjeta tiene, opcionalmente, **día de cierre** y **día de vencimiento** (se cargan una vez).
- Con la fecha de la compra, la app sabe en qué resumen cae: si es después del cierre, va al del mes siguiente. Las cuotas arrancan ahí (arregla B4).
- Mes separa **lo que consumiste** (por fecha real) de **lo que pagás este mes** (fijos + resúmenes que vencen). Contesta "cuánto va del mes" y "qué falta pagar" sin mezclar.
- **Pagar el resumen** marca como pagadas las cuotas de ese resumen, así la deuda baja sola (B15). Desmarcarlo lo revierte.
- "Sumame 1.200 en la Visa en agosto" es una compra de 1 pago en ese resumen, no un total congelado (B3).
- Incluye todo lo de A (arreglos, "Por pagar", "Anotar", 44 px).
- **Claves:**
  - `cards1`: `cierre` y `vence` opcionales.
  - `cpurch1`: las compras nuevas guardan la fecha como `AAAA-MM-DD` y siguen guardando `startM`/`startY`, así el resto de la app no cambia.
  - `pe4`: el pago del resumen se marca como hoy. `pf4` sigue para editar a mano, con "volver al cálculo".
- **Migración:** no hace falta. Una tarjeta sin cierre funciona como hoy. B19 se corrige solo para compras viejas, con aviso.
- **A favor:** refleja cómo pagás (crédito en 1 pago); la deuda y los totales quedan bien solos; la IA tiene una sola forma de anotar compras.
- **En contra:** más lógica que A, y hay que cargar 2 datos por tarjeta.

### C · Libro único de movimientos

```
┌─────────────────────────────────────┐
│ Todos · Efectivo · Visa · OCA · MC  │
│ HOY                        -$3.420  │
│  Disco         Súper   💳Visa 1.320 │
│  Ancap         Nafta   💵     2.100 │
│ AYER                       -$1.790  │
│  Farmacia      Salud   💳OCA  1.790 │
│ …                                   │
│ [       ＋ Anotar un gasto        ] │
└─────────────────────────────────────┘
```

- Una clave nueva (`mov1`) con cada movimiento: fecha, monto, medio (efectivo, débito o tarjeta), cuotas, categoría y descripción. Las pantallas actuales se calculan desde ahí.
- **Claves:** `mov1` nueva. Para no romper respaldos ni código viejo, habría que seguir escribiendo `gst4` y `cpurch1` en paralelo (o migrar con marcha atrás).
- **A favor:** el modelo más limpio, con filtros por medio de pago y la mejor base para análisis e IA.
- **En contra:** la migración más grande y riesgosa, con más trabajo y mantener dos formatos durante un tiempo.

**Recomendación:** B, en 3 entregas que se prueban por separado:
1. Arreglos sin cambiar el modelo: B1, B2, B5, B7, B9, B12, B14, B16, B17, B18 y B21.
2. Mes nuevo con "Por pagar", "Anotar" y 44 px.
3. Cierre y vencimiento de tarjetas, pago del resumen que baja la deuda, y ajustes como compras (B3, B4, B15, B19).

---

## 6. Qué se puede arreglar ya, elijas lo que elijas

B1, B2, B5, B9, B12, B14 (mantener la categoría de una tarjeta borrada como "archivada" para que el pasado no cambie), B16, B17, B18, B20 (proyección con el ritmo de los 3 meses anteriores en vez de lineal) y B21. Son cambios chicos, con prueba cada uno, y no tocan el formato de ninguna clave.

## 7. Pendiente

- La sesión de la PC va a analizar tu respaldo real **sin sacarlo de la PC** y pasar solo hallazgos anonimizados: tipos de error, cantidades y patrones, sin montos ni nombres. Esos hallazgos van a ajustar la prioridad de los arreglos.
- Para B hacen falta el día de cierre y de vencimiento de cada tarjeta que uses.
