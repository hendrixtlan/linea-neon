# Neón Viz 🔴⚫

Custom visualizations para Looker con estética neón sobre fondo negro. Incluye dos visualizaciones: **Línea Neón** (serie con glow y línea de tendencia roja por regresión lineal; canvas puro, sin dependencias) y **Pay Neón 3D** (pay en 3D con three.js: la rebanada se eleva y brilla al pasar el puntero).

## Características

- Colores de fondo, serie y tendencia configurables desde el panel *Edit* de la viz, sin tocar código
- Línea de tendencia por regresión lineal con efecto glow
- Ordena la dimensión de forma **ascendente por su cuenta** (ignora el sort del Look, que por defecto es descendente en fechas)
- Soporta pivots (usa el primer valor del pivot) y trata `null` como hueco, no como cero
- Errores visibles en el tile (`addError`) y log de diagnóstico en la consola del navegador

## Estructura del repositorio

```
linea-neon/
├── linea_neon.js     # línea con tendencia (canvas puro)
├── pay_neon_3d.js    # pay 3D interactivo (requiere three.js)
├── README.md
└── LICENSE
```

## Requisitos del query

La viz usa la **primera dimensión** (idealmente una fecha) y la **primera medida** del query. Si hay pivot, toma el primer valor del pivot. Los demás campos se ignoran.

## Instalación

Elige **una sola** de estas tres vías por `id` para evitar registros duplicados.

### Opción A — Archivo local en el proyecto LookML (recomendada)

El propio proyecto LookML hostea el archivo: sin CDN, sin problemas de caché ni de MIME.

1. En modo desarrollo, sube `linea_neon.js` a la raíz de tu proyecto LookML (arrástralo al IDE o añádelo por git).
2. En el `manifest.lkml` del proyecto (créalo si no existe; si es nuevo, incluye también tu `project_name`) añade:

```lookml
visualization: {
  id: "linea_neon"
  label: "Línea Neón"
  file: "linea_neon.js"
}
```

3. Commit y **Deploy to Production**. La viz aparece al final del selector de tipos de visualización, disponible en toda la instancia.

Para actualizarla después: editas el archivo, commit, deploy. Nada más.

### Opción B — Hosteada por URL en el manifest

Si prefieres servir el archivo desde este repositorio en GitHub:

```lookml
visualization: {
  id: "linea_neon"
  label: "Línea Neón"
  url: "https://cdn.jsdelivr.net/gh/TU_USUARIO/linea-neon@main/linea_neon.js"
}
```

Reglas del hosting:

- **Nunca uses `raw.githubusercontent.com`**: sirve el archivo como `text/plain` y el navegador bloquea el script (error "Refused to execute script… MIME type").
- jsDelivr cachea la rama `main` ~12 h. Para forzar una actualización, apunta a un commit concreto (`@a1b2c3d`) o purga la caché visitando `https://purge.jsdelivr.net/gh/TU_USUARIO/linea-neon@main/linea_neon.js`.
- Alternativa sin caché agresiva: GitHub Pages (`https://tu_usuario.github.io/linea-neon/linea_neon.js`), que sirve el MIME correcto.

### Opción C — Panel de administración (sin LookML)

**Admin > Platform > Visualizations > Add Visualization**:

| Campo | Valor |
|---|---|
| ID | `linea_neon` |
| Label | `Línea Neón` |
| Main | URL https del archivo (aplican las reglas de la Opción B) |
| Dependencies | vacío (no usa librerías) |
| SRI Hash | vacío (sobre todo mientras desarrollas) |

Tras guardar, recarga el Look con Ctrl+Shift+R.

## Opciones configurables

En el panel *Edit* de la visualización:

| Opción | Default | Descripción |
|---|---|---|
| Color de fondo | `#000000` | Fondo del tile |
| Color de la serie | `#ffffff` | Línea y puntos de datos |
| Color de la tendencia | `#ff0033` | Línea de regresión con glow |
| Mostrar puntos | activado | Puntos por dato (se omiten automáticamente con más de 200 filas) |

## Troubleshooting

- **Tile en blanco** → abre la consola del navegador (F12). Un 404 indica URL mal escrita; "Refused to execute script… MIME type" indica hosting inválido (ver Opción B); un SRI hash incorrecto en el registro también bloquea el script — bórralo. Tras cualquier cambio, recarga con Ctrl+Shift+R.
- **Solo se ve la línea roja** → revisa el log `[linea_neon]` en la consola: indica cuántas filas llegaron y cuántas son numéricas. Suele ser una medida llena de nulls o de valores constantes.
- **Cambié el código y no pasa nada** → caché. Cambia el `?v=` de la URL, purga jsDelivr, o migra a la Opción A y olvídate del tema.
- **Dimensión con nombres de mes ("Enero", "Febrero"…)** → el orden automático es numérico/alfabético, así que los nombres de mes quedarán en orden alfabético. Con dimensiones de fecha reales no hay problema: Looker entrega su `value` en formato ISO, que ordena correctamente.

- **"Falta three.js" en el tile (Pay Neón 3D)** → la dependencia no cargó: revisa la URL en `dependencies:` del manifest (o en el campo Dependencies del registro) y recarga con Ctrl+Shift+R.

Cuando todo funcione, borra la línea del `console.log` de diagnóstico de cada archivo `.js`.

## Pay Neón 3D 🥧

Pay 3D construido con three.js. Al pasar el puntero por una rebanada (o por su entrada en la leyenda) **la rebanada se eleva** y aumenta su glow; el tooltip muestra valor y porcentaje; puedes **arrastrar para girar** el pay; un clic sobre la rebanada abre el **menú de drill** de Looker si la medida tiene links.

### Registro

Requiere three.js como dependencia — Looker la carga antes que la viz:

```lookml
visualization: {
  id: "pay_neon_3d"
  label: "Pay Neón 3D"
  file: "pay_neon_3d.js"
  dependencies: ["https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"]
}
```

En la vía del panel de administración (Opción C), esa misma URL va en el campo **Dependencies**. Ambos bloques `visualization` (línea y pay) pueden convivir en el mismo `manifest.lkml`, cada uno con su `id`.

### Requisitos del query

Primera dimensión = categorías, primera medida = tamaño de la rebanada. Solo se grafican valores **positivos**; los `null` y negativos se descartan (queda constancia en el log `[pay_neon_3d]` de la consola). Si hay más categorías que el máximo configurado, las menores se agrupan en "Otros".

### Opciones configurables

| Opción | Default | Descripción |
|---|---|---|
| Color de fondo | `#000000` | Fondo de la escena |
| Elevación al pasar el puntero | `10` | Cuánto sube la rebanada (unidades de escena) |
| Máx. rebanadas | `12` | El resto se agrupa en "Otros" |
| Rotación automática | activado | Gira lento; se pausa mientras interactúas |
| Mostrar leyenda | activado | Leyenda interactiva: hover eleva la rebanada |

### Nota honesta sobre pays 3D

La perspectiva distorsiona: las rebanadas del fondo se ven más pequeñas de lo que son. Para lectura precisa está el tooltip y la leyenda con el porcentaje exacto (y siempre puedes girar el pay). Si algún día el dashboard exige precisión por encima de espectáculo, un pay o dona 2D comunica mejor.

## Licencia

MIT — ver [LICENSE](LICENSE).
