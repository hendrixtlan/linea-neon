# Línea Neón 🔴⚫

Custom visualization para Looker: serie de datos con glow sobre fondo negro y línea de tendencia roja calculada por regresión lineal. Un solo archivo, sin dependencias externas (canvas puro).

## Características

- Colores de fondo, serie y tendencia configurables desde el panel *Edit* de la viz, sin tocar código
- Línea de tendencia por regresión lineal con efecto glow
- Ordena la dimensión de forma **ascendente por su cuenta** (ignora el sort del Look, que por defecto es descendente en fechas)
- Soporta pivots (usa el primer valor del pivot) y trata `null` como hueco, no como cero
- Errores visibles en el tile (`addError`) y log de diagnóstico en la consola del navegador

## Estructura del repositorio

```
linea-neon/
├── linea_neon.js   # la visualización completa
└── README.md
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

Cuando todo funcione, borra la línea del `console.log` de diagnóstico en `linea_neon.js`.


