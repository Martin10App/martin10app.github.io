# Ahorros · diagnóstico y propuesta

**Para:** Martín (y para revisar con Antigravity) · **Estado:** propuesta, sin código todavía · **Archivo:** `index.html` (Gastos)

Objetivo: que **un ahorro nunca se confunda con un gasto**, que puedas **ver tus ahorros en un lugar propio** y que todo lo que sea ahorro se vea **en verde**.

---

## 1. Cómo funciona hoy (y por qué se entrevera)

Hoy un ahorro **no es un movimiento propio**: es una *categoría de gasto* con la marca `ahorro:true` en `cats4`. Lo que "guardás" cada mes se anota en el mismo lugar que los gastos fijos (`pf4`, clave `idCategoria_mes_año`).

| # | Sev. | Qué pasa | Dónde |
|---|---|---|---|
| A1 | 🔴 | **"+ Gasto" deja elegir una categoría de ahorro.** Ese monto se guarda en `gst4`, se suma como **gasto variable** y **no** suma al ahorrado. Es la causa principal de la confusión. | `rNG` línea ~4944 (`cats.map` sin filtrar), `totalVariablesMes` |
| A2 | 🔴 | **El acumulado cuenta meses futuros.** `ahorroAcumCat` suma **todas** las claves de `pf4` de la meta, también las que planificaste para más adelante. Si planificaste hasta marzo de 2027, hoy ya te muestra esa plata como "ahorrada". | `ahorroAcumCat` ~4148 |
| A3 | 🔴 | **Si la meta no tiene `saldoInicial`, usa la `base` mensual como saldo inicial.** Una meta de 1.500/mes arranca con 1.500 "regalados". | `ahorroAcumCat`: `c.saldoInicial!==undefined?…:c.base` |
| A4 | 🟠 | **Los meses que usan el monto base no suman** al acumulado (solo cuentan los meses editados). Es el B6 de la propuesta anterior. | `ahorroAcumCat` |
| A5 | 🔴 | **"Ajustar saldo" (IA `set_saldo_ahorro`) borra todo el historial mensual de la meta** en `pf4`. Anual y Comparar pierden esos meses. | ~7058 |
| A6 | 🟠 | **No se puede sacar plata del ahorro.** No existe un "retiro", así que si usás ahorro para algo, el saldo queda mal o tenés que tocar el saldo inicial. | — |
| A7 | 🟠 | **Hay dos "ahorros" distintos con el mismo nombre:** el 🐷 de Mes (lo que guardaste, en violeta) y el "💚 Ahorro" de Anual, que en realidad es *sueldo − gastos* (lo que te sobró). En Anual se pinta de verde algo que no es ahorro. | `rAnual` ~4665, `rMes` |
| A8 | 🟡 | **"Distribución del sueldo"** junta "Disp./Ahorro" en una sola barra verde: no ves cuánto fue ahorro de verdad. | `rMes` ~4420 |
| A9 | 🟡 | **Colores:** el ahorro es violeta (`#A78BFA`) y lo verde es "Disponible". Justo al revés de lo que se espera. | `rMes`, `crear_meta` |
| A10 | 🟡 | **No hay pantalla de ahorros.** Las metas aparecen solo como una tarjeta dentro de Mes. | — |

**Lo que está bien y se mantiene:** las metas con objetivo, fecha y aporte planeado (`financialGoalPlan`), y las acciones de IA `crear_meta` y `actualizar_meta`.

---

## 2. La idea: separar "plan" de "lo que guardaste de verdad"

Dos conceptos, cada uno en su lugar:

| Concepto | Qué es | Dónde vive |
|---|---|---|
| **Plan** | Cuánto *pensás* guardar por mes en cada meta | `aportePlan` de la meta (ya existe) y, si querés planificar mes a mes, `pf4` como hasta ahora |
| **Movimiento** | Plata que **guardaste** o **sacaste** de verdad, con fecha | **clave nueva `ahr1`** |

```js
// ahr1: lista de movimientos de ahorro
{ id, meta: 'idCategoria', tipo: 'aporte' | 'retiro' | 'ajuste', v: 1500, fecha: '2026-11-09', m: 10, y: 2026, nota: '' }
```

- **Saldo de una meta** = `saldoInicial` + aportes − retiros ± ajustes. Solo movimientos con fecha hasta hoy. **Nunca** cuenta el plan.
- **Total ahorrado** = la suma de todas las metas.
- **"Ajustar saldo"** crea un movimiento `ajuste` por la diferencia: no borra nada (arregla A5).
- **Retiro** = movimiento `retiro` (arregla A6).
- `gst4`, `pf4`, `pe4`, `cats4` **no cambian de formato**. `ahr1` es una clave nueva y opcional, y entra en el respaldo.

### Migración (una sola vez, sin borrar nada)
- De cada meta, cada monto de `pf4` en un **mes pasado o el actual** pasa a ser un movimiento `aporte` en `ahr1`, fechado el día 1 de ese mes y marcado `origen:'pf4'`. Los meses **futuros** quedan en `pf4` como plan.
- `saldoInicial` se respeta. Si no existe, **queda en 0** (no se usa la base, arregla A3).
- Los gastos de `gst4` cargados en una categoría de ahorro (A1) **no se tocan solos**. Aparece un aviso: *"Tenés N gastos cargados en 'AHORRO'. ¿Pasarlos a ahorros?"*, con botón para convertirlos.
- Una bandera `ahr1_migrado_v1` evita que corra dos veces. Se prueba primero sobre un respaldo real antes de publicar.

---

## 3. Cómo se vería

### 3.1 Pestaña nueva en Gastos: **🐷 Ahorros** (en verde)

```
┌─────────────────────────────────────┐
│  TOTAL AHORRADO                     │
│  $ 148.500                  (verde) │
│  +6.000 este mes · +31.500 en 2026  │
│  [ + Guardar ]   [ − Sacar ]        │
├─────────────────────────────────────┤
│  MIS METAS                          │
│  Viaje        45.000 / 80.000  56%  │
│  ███████████░░░░░░░░  (verde)       │
│  Faltan 35.000 · 5.000/mes · ok     │
│  Fondo emergencia   103.500         │
├─────────────────────────────────────┤
│  ÚLTIMOS MOVIMIENTOS                │
│  09/11  + 3.000  Viaje       verde  │
│  02/11  + 3.000  Emergencia  verde  │
│  20/10  − 8.000  Viaje       gris   │
│  ver todo ▾                         │
├─────────────────────────────────────┤
│  ▸ Por mes (barras verdes del año)  │
└─────────────────────────────────────┘
```

- **Guardar / Sacar:** una hoja con el monto (teclado numérico grande), la meta (si hay una sola, se elige sola), la fecha (hoy) y una nota. Botones de 44 px.
- Tocar una meta abre su detalle: movimientos, gráfico de evolución y edición del objetivo.
- Tocar un movimiento permite editarlo o borrarlo.

### 3.2 En **Mes**
- La fila del resumen pasa a decir **"🐷 Guardaste $6.000"** en **verde**, y tocándola vas a Ahorros.
- El ahorro **no** entra en "Gasto total" (eso ya es así hoy) y queda **separado de "Disponible"**:
  `Cobré 120.000 → Gastos 96.400 · Ahorro 6.000 (verde) · Te queda 17.600 (azul)`.
- **"Distribución del sueldo"** con 5 colores: Fijos, Variables, Tarjetas, **Ahorro (verde)** y Te queda (gris/azul) (arregla A8).
- Si la meta tiene aporte planeado y este mes todavía no guardaste: una fila *"Ahorro planeado: 5.000 · [Guardar ahora]"*, que con un toque crea el aporte.

### 3.3 En **+ Gasto**
- Arriba, un selector **[ Gasto | Ahorro ]**.
- En "Gasto", la lista de categorías **no muestra** las metas de ahorro (arregla A1).
- En "Ahorro", el mismo formulario guarda un aporte en `ahr1`.

### 3.4 En **Anual** y **Comparar**
- "💚 Ahorro" pasa a **"Te sobró"** (azul o gris), y aparece una fila aparte **"🐷 Ahorrado"** en verde, con la suma real de aportes − retiros del año (arregla A7).

### 3.5 Colores (regla única)
| Color | Significa |
|---|---|
| **Verde** | Ahorro: plata tuya que guardaste |
| Azul | Disponible / te queda / te sobró |
| Dorado | Falta pagar |
| Rojo | Déficit o te pasaste |
| Violeta | Tarjetas |

Las metas nuevas se crean en verde; las existentes violetas se pasan a verde (es solo el color, no toca montos).

### 3.6 Chat IA
- `ahorro` → crea un movimiento `aporte` en `ahr1` (hoy suma en `pf4`).
- Nueva: `retiro_ahorro` ("saqué 8.000 del viaje").
- `set_saldo_ahorro` → crea un movimiento `ajuste` y **no borra** nada.
- El contexto que recibe la IA usa el saldo real, no el que incluye meses futuros.

### 3.7 Plazos fijos y otra plata guardada (pedido de Martín, 09/11)

Regla de Martín: **todo lo que diga "ahorro" es plata que se guarda.** Además quiere llevar control de plazos fijos u otra plata guardada.

Cada "cajón" de ahorro es una meta con un **tipo** (idea que también propuso Antigravity):

| Tipo | Ejemplo | Campos extra (opcionales) |
|---|---|---|
| `meta` | Viaje, auto | objetivo, fecha, aporte mensual (ya existen) |
| `reserva` | Fondo de emergencia, dólares en casa | moneda (`UYU`/`USD`) |
| `plazo_fijo` | Plazo fijo en el banco | banco, moneda, monto colocado, tasa anual %, fecha de inicio, **fecha de vencimiento**, renovación automática |

- En **🐷 Ahorros**: arriba el **total ahorrado** en verde. Abajo, tres bloques: **Metas**, **Plazos fijos** y **Otra plata guardada**, cada uno con su subtotal.
- **Por mes:** las barras verdes del año muestran cuánto guardaste cada mes, sumando todos los tipos.
- **Plazo fijo:** muestra los días que faltan para el vencimiento y el interés estimado (`monto × tasa × días / 365`, marcado como *estimado*). 7 días antes del vencimiento aparece un aviso en Agenda.
  - **Al vencer:** botón "Renovar", que crea un plazo nuevo con capital + interés real, o "Cobrar", que lo pasa a otra plata guardada.
- **Dólares:** el saldo en USD se muestra aparte. El total en pesos solo convierte si cargás una cotización a mano. No se inventa una cotización.
- **Claves:** `tipo` y los campos de plazo fijo van como campos opcionales en `cats4`; los movimientos van en `ahr1`, como el resto. Una meta sin `tipo` se toma como `meta`.

---

## 4. Entregas (para probar por partes)

1. **Arreglos de datos, sin pantallas nuevas:**
   - Sacar las metas de ahorro del selector de "+ Gasto" (A1).
   - El acumulado no cuenta meses futuros ni usa la base como saldo inicial (A2, A3).
   - `set_saldo_ahorro` deja de borrar el historial (A5).
   - Tests de caracterización antes de tocar.
2. **`ahr1` + migración + pestaña 🐷 Ahorros** con Guardar/Sacar, metas en verde y movimientos.
3. **Mes, Anual y Comparar:** separar "Ahorro" de "Te queda", la barra de 5 colores y "Te sobró" vs "Ahorrado".
4. **IA:** `aporte` y `retiro` sobre `ahr1`, y el aviso para convertir los gastos mal cargados.

---

## Estado de la entrega 1 (rama `gastos/ahorros-entrega-1`, sin commit)

Hecho, con tests nuevos en `tests/ahorros.test.js` (106/106 tests pasan):
- **A1:** "+ Gasto" ya no ofrece metas de ahorro ni categorías archivadas (`expenseCategories`). La IA rechaza un `gasto` dirigido a una meta y avisa que use `ahorro`.
- **A2:** el acumulado (`ahorroAcumCat`) suma solo hasta el mes actual. El cálculo por mes está en `ahorroHistorialCat(catId, now)`.
- **A5:** `set_saldo_ahorro` ya no borra `pf4`: ajusta `saldoInicial = pedido − historial hasta hoy`.
- **Palabra "ahorro" = plata guardada:**
  - En Mes, "💚 Disponible" pasa a **"💙 Te queda"** en azul, y "🐷 Ahorré" va en verde.
  - La distribución del sueldo tiene un segmento verde propio para **Ahorro**, y "Te queda" va aparte.
  - En Anual, "💚 Ahorro" (que era sueldo − gastos) pasa a **"💙 Te sobró"**, que ahora descuenta lo ahorrado, y aparece **"🐷 Ahorrado"** en verde.

**Respuesta a Antigravity sobre A3 (no lo apliqué):** quitar el uso de `c.base` cuando no hay `saldoInicial` puede **bajar en silencio** el saldo que Martín ve hoy en metas viejas. El modal siempre se llamó "Saldo inicial / base acumulada", así que esa `base` pudo haberse cargado como saldo. Propuesta: en la migración de la entrega 2, escribir `saldoInicial = base` explícito en las metas que no lo tengan (el número que se ve no cambia) y mostrarlo en la pantalla de la meta para que Martín lo confirme o lo corrija. Desde ahí, `base` deja de usarse como saldo.

**Pendiente conocido:**
- A4 (los meses que usan la base no suman al acumulado) se resuelve con `ahr1` en la entrega 2.
- Si `set_saldo_ahorro` pide menos que el historial, el saldo inicial queda negativo, y el modal de la meta no deja guardarlo así. Se resuelve con el movimiento `ajuste` de la entrega 2.

## Estado de la entrega 2 (misma rama, sin commit)

Hecho, con 115/115 tests pasando y probado en el navegador a 375 px con datos ficticios:
- **`ahr1` + migración:** se dispara cuando no existe `ahr1` (primera vez o un respaldo viejo importado). Los montos de `pf4` de meses pasados y del actual pasan a ser aportes; los futuros quedan como plan. Las metas viejas sin `saldoInicial` lo reciben igual a `base` (el número que se veía no cambia). `pf4` no se toca. `ahr1` está en `BACKUP_DATA_KEYS`.
- **Saldo** = `saldoInicial` + movimientos con fecha hasta hoy. **`totalAhorroMes`**: real hasta el mes actual, plan para los meses que vienen. Los totales en pesos no mezclan USD.
- **Pestaña 🐷 Ahorros (`xt-6`):**
  - Total en verde, con "+ este mes" y "+ en el año", y botones Guardar / Sacar.
  - Bloques Metas / Plazos fijos / Otra plata guardada con subtotales.
  - Barras "Ahorrado por mes" con navegación por año, últimos movimientos editables y "+ Nuevo ahorro".
  - Aviso para pasar a ahorros los gastos mal cargados en metas (A1 viejo).
- **Plazo fijo:** banco, tasa, desde y vence; interés estimado; aviso 7 días antes dentro de la pestaña; Renovar (interés como aporte + nuevas fechas) y Cobrar (pasa la plata a otro ahorro o la saca, y archiva).
- **Detalle de cada ahorro:** movimientos, Datos, Ajustar (con un movimiento `ajuste`, sin borrar nada) y Archivar.
- **Mes:**
  - La tarjeta "🐷 Mis ahorros" va en verde y lleva a la pestaña.
  - Una línea "planeaste X · guardaste Y este mes" con botón "+ Guardar".
  - "🐷 Ahorré" muestra lo real.
- **+ Gasto:** botón "🐷 ¿Guardaste plata? Anotala como ahorro".
- **IA:** `ahorro` y `retiro_ahorro` escriben en `ahr1`. `set_saldo_ahorro` usa `ajuste`. Si hay varios ahorros y no dijo cuál, pregunta. `crear_meta` acepta `tipo_ahorro` y `moneda`.

**Pendiente:**
- Aviso de vencimiento en **Agenda** (hoy solo aparece en la pestaña).
- Con varias pestañas, Pagos podría integrarse a Mes (idea de Antigravity).
- **Cambio de criterio:** un mes pasado cuya meta usaba solo la `base`, sin monto propio, ya no cuenta como ahorrado en el resumen de Mes. Antes sí contaba ahí, pero nunca contó en el acumulado.

### Revisión de Antigravity sobre la entrega 2 (aplicada)
- `ahorroAcumTotal` ya no suma ahorros archivados.
- `rAnual` (`catData`) y `rComparar` (`compData`) no incluyen metas de ahorro en el ranking de gastos.
- Configuración → "Compromisos fijos" no lista ahorros (muestra un aviso de que se manejan desde 🐷 Ahorros).
- Extra: `planAhorroMes` y el "/mes" de la tarjeta de Mes usan, en este orden, el monto propio del mes, `aportePlan` y la `base` vieja. Antes ignoraban `aportePlan`.

### Prueba con el respaldo real (24/09/2026, solo en la PC; acá van solo conteos)
- 42 claves, sin `ahr1` → la migración corre. Hay 3 ahorros y ninguno con montos por mes en `pf4` → 0 movimientos migrados.
- Los 3 saldos quedan iguales que antes. No hay saldos negativos ni gastos cargados dentro de ahorros.
- Uno tenía `base` mensual y no tenía `saldoInicial`: su saldo sale de la base, así que queda marcado `revisarSaldo` y la pestaña muestra "Confirmá cuánto tenés hoy".
- En 11 meses pasados de 2026, "🐷 Ahorré" pasa de mostrar la base a 0, porque no hay registro de que se haya guardado.
- Sin errores en consola. La copia de los datos se borró del navegador de prueba.

---

## 5. Para revisar con Antigravity

Preguntas concretas para que la segunda revisión no repita lo mismo:

1. **¿Está bien la regla de migración?** Pasado = aporte real, futuro = plan. ¿Hay algún caso en que un monto pasado de `pf4` sea solo plan y no un aporte real? (Para Martín: ¿los montos de meses pasados en la meta son plata que guardaste de verdad?)
2. **¿Hay otros lugares que lean `ahorroAcumCat`, `totalAhorroMes` o `c.ahorro`** y que haya que adaptar? Líneas conocidas: 4133–4214, 4278–4380, 4433, 4451, 4601, 5276–5297, 6188–6208, 6791–6856, 7027–7070, 8997.
3. **Respaldo:** confirmar que `ahr1` entra en la exportación y la importación (ver `tests/backup.test.js`) y que un respaldo viejo sin `ahr1` migra igual al importarlo.
4. **Multiusuario:** `ahr1` va con el prefijo del usuario (`S.g/S.s`), como el resto.
5. **Interfaz a 375 px:** que la pestaña nueva entre en la barra de pestañas de Gastos sin cortarse (hoy hay 7 pestañas). ¿Conviene unir "Pagos" dentro de "Mes" para hacerle lugar?
6. **Detectar más fallas:** recorrer Gastos con datos de prueba y buscar otros lugares donde ahorro y gasto se sumen juntos.
