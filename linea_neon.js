/**
 * Línea Neón — Custom Visualization para Looker (v2, animada e interactiva)
 * -------------------------------------------------------------------------
 * - Animación de entrada: la serie se dibuja de izquierda a derecha y la
 *   tendencia aparece después (se reproduce al cargar y al refrescar datos)
 * - Interactiva: crosshair + tooltip con valor y Δ contra la tendencia al
 *   pasar el puntero; clic sobre un punto abre el menú de drill de Looker
 * - Pulso neón opcional en el glow de la línea de tendencia
 * - Ordena la dimensión de forma ascendente por su cuenta (ignora el sort
 *   del Look); soporta pivots (primer pivot); null => hueco, no cero
 * - Sin dependencias externas (canvas puro)
 *
 * Registro: bloque visualization en manifest.lkml (ver README) o
 * Admin > Platform > Visualizations con SRI hash vacío.
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
    },
    animar_entrada: {
      type: "boolean", label: "Animación de entrada", default: true, order: 5
    },
    pulso_tendencia: {
      type: "boolean", label: "Pulso neón en la tendencia", default: true, order: 6
    }
  },

  create: function (element) {
    element.style.height = "100%";
    element.style.position = "relative";
    element.style.overflow = "hidden";
    element.innerHTML = "";

    var canvas = document.createElement("canvas");
    canvas.style.display = "block";
    element.appendChild(canvas);
    this._el = element;
    this._canvas = canvas;

    var tooltip = document.createElement("div");
    tooltip.style.cssText =
      "position:absolute;display:none;pointer-events:none;z-index:5;" +
      "background:rgba(10,10,14,.92);color:#fff;padding:6px 9px;border-radius:6px;" +
      "font:12px sans-serif;white-space:nowrap;";
    element.appendChild(tooltip);
    this._tooltip = tooltip;

    this._state = null;
    this._pending = false;
    var self = this;

    canvas.addEventListener("pointermove", function (e) {
      var st = self._state;
      if (!st || !st.x || !st.finite.length) return;
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;

      // punto finito más cercano en pixeles (a prueba de huecos por nulls)
      var best = -1, bestD = Infinity;
      for (var k = 0; k < st.finite.length; k++) {
        var d = Math.abs(st.x(st.finite[k].i) - mx);
        if (d < bestD) { bestD = d; best = k; }
      }
      st.hover = (bestD <= 40) ? best : -1;

      if (st.hover >= 0) {
        var p = st.finite[st.hover];
        var html = "<b>" + p.label + "</b><br>" + st.fmt(p.v);
        if (st.finite.length > 1) {
          var delta = p.v - (st.m * p.i + st.b);
          html += "<br><span style='opacity:.75'>Δ tendencia: " +
                  (delta >= 0 ? "+" : "-") + st.fmt(Math.abs(delta)) + "</span>";
        }
        tooltip.innerHTML = html;
        tooltip.style.border = "1px solid " + st.cTrend;
        tooltip.style.boxShadow = "0 0 12px " + st.cTrend + "66";
        tooltip.style.left = Math.min(mx + 14, rect.width - 150) + "px";
        tooltip.style.top = (e.clientY - rect.top + 14) + "px";
        tooltip.style.display = "block";
        canvas.style.cursor = (p.links && p.links.length) ? "pointer" : "default";
      } else {
        tooltip.style.display = "none";
        canvas.style.cursor = "default";
      }
      self._requestDraw();
    });

    canvas.addEventListener("pointerleave", function () {
      var st = self._state;
      if (!st) return;
      st.hover = -1;
      tooltip.style.display = "none";
      canvas.style.cursor = "default";
      self._requestDraw();
    });

    canvas.addEventListener("click", function (e) {
      var st = self._state;
      if (!st || st.hover < 0) return;
      var p = st.finite[st.hover];
      if (p.links && p.links.length && typeof LookerCharts !== "undefined") {
        LookerCharts.Utils.openDrillMenu({ links: p.links, event: e });
      }
    });
  },

  _requestDraw: function () {
    if (this._pending) return;
    this._pending = true;
    var self = this;
    requestAnimationFrame(function (now) {
      self._pending = false;
      self._draw(now);
    });
  },

  _draw: function (now) {
    var st = this._state;
    if (!st) return;
    var element = this._el, canvas = this._canvas;
    var w = element.clientWidth || 600, h = element.clientHeight || 400;
    var dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // progreso de la animación de entrada (easeOutCubic)
    var p = 1;
    if (st.opts.animar) {
      var raw = Math.min(1, (now - st.animStart) / 950);
      p = 1 - Math.pow(1 - raw, 3);
    }

    // fondo
    ctx.fillStyle = st.cFondo;
    ctx.fillRect(0, 0, w, h);

    // layout
    var padL = 56, padR = 24, padT = 24, padB = 36;
    var N = st.pts.length;
    var x = function (i) {
      return padL + (N > 1 ? (i / (N - 1)) * (w - padL - padR) : (w - padL - padR) / 2);
    };
    var y = function (v) {
      return h - padB - ((v - st.min) / (st.max - st.min)) * (h - padT - padB);
    };
    st.x = x; st.y = y;

    // grid + etiquetas
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "11px sans-serif";
    ctx.lineWidth = 1;
    for (var t = 0; t <= 4; t++) {
      var val = st.min + (t / 4) * (st.max - st.min);
      var yy = y(val);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
      ctx.fillText(st.fmt(val), 8, yy + 4);
    }
    ctx.fillText(String(st.pts[0].label), padL, h - 12);
    var lastLabel = String(st.pts[N - 1].label);
    ctx.fillText(lastLabel, w - padR - ctx.measureText(lastLabel).width, h - 12);

    var plotW = w - padL - padR;

    // --- Tendencia (entra en la segunda mitad de la animación) ---
    if (st.finite.length > 1) {
      var tt = st.opts.animar ? Math.max(0, Math.min(1, (p - 0.5) / 0.5)) : 1;
      if (tt > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, padL + plotW * tt + 2, h);
        ctx.clip();
        var i0 = st.finite[0].i, i1 = st.finite[st.finite.length - 1].i;
        ctx.beginPath();
        ctx.moveTo(x(i0), y(st.m * i0 + st.b));
        ctx.lineTo(x(i1), y(st.m * i1 + st.b));
        ctx.strokeStyle = st.cTrend;
        ctx.lineWidth = 3;
        ctx.shadowColor = st.cTrend;
        ctx.shadowBlur = st.opts.pulso ? 12 + 5 * Math.sin(now / 420) : 14;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // --- Serie de datos (revelada por clip de izquierda a derecha) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, padL + plotW * p + 2, h);
    ctx.clip();

    ctx.beginPath();
    var started = false;
    st.pts.forEach(function (pt) {
      if (!isFinite(pt.v)) { started = false; return; }
      if (!started) { ctx.moveTo(x(pt.i), y(pt.v)); started = true; }
      else ctx.lineTo(x(pt.i), y(pt.v));
    });
    ctx.strokeStyle = st.cSerie;
    ctx.lineWidth = 2;
    ctx.shadowColor = st.cSerie;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (st.conPuntos && st.finite.length <= 200) {
      ctx.fillStyle = st.cSerie;
      st.finite.forEach(function (pt) {
        ctx.beginPath();
        ctx.arc(x(pt.i), y(pt.v), st.finite.length === 1 ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();

    // --- Hover: crosshair + punto resaltado ---
    if (st.hover >= 0) {
      var hp = st.finite[st.hover];
      var hx = x(hp.i), hy = y(hp.v);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, h - padB); ctx.stroke();
      ctx.fillStyle = st.cSerie;
      ctx.shadowColor = st.cSerie;
      ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(hx, hy, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // ¿hace falta seguir animando? (entrada en curso o pulso activo)
    if ((st.opts.animar && p < 1) || st.opts.pulso) this._requestDraw();
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

      // --- Extracción robusta (con o sin pivot; null => hueco; guarda links para drill) ---
      var pivots = queryResponse.pivots;
      var getCell = (pivots && pivots.length)
        ? function (r) { return r[measName][pivots[0].key]; }
        : function (r) { return r[measName]; };

      var pts = data.map(function (r) {
        var cell = getCell(r) || {};
        var v = (cell.value == null) ? NaN : Number(cell.value);
        var d = r[dimName] || {};
        return { v: v, raw: d.value, label: d.rendered || d.value || "", links: cell.links || null };
      });

      // --- Orden ascendente por la dimensión, sin importar el sort del Look ---
      pts.sort(function (a, b) {
        var na = Number(a.raw), nb = Number(b.raw);
        if (isFinite(na) && isFinite(nb)) return na - nb;
        return String(a.raw).localeCompare(String(b.raw));
      });
      pts.forEach(function (p, i) { p.i = i; });

      var finite = pts.filter(function (p) { return isFinite(p.v); });

      // DIAGNÓSTICO: bórralo cuando todo funcione
      console.log("[linea_neon] filas:", data.length, "| numéricas:", finite.length, "| muestra:", finite.slice(0, 5));

      if (!finite.length) {
        this.addError({
          title: "Sin valores numéricos",
          message: "La medida '" + measName + "' no trae números. Revisa la consola."
        });
        return;
      }

      // --- Escala (dominio centrado si los datos son planos) ---
      var min = Infinity, max = -Infinity;
      finite.forEach(function (p) {
        if (p.v < min) min = p.v;
        if (p.v > max) max = p.v;
      });
      if (min === max) { var delta = Math.abs(min) * 0.1 || 1; min -= delta; max += delta; }

      // --- Regresión lineal (se calcula una vez por actualización de datos) ---
      var m = 0, b = finite[0].v;
      if (finite.length > 1) {
        var n = finite.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
        finite.forEach(function (p) {
          sx += p.i; sy += p.v; sxy += p.i * p.v; sxx += p.i * p.i;
        });
        var den = n * sxx - sx * sx;
        m = den ? (n * sxy - sx * sy) / den : 0;
        b = (sy - m * sx) / n;
      }

      var fmt = function (v) {
        var a = Math.abs(v);
        if (a >= 1e9) return (v / 1e9).toFixed(1) + "B";
        if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
        if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
        return a >= 10 ? v.toFixed(0) : v.toFixed(2);
      };

      this._state = {
        pts: pts, finite: finite, min: min, max: max, m: m, b: b, fmt: fmt,
        cFondo: (config && config.color_fondo) || "#000000",
        cSerie: (config && config.color_serie) || "#ffffff",
        cTrend: (config && config.color_tendencia) || "#ff0033",
        conPuntos: !config || config.mostrar_puntos !== false,
        opts: {
          animar: !config || config.animar_entrada !== false,
          pulso: !config || config.pulso_tendencia !== false
        },
        hover: -1,
        x: null, y: null,
        animStart: performance.now()
      };

      // primer frame síncrono; _draw agenda los siguientes si hacen falta
      this._draw(performance.now());
      done();
    } catch (e) {
      this.addError({ title: "Error en la viz", message: String(e.message || e) });
    }
  }
});
