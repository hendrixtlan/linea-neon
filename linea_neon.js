/**
 * Línea Neón — Custom Visualization para Looker
 * ------------------------------------------------
 * - Fondo negro, serie de datos con glow, línea de tendencia roja (regresión lineal)
 * - Ordena por sí misma la dimensión de forma ascendente (ignora el sort del Look)
 * - Soporta pivots (usa el primer pivot) y trata nulls como huecos, no como ceros
 * - Colores configurables desde el panel Edit de la visualización
 * - Sin dependencias externas (canvas puro)
 *
 * Registro: Admin > Platform > Visualizations
 *   ID: linea_neon | Main: URL https de este archivo | SRI hash: vacío
 * Al actualizar el archivo, cambia el ?v= de la URL o purga el CDN.
 */

looker.plugins.visualizations.add({
  id: "linea_neon",
  label: "Línea Neón",

  options: {
    color_fondo: {
      type: "string", display: "color", label: "Color de fondo",
      default: "#000000", order: 1
    },
    color_serie: {
      type: "string", display: "color", label: "Color de la serie",
      default: "#ffffff", order: 2
    },
    color_tendencia: {
      type: "string", display: "color", label: "Color de la tendencia",
      default: "#ff0033", order: 3
    },
    mostrar_puntos: {
      type: "boolean", label: "Mostrar puntos", default: true, order: 4
    }
  },

  create: function (element) {
    element.style.height = "100%";
    element.innerHTML = "<canvas></canvas>";
    this._canvas = element.querySelector("canvas");
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();
    try {
      var dims = queryResponse.fields.dimensions;
      var meas = queryResponse.fields.measures;
      if (!dims.length || !meas.length) {
        this.addError({ title: "Faltan campos", message: "Necesito 1 dimensión y 1 medida." });
        return;
      }
      var dimName = dims[0].name;
      var measName = meas[0].name;

      var cFondo = (config && config.color_fondo) || "#000000";
      var cSerie = (config && config.color_serie) || "#ffffff";
      var cTrend = (config && config.color_tendencia) || "#ff0033";
      var conPuntos = !config || config.mostrar_puntos !== false;

      // --- Extracción robusta (con o sin pivot; null => hueco, no cero) ---
      var pivots = queryResponse.pivots;
      var getCell = (pivots && pivots.length)
        ? function (r) { return r[measName][pivots[0].key]; }
        : function (r) { return r[measName]; };

      var pts = data.map(function (r) {
        var cell = getCell(r) || {};
        var v = (cell.value == null) ? NaN : Number(cell.value);
        var d = r[dimName] || {};
        return { v: v, raw: d.value, label: d.rendered || d.value || "" };
      });

      // --- Orden ascendente por la dimensión, sin importar el sort del Look ---
      // (los `value` de fechas de Looker vienen en formato ISO, que ordena bien como texto)
      pts.sort(function (a, b) {
        var na = Number(a.raw), nb = Number(b.raw);
        if (isFinite(na) && isFinite(nb)) return na - nb;
        return String(a.raw).localeCompare(String(b.raw));
      });
      pts.forEach(function (p, i) { p.i = i; });

      var finite = pts.filter(function (p) { return isFinite(p.v); });

      // DIAGNÓSTICO: mira esto en la consola (F12); bórralo cuando todo funcione
      console.log("[linea_neon] filas:", data.length, "| numéricas:", finite.length, "| muestra:", finite.slice(0, 5));

      if (!finite.length) {
        this.addError({
          title: "Sin valores numéricos",
          message: "La medida '" + measName + "' no trae números. Revisa la consola."
        });
        return;
      }

      // --- Canvas nítido en pantallas retina ---
      var canvas = this._canvas;
      var w = element.clientWidth || 600, h = element.clientHeight || 400;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Fondo
      ctx.fillStyle = cFondo;
      ctx.fillRect(0, 0, w, h);

      // --- Escala (dominio centrado si los datos son planos) ---
      var min = Infinity, max = -Infinity;
      finite.forEach(function (p) {
        if (p.v < min) min = p.v;
        if (p.v > max) max = p.v;
      });
      if (min === max) { var delta = Math.abs(min) * 0.1 || 1; min -= delta; max += delta; }

      var padL = 56, padR = 24, padT = 24, padB = 36;
      var N = pts.length;
      var x = function (i) {
        return padL + (N > 1 ? (i / (N - 1)) * (w - padL - padR) : (w - padL - padR) / 2);
      };
      var y = function (v) {
        return h - padB - ((v - min) / (max - min)) * (h - padT - padB);
      };

      var fmt = function (v) {
        var a = Math.abs(v);
        if (a >= 1e9) return (v / 1e9).toFixed(1) + "B";
        if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
        if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
        return a >= 10 ? v.toFixed(0) : v.toFixed(2);
      };

      // --- Grid sutil + etiquetas del eje Y y extremos del eje X ---
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "11px sans-serif";
      ctx.lineWidth = 1;
      for (var t = 0; t <= 4; t++) {
        var val = min + (t / 4) * (max - min);
        var yy = y(val);
        ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
        ctx.fillText(fmt(val), 8, yy + 4);
      }
      ctx.fillText(String(pts[0].label), padL, h - 12);
      var lastLabel = String(pts[N - 1].label);
      ctx.fillText(lastLabel, w - padR - ctx.measureText(lastLabel).width, h - 12);

      // --- Tendencia (regresión lineal) con glow, DEBAJO de los datos ---
      if (finite.length > 1) {
        var n = finite.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
        finite.forEach(function (p) {
          sx += p.i; sy += p.v; sxy += p.i * p.v; sxx += p.i * p.i;
        });
        var den = n * sxx - sx * sx;
        var m = den ? (n * sxy - sx * sy) / den : 0;
        var b = (sy - m * sx) / n;
        var i0 = finite[0].i, i1 = finite[n - 1].i;
        ctx.beginPath();
        ctx.moveTo(x(i0), y(m * i0 + b));
        ctx.lineTo(x(i1), y(m * i1 + b));
        ctx.strokeStyle = cTrend;
        ctx.lineWidth = 3;
        ctx.shadowColor = cTrend;
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // --- Serie de datos ENCIMA, con cortes donde haya nulls ---
      ctx.beginPath();
      var started = false;
      pts.forEach(function (p) {
        if (!isFinite(p.v)) { started = false; return; }
        if (!started) { ctx.moveTo(x(p.i), y(p.v)); started = true; }
        else ctx.lineTo(x(p.i), y(p.v));
      });
      ctx.strokeStyle = cSerie;
      ctx.lineWidth = 2;
      ctx.shadowColor = cSerie;
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // --- Puntos por dato (para que nada "desaparezca") ---
      if (conPuntos && finite.length <= 200) {
        ctx.fillStyle = cSerie;
        finite.forEach(function (p) {
          ctx.beginPath();
          ctx.arc(x(p.i), y(p.v), finite.length === 1 ? 5 : 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      done();
    } catch (e) {
      this.addError({ title: "Error en la viz", message: String(e.message || e) });
    }
  }
});
