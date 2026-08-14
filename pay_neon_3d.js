/**
 * Pay Neón 3D — Custom Visualization para Looker
 * ------------------------------------------------
 * - Pay 3D (three.js): la rebanada SE ELEVA y aumenta su glow al pasar el puntero
 * - Tooltip con valor y porcentaje; leyenda interactiva (hover en la leyenda
 *   también eleva la rebanada); arrastra para girar; rotación automática opcional
 * - Clic en una rebanada abre el menú de drill de Looker (si hay links)
 * - Soporta pivots (primer pivot); descarta nulls y valores no positivos
 * - Agrupa el excedente de categorías en "Otros"
 *
 * DEPENDENCIA REQUERIDA (declararla en el manifest o en el campo Dependencies):
 *   https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
 */

looker.plugins.visualizations.add({
  id: "pay_neon_3d",
  label: "Pay Neón 3D",

  options: {
    color_fondo: {
      type: "string", display: "color", label: "Color de fondo",
      default: "#000000", order: 1
    },
    altura_elevacion: {
      type: "number", label: "Elevación al pasar el puntero",
      default: 10, order: 2
    },
    max_rebanadas: {
      type: "number", label: "Máx. rebanadas (el resto se agrupa en 'Otros')",
      default: 12, order: 3
    },
    auto_rotar: {
      type: "boolean", label: "Rotación automática", default: true, order: 4
    },
    mostrar_leyenda: {
      type: "boolean", label: "Mostrar leyenda", default: true, order: 5
    }
  },

  create: function (element) {
    element.style.height = "100%";
    element.style.position = "relative";
    element.style.overflow = "hidden";
    this._el = element;
    this._state = null; // se inicializa en el primer updateAsync (cuando THREE ya cargó)
  },

  _initThree: function (element) {
    var state = {
      hover: -1,
      dragging: false,
      moved: 0,
      lastX: 0,
      slices: [],
      opts: {},
      mouse: new THREE.Vector2(-2, -2),
      raycaster: new THREE.Raycaster()
    };

    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setPixelRatio(window.devicePixelRatio || 1);
    state.renderer.domElement.style.display = "block";
    element.appendChild(state.renderer.domElement);

    state.scene = new THREE.Scene();
    state.camera = new THREE.PerspectiveCamera(38, 1, 1, 1000);
    state.camera.position.set(0, 64, 94);
    state.camera.lookAt(0, 0, 0);

    state.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(70, 140, 90);
    state.scene.add(dir);

    state.group = new THREE.Group();
    state.scene.add(state.group);

    // Tooltip
    state.tooltip = document.createElement("div");
    state.tooltip.style.cssText =
      "position:absolute;display:none;pointer-events:none;z-index:5;" +
      "background:rgba(10,10,14,.92);color:#fff;padding:6px 9px;border-radius:6px;" +
      "font:12px sans-serif;white-space:nowrap;";
    element.appendChild(state.tooltip);

    // Leyenda (contenedor sin eventos; los items sí capturan el puntero)
    state.legend = document.createElement("div");
    state.legend.style.cssText =
      "position:absolute;left:8px;right:8px;bottom:6px;z-index:4;pointer-events:none;" +
      "display:flex;flex-wrap:wrap;gap:4px 10px;justify-content:center;" +
      "font:11px sans-serif;color:rgba(255,255,255,.85);max-height:34%;overflow:auto;";
    element.appendChild(state.legend);

    var self = this;
    var canvas = state.renderer.domElement;

    function setPointerNDC(e) {
      var rect = canvas.getBoundingClientRect();
      state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    canvas.addEventListener("pointermove", function (e) {
      setPointerNDC(e);
      if (state.dragging) {
        var dx = e.clientX - state.lastX;
        state.lastX = e.clientX;
        state.moved += Math.abs(dx);
        state.group.rotation.y += dx * 0.005;
      }
      self._raycastHover(state);
      if (state.hover >= 0) {
        var s = state.slices[state.hover];
        state.tooltip.innerHTML =
          "<b>" + s.label + "</b><br>" + s.fmtV + " · " + s.fmtPct;
        state.tooltip.style.border = "1px solid " + s.color;
        state.tooltip.style.boxShadow = "0 0 12px " + s.color + "66";
        state.tooltip.style.left = Math.min(e.offsetX + 14, (canvas.clientWidth - 130)) + "px";
        state.tooltip.style.top = (e.offsetY + 14) + "px";
        state.tooltip.style.display = "block";
        canvas.style.cursor = state.dragging ? "grabbing" : "pointer";
      } else {
        state.tooltip.style.display = "none";
        canvas.style.cursor = state.dragging ? "grabbing" : "default";
      }
    });

    canvas.addEventListener("pointerdown", function (e) {
      state.dragging = true;
      state.moved = 0;
      state.lastX = e.clientX;
    });

    canvas.addEventListener("pointerup", function (e) {
      state.dragging = false;
      canvas.style.cursor = "default";
      // clic (no drag) sobre una rebanada => drill de Looker
      if (state.moved < 5 && state.hover >= 0) {
        var s = state.slices[state.hover];
        if (s.links && s.links.length && typeof LookerCharts !== "undefined") {
          LookerCharts.Utils.openDrillMenu({ links: s.links, event: e });
        }
      }
    });

    canvas.addEventListener("pointerleave", function () {
      state.dragging = false;
      state.mouse.set(-2, -2);
      self._setHover(state, -1);
      state.tooltip.style.display = "none";
      canvas.style.cursor = "default";
    });

    // Bucle de animación (una sola vez)
    function tick() {
      state.raf = requestAnimationFrame(tick);
      var i, s;
      for (i = 0; i < state.slices.length; i++) {
        s = state.slices[i];
        s.mesh.position.y += (s.targetY - s.mesh.position.y) * 0.18;
        s.mat.emissiveIntensity += (s.targetE - s.mat.emissiveIntensity) * 0.18;
      }
      if (state.opts.autoRotar && !state.dragging && state.hover < 0) {
        state.group.rotation.y += 0.0022;
      }
      state.renderer.render(state.scene, state.camera);
    }
    tick();

    return state;
  },

  _raycastHover: function (state) {
    state.raycaster.setFromCamera(state.mouse, state.camera);
    var hits = state.raycaster.intersectObjects(state.group.children);
    var idx = hits.length ? hits[0].object.userData.index : -1;
    if (idx !== state.hover) this._setHover(state, idx);
  },

  _setHover: function (state, idx) {
    state.hover = idx;
    for (var j = 0; j < state.slices.length; j++) {
      var s = state.slices[j];
      s.targetY = (j === idx) ? state.opts.lift : 0;
      s.targetE = (j === idx) ? 0.55 : 0.15;
      if (s.legendItem) {
        s.legendItem.style.background = (j === idx) ? "rgba(255,255,255,.10)" : "transparent";
      }
    }
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();
    try {
      if (typeof THREE === "undefined") {
        this.addError({
          title: "Falta three.js",
          message: "Agrega la dependencia https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js en el manifest (dependencies) o en el campo Dependencies del registro."
        });
        return;
      }

      var dims = queryResponse.fields.dimensions;
      var meas = queryResponse.fields.measures;
      if (!dims.length || !meas.length) {
        this.addError({ title: "Faltan campos", message: "Necesito 1 dimensión y 1 medida." });
        return;
      }
      var dimName = dims[0].name;
      var measName = meas[0].name;

      // --- Extracción (con o sin pivot) ---
      var pivots = queryResponse.pivots;
      var getCell = (pivots && pivots.length)
        ? function (r) { return r[measName][pivots[0].key]; }
        : function (r) { return r[measName]; };

      var rows = data.map(function (r) {
        var cell = getCell(r) || {};
        var v = (cell.value == null) ? NaN : Number(cell.value);
        var d = r[dimName] || {};
        return { label: String(d.rendered || d.value || ""), v: v, links: cell.links || null };
      });
      var positivas = rows.filter(function (r) { return isFinite(r.v) && r.v > 0; });

      // DIAGNÓSTICO: bórralo cuando todo funcione
      console.log("[pay_neon_3d] filas:", data.length, "| positivas:", positivas.length, "| muestra:", positivas.slice(0, 5));

      if (!positivas.length) {
        this.addError({
          title: "Sin valores positivos",
          message: "Un pay necesita valores > 0 en la medida '" + measName + "'. Revisa la consola."
        });
        return;
      }

      // --- Top N + "Otros" ---
      positivas.sort(function (a, b) { return b.v - a.v; });
      var maxN = Math.max(3, Math.round(Number(config && config.max_rebanadas) || 12));
      var items = positivas;
      if (positivas.length > maxN) {
        items = positivas.slice(0, maxN - 1);
        var resto = positivas.slice(maxN - 1).reduce(function (a, r) { return a + r.v; }, 0);
        items.push({ label: "Otros", v: resto, links: null, esOtros: true });
      }
      var total = items.reduce(function (a, r) { return a + r.v; }, 0);

      // --- Init / tamaño / fondo ---
      if (!this._state) this._state = this._initThree(element);
      var state = this._state;
      state.opts = {
        lift: Number(config && config.altura_elevacion),
        autoRotar: !config || config.auto_rotar !== false
      };
      if (!isFinite(state.opts.lift)) state.opts.lift = 10;

      var w = element.clientWidth || 600, h = element.clientHeight || 400;
      state.renderer.setSize(w, h);
      state.camera.aspect = w / h;
      state.camera.updateProjectionMatrix();
      state.renderer.setClearColor((config && config.color_fondo) || "#000000");

      // --- Limpiar rebanadas previas ---
      state.group.children.slice().forEach(function (m) {
        state.group.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      });
      state.slices = [];
      state.legend.innerHTML = "";
      state.hover = -1;

      var fmt = function (v) {
        var a = Math.abs(v);
        if (a >= 1e9) return (v / 1e9).toFixed(1) + "B";
        if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
        if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
        return a >= 10 ? v.toFixed(0) : v.toFixed(2);
      };

      var PALETA = ["#ff0033", "#00e5ff", "#ffe600", "#a3ff00", "#ff00cc",
                    "#ff8800", "#7c4dff", "#00ffa3", "#ff4d6d", "#4dd2ff", "#c8ff00"];
      var R = 40, H = 9, GAP = 0.6;
      var self = this;
      var acc = -Math.PI / 2;

      items.forEach(function (it, i) {
        var frac = it.v / total;
        var a0 = acc, a1 = acc + frac * Math.PI * 2;
        acc = a1;
        var color = it.esOtros ? "#8a8f98" : PALETA[i % PALETA.length];

        var shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.absarc(0, 0, R, a0, a1, false);
        shape.lineTo(0, 0);
        var geo = new THREE.ExtrudeGeometry(shape, {
          depth: H,
          bevelEnabled: false,
          curveSegments: Math.max(6, Math.ceil(64 * frac))
        });
        geo.rotateX(-Math.PI / 2); // pay acostado en XZ, altura hacia +Y

        var mat = new THREE.MeshPhongMaterial({
          color: color, emissive: color, emissiveIntensity: 0.15,
          shininess: 30, specular: 0x222222
        });
        var mesh = new THREE.Mesh(geo, mat);
        var mid = (a0 + a1) / 2;
        mesh.position.set(Math.cos(mid) * GAP, 0, -Math.sin(mid) * GAP); // separación entre rebanadas
        mesh.userData.index = i;
        state.group.add(mesh);

        var slice = {
          mesh: mesh, mat: mat, label: it.label, color: color, links: it.links,
          fmtV: fmt(it.v), fmtPct: (frac * 100).toFixed(1) + "%",
          targetY: 0, targetE: 0.15, legendItem: null
        };

        if (!config || config.mostrar_leyenda !== false) {
          var li = document.createElement("span");
          li.style.cssText =
            "pointer-events:auto;display:inline-flex;align-items:center;gap:5px;" +
            "padding:2px 8px;border-radius:10px;cursor:default;";
          li.innerHTML =
            "<span style='width:9px;height:9px;border-radius:50%;background:" + color +
            ";box-shadow:0 0 6px " + color + ";'></span>" +
            slice.label + " · " + slice.fmtPct;
          li.addEventListener("mouseenter", function () { self._setHover(state, i); });
          li.addEventListener("mouseleave", function () { self._setHover(state, -1); });
          state.legend.appendChild(li);
          slice.legendItem = li;
        }

        state.slices.push(slice);
      });

      state.renderer.render(state.scene, state.camera);
      done();
    } catch (e) {
      this.addError({ title: "Error en la viz", message: String(e.message || e) });
    }
  }
});
