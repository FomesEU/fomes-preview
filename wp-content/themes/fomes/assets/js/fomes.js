/* FOMES v3 — scroll, bobina tipografica, riquadro che cresce, prodotto che ruota
   con le direttrici sui pezzi, parallasse nelle cornici, cursore. */
(() => {
	const D = window.FOMES || {};
	const html = document.documentElement;
	const $ = (s, r = document) => r.querySelector(s);
	const $$ = (s, r = document) => [...r.querySelectorAll(s)];
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduce) html.classList.add('reduce');
	const G = window.gsap;
	if (G) G.registerPlugin(ScrollTrigger, SplitText);
	const pad = () => parseFloat(getComputedStyle(html).getPropertyValue('--pad')) || 20;

	/* ---------- Scroll morbido e ancore ---------- */
	let lenis = null;
	if (!reduce && window.Lenis) {
		lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
		if (G) {
			lenis.on('scroll', ScrollTrigger.update);
			G.ticker.add((t) => lenis.raf(t * 1000));
			G.ticker.lagSmoothing(0);
		}
	}
	const intro = $('.intro');
	const scrollToY = (y) => lenis ? lenis.scrollTo(y, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) }) : scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
	document.addEventListener('click', (e) => {
		const a = e.target.closest('a[href*="#"]');
		if (!a) return;
		const url = new URL(a.href, location.href);
		if (url.pathname !== location.pathname || !url.hash) return;
		let y = null;
		if (url.hash === '#top') y = 0;
		else if (url.hash === '#design' && intro && !reduce) y = intro.offsetTop + innerHeight * 2.7; // dove comincia il prodotto
		else if ($(url.hash)) y = $(url.hash).getBoundingClientRect().top + scrollY;
		if (y === null) return;
		e.preventDefault();
		html.classList.remove('menu-open');
		scrollToY(y);
	});
	document.addEventListener('click', (e) => { if (e.target.closest('[data-menu-toggle]')) html.classList.toggle('menu-open'); });

	/* ---------- Orologio ---------- */
	const clock = $('[data-clock]');
	const tz = $('[data-tz]');
	const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
	const fmtTz = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', timeZoneName: 'short' });
	const tick = () => {
		const d = new Date();
		if (clock) clock.textContent = fmt.format(d);
		if (tz) tz.textContent = (fmtTz.formatToParts(d).find((p) => p.type === 'timeZoneName') || {}).value || '';
	};
	tick();
	setInterval(tick, 1000);

	/* ---------- Parole giganti: Inter compresso di data-c ---------- */
	const sizeWords = () => $$('.word[data-c]').forEach((w) => {
		const svg = $('svg', w);
		const t = $('text', w);
		if (!svg || !t) return;
		t.removeAttribute('textLength');
		const L = t.getComputedTextLength();
		if (!L) return;
		const Wd = Math.round(L * (Number(w.dataset.c) || 1));
		svg.setAttribute('viewBox', `0 0 ${Wd} 727`);
		t.setAttribute('textLength', Wd);
	});
	sizeWords();

	/* ---------- Avanzamento ---------- */
	const fill = $('.bar__fill');
	const pct = $('[data-progress]');
	const progress = () => {
		const max = html.scrollHeight - innerHeight;
		const p = max > 0 ? Math.min(1, scrollY / max) : 0;
		if (fill) fill.style.transform = `scaleX(${p})`;
		if (pct) pct.textContent = Math.round(p * 100);
	};
	addEventListener('scroll', progress, { passive: true });
	progress();

	/* ---------- Fotogrammi del prodotto ---------- */
	const seq = $('.seq__canvas');
	const N = seq ? (D.frameCount | 0) : 0;
	const frames = [];
	let current = 0;
	const FIT = 0.94;
	const sizeCanvas = (c, maxDpr = 2) => {
		const dpr = Math.min(devicePixelRatio || 1, maxDpr);
		const w = Math.round(c.clientWidth * dpr);
		const h = Math.round(c.clientHeight * dpr);
		if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
		return [w, h];
	};
	const draw = (i) => {
		const img = frames[i];
		if (!seq || !img || !img.naturalWidth) return;
		const [w, h] = sizeCanvas(seq);
		const ctx = seq.getContext('2d');
		ctx.clearRect(0, 0, w, h);
		const s = Math.min(w / img.naturalWidth, (h * FIT) / img.naturalHeight);
		ctx.drawImage(img, (w - img.naturalWidth * s) / 2, (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
	};
	const loadFrames = (onProgress) => new Promise((resolve) => {
		if (!N) return resolve();
		let done = 0;
		for (let i = 0; i < N; i++) {
			const im = new Image();
			im.decoding = 'async';
			im.onload = im.onerror = () => {
				done++;
				onProgress(done / N);
				if (i === current) draw(current);
				if (done === N) resolve();
			};
			im.src = `${D.frames}${String(i + 1).padStart(4, '0')}.webp`;
			frames.push(im);
		}
	});

	/* ---------- Direttrici: dal blocco di testo al pezzo, sulle ancore calcolate da Blender ---------- */
	const SVGNS = 'http://www.w3.org/2000/svg';
	const leaders = $('.leaders');
	const A = D.anchors;
	const toScreen = (pt) => {
		const cw = seq.clientWidth, ch = seq.clientHeight;
		const [iw, ih] = A.image;
		const s = Math.min(cw / iw, (ch * FIT) / ih);
		// sul telefono il canvas del prodotto sta nella parte alta del riquadro (fomes.css): conta il suo scostamento
		return [seq.offsetLeft + (cw - iw * s) / 2 + pt[0] * s, seq.offsetTop + (ch - ih * s) / 2 + pt[1] * s];
	};
	const mk = (tag, attrs, parent) => {
		const e = document.createElementNS(SVGNS, tag);
		Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
		parent.appendChild(e);
		return e;
	};
	// una spezzata con gli angoli in curva larga (Andrea, 27/09: «riusciamo a fare anche queste direttrici più morbide?
	// più curvilinee?»): stesso percorso di prima, raggio fino a 70 px e mai oltre meta' dei due tratti; il gradino
	// orizzontale-verticale-orizzontale diventa una S. Si disegna con la stessa animazione delle linee di prima
	// raggi: uno per angolo, a partire dal primo (limiti, oltre ai 70 px e a meta' dei tratti)
	const curva = (g, pts, raggi = []) => {
		const p = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 0.5);
		if (p.length < 2) return null;
		let d = `M${p[0][0]} ${p[0][1]}`;
		for (let i = 1; i < p.length - 1; i++) {
			const [a, b, c] = [p[i - 1], p[i], p[i + 1]];
			const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
			const r = Math.max(0, Math.min(70, l1 / 2, l2 / 2, raggi[i - 1] ?? Infinity));
			const s = [b[0] - ((b[0] - a[0]) / l1) * r, b[1] - ((b[1] - a[1]) / l1) * r];
			const e = [b[0] + ((c[0] - b[0]) / l2) * r, b[1] + ((c[1] - b[1]) / l2) * r];
			d += ` L${s[0]} ${s[1]} C${(s[0] + b[0]) / 2} ${(s[1] + b[1]) / 2} ${(e[0] + b[0]) / 2} ${(e[1] + b[1]) / 2} ${e[0]} ${e[1]}`;
		}
		const z = p[p.length - 1];
		return mk('path', { d: `${d} L${z[0]} ${z[1]}`, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }, g);
	};
	const layoutLeaders = () => {
		if (!leaders || !A || !seq || !seq.clientWidth) return;
		// misure del riquadro delle direttrici (tutto il riquadro: sul telefono il prodotto ne occupa solo la parte alta)
		const rr = leaders.getBoundingClientRect(), W = rr.width || seq.clientWidth, H = rr.height || seq.clientHeight, mobile = innerWidth < 900;
		const pila = {};   // sul telefono i blocchi che escono insieme (stessa fase e stesso gruppo) si impilano nella fascia
		leaders.setAttribute('viewBox', `0 0 ${W} ${H}`);
		$$('.feat').forEach((el) => {
			// i blocchi dell'esploso puntano ai pezzi aperti (ancore calcolate sull'ultimo fotogramma)
			const set = (el.dataset.fase === 'esploso' && A.anchors_esploso) || A.anchors;
			const to = (el.dataset.to || '').split(',').filter((k) => set[k]);
			if (!el._g) el._g = mk('g', { opacity: 0 }, leaders);
			const g = el._g;
			while (g.firstChild) g.removeChild(g.firstChild);
			if (!to.length) return;
			const lato = mobile ? 'l' : (el.classList.contains('feat--b') ? 'r' : 'l');
			const pts = to.map((k) => toScreen(set[k][lato]));
			const yLine = $('.feat__n', el).offsetHeight + 21;      // la linea passa fra numero e titolo
			// telefono (Andrea, 27/09: «sulla modalità telefono i testi finiscono sopra all'oggetto»): i testi nella fascia
			// libera sotto il prodotto, dal 69% dell'altezza; su PC accanto al pezzo, come prima
			// (impilati sull'altezza del blocco sopra: con quella del proprio, un titolo su due righe finiva sulla linea dopo)
			const chiave = (el.dataset.fase || '') + (el.dataset.slot || '');
			const sotto = mobile && chiave in pila;   // sul telefono, un blocco impilato sotto un altro
			const top = mobile ? (pila[chiave] ?? H * 0.69) : Math.max(150, Math.min(H - el.offsetHeight - 40, pts[0][1] - yLine));
			if (mobile) pila[chiave] = top + el.offsetHeight + 28;   // 28: la linea del blocco sotto passa 10 px sopra di lui, e i titoli sbordano di qualche px
			const yL = top + yLine;
			el.style.top = `${top}px`;
			if (mobile) {
				// telefono: la linea parte sopra il blocco (non passa sul numero) e sale lungo il fianco libero del prodotto,
				// a sinistra di TUTTI i pezzi: l'esploso va in diagonale dall'alto a destra, e una colonna appena a sinistra
				// del pezzo passava sui pezzi piu' in basso (misura del 27/09). Un blocco impilato sotto un altro sale a
				// destra, per non attraversare il blocco sopra. Dalla colonna al pezzo, un ramo orizzontale
				const x0 = pad();
				el.style.left = `${x0}px`;
				el.style.width = `${W - 2 * x0}px`;
				const xs = Object.values(set).flatMap((a) => [toScreen(a.l)[0], toScreen(a.r)[0]]);
				const lt = sotto ? 'r' : 'l';
				const xc = sotto ? Math.min(W - x0, Math.max(...xs) + 34) : Math.max(x0, Math.min(...xs) - 34);
				to.forEach((k) => {
					const [px, py] = toScreen(set[k][lt]);
					curva(g, [[x0, top - 10], [xc, top - 10], [xc, py], [px, py]]);
					mk('circle', { cx: px, cy: py, r: 2.5 }, g);
				});
			} else if (lato === 'l') {
				// dal blocco a una colonna subito a destra del testo, e dalla colonna a ogni pezzo in orizzontale:
				// le linee non attraversano il titolo e non corrono sui pezzi (schermate di Andrea, 27/09: il tratto
				// verticale passava sul tappino, i rami degli O-ring tagliavano «four o-rings»)
				const x0 = W * 0.07;
				const minX = Math.min(...pts.map((p) => p[0]));
				const larg = Math.max(180, Math.min(minX - x0 - 48, W * 0.42));
				el.style.left = `${x0}px`;
				el.style.width = `${larg}px`;
				const xc = Math.min(x0 + larg + 16, minX - 24);
				// il primo angolo, dove la linea lascia il blocco verso la colonna, non entra nel testo: il suo raggio
				// si ferma 6 px dopo le lettere vere del blocco (a raggio pieno la curva tagliava la fine del titolo)
				const rs = leaders.getBoundingClientRect();
				const fine = Math.max(x0, ...$$('.feat__n, .feat__title, .feat__text', el).map((t) => {
					const r = document.createRange();
					r.selectNodeContents(t);
					const b = r.getBoundingClientRect();
					return b.width ? b.right - rs.left : x0;
				}));
				// un tracciato per pezzo: blocco -> colonna -> ramo orizzontale fino al punto
				pts.forEach(([px, py]) => {
					curva(g, [[x0, yL], [xc, yL], [xc, py], [px, py]], [py > yL ? xc - fine - 6 : Infinity]);   // verso l'alto il testo e' sotto
					mk('circle', { cx: px, cy: py, r: 2.5 }, g);
				});
			} else {
				const x1 = W * 0.93;
				const left = Math.min(W * 0.62, Math.max(pts[0][0] + 48, W * 0.55));
				el.style.left = `${left}px`;
				el.style.width = `${x1 - left}px`;
				pts.forEach(([px, py], i) => {
					curva(g, i === 0 ? [[x1, yL], [px, yL], [px, py]] : [[x1, yL], [x1, py], [px, py]]);
					mk('circle', { cx: px, cy: py, r: 2.5 }, g);
				});
			}
		});
	};

	/* ---------- Bobina tipografica (lo showreel di Liteshop, in codice) ---------- */
	// Otto scene, solo testo sulle quattro parole approvate. Andrea (27/09): «io aggiungerei gli effetti della bobina
	// precedente a questi. sono entrambi belli». Prima le quattro prese dal video di Liteshop — estrusione a strati
	// (SNOW BOARD), nastro che torce (SKATE BOARDING), righe che salgono su lime (TIME TO DIGITIZE), colonna a clessidra
	// (BASKET STUNT DRIFT) — poi le quattro della prima bobina. Il lime e' ammesso nella bobina (Andrea, 27/09).
	const reelCanvas = $('.reel');
	const Reel = (canvas, words) => {
		const ctx = canvas.getContext('2d');
		const off = document.createElement('canvas');
		const o = off.getContext('2d');
		let W = 0, H = 0, raf = 0, t0 = 0, running = false;
		const DUR = 2.4;
		const WHITE = '#FFFFFF', BLACK = '#111111', LIME = '#E5FF2D';
		const w0 = words[0] || 'WIND-PROOF', w1 = words[1] || 'WATERPROOF', w2 = words[2] || 'TUBOH',
			w3 = words[3] || 'MADE IN ITALY';
		const clamp = (x) => Math.max(0, Math.min(1, x));
		const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
		const inExpo = (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
		const mod = (a, m) => ((a % m) + m) % m;
		const bg = (c) => { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); };

		// una riga di testo stirata a tutta larghezza, in un canvas fuori schermo (con cache: le scene nuove la
		// ridisegnano in molte copie per fotogramma)
		const cache = new Map();
		const riga = (txt, w, h, col, capovolta = false) => {
			const k = `${txt}|${w | 0}|${h | 0}|${col}|${capovolta}`;
			let c = cache.get(k);
			if (c) return c;
			c = document.createElement('canvas');
			c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
			const x = c.getContext('2d');
			x.font = `700 ${(c.height * 0.96) / 0.727}px Inter, Helvetica, Arial, sans-serif`;
			const tw = x.measureText(txt).width || 1;
			x.fillStyle = col;
			if (capovolta) { x.translate(0, c.height); x.scale(1, -1); }
			x.translate(0, c.height * 0.98);
			x.scale(c.width / tw, 1);
			x.fillText(txt, 0, 0);
			if (cache.size > 160) cache.clear();
			cache.set(k, c);
			return c;
		};

		// testo su un'immagine fuori schermo: ogni riga stirata a tutta larghezza
		const textBlock = (lines, bw, bh, fillc = WHITE) => {
			off.width = Math.max(1, bw | 0); off.height = Math.max(1, bh | 0);
			o.clearRect(0, 0, off.width, off.height);
			o.fillStyle = fillc;
			const lh = off.height / lines.length;
			lines.forEach((t, i) => {
				const fs = (lh * 0.96) / 0.727;
				o.font = `700 ${fs}px Inter, Helvetica, Arial, sans-serif`;
				const tw = o.measureText(t).width || 1;
				o.save();
				o.translate(0, lh * (i + 1) - lh * 0.02);
				o.scale(off.width / tw, 1);
				o.fillText(t, 0, 0);
				o.restore();
			});
			return off;
		};

		const scenes = [
			// --- dal video di Liteshop (prova approvata il 27/09) ---
			// estrusione a strati (SNOW BOARD): nasce da una riga piatta, si gonfia estrusa coi lati grigi, si richiude
			(t) => {
				bg(BLACK);
				const i = w0.indexOf('-');
				const lines = i > 0 ? [w0.slice(0, i + 1), w0.slice(i + 1)] : [w0];
				const bw = Math.min(W * (W < H ? 0.88 : 0.7), H * 1.45), lh = Math.min(H * 0.135, bw * 0.19);   // in verticale piu' larga
				[0.29, 0.71].forEach((cy, j) => {
					const tt = t - j * 0.07;
					const sy = Math.max(0.012, outExpo(clamp(tt / 0.55)) * (1 - inExpo(clamp((tt - (DUR - 0.5)) / 0.42))));
					const depth = H * 0.12 * sy * (0.8 + 0.2 * Math.sin(t * 2.6 + j * 1.7));
					const K = 26, bh = lh * lines.length * sy;
					for (let k = K; k >= 0; k--) {
						const g = 36 + Math.round((150 * (1 - k / K)) / 12) * 12;   // lati grigi, piu' scuri dietro
						const col = k === 0 ? WHITE : `rgb(${g},${g},${g})`;
						lines.forEach((l, n) => {
							ctx.drawImage(riga(l, bw, lh * 0.92, col), (W - bw) / 2, H * cy - bh / 2 + (n * bh) / lines.length + depth * (k / K), bw, (bh / lines.length) * 0.92);
						});
					}
				});
			},
			// nastro che torce e scorre (SKATE BOARDING): righe grandi, un'onda lunga; il retro, quando si gira, e' grigio
			(t) => {
				bg(BLACK);
				const half = Math.ceil(w1.length / 2);
				const parts = w1.includes('-') ? w1.split('-') : [w1.slice(0, half), w1.slice(half)];
				const hb = H * 0.37, step = Math.max(2, Math.round(W / 480));
				const amp = 1.62 * outExpo(clamp(t / 0.6));
				parts.forEach((p, r) => {
					const reps = 4, ww = Math.min(W * 0.72, hb * 3.4) * reps;
					const txt = Array(reps).fill(p).join(' ') + ' ';
					const fronte = riga(txt, ww, hb, WHITE), retro = riga(txt, ww, hb, '#8C8C8C', true);
					const x0 = t * W * 0.22 * (r ? -1 : 1) + r * ww * 0.37;
					const cy = H * (r ? 0.695 : 0.305);
					for (let x = 0; x < W; x += step) {
						const u = x / W;
						const th = amp * Math.sin(Math.PI * 2 * (u * 0.55 - t * 0.32) + r * 0.9);
						const c = Math.cos(th), h = hb * Math.abs(c);
						if (h < 0.5) continue;
						const yo = H * 0.04 * Math.sin(Math.PI * 2 * (u * 0.6 + t * 0.35) + r);
						const sx = mod(x + x0, ww);
						ctx.drawImage(c >= 0 ? fronte : retro, sx, 0, Math.min(step, ww - sx), hb, x, cy + yo - h / 2, step + 0.6, h);
					}
				});
			},
			// righe che salgono una dopo l'altra, su fondo lime (TIME TO DIGITIZE)
			(t) => {
				bg(LIME);
				const bw = W * 0.92, lh = Math.min(H * 0.27, bw * 0.24), gap = lh * 0.1;
				// tante righe quante riempiono il riquadro (in verticale sono piu' di quattro)
				const n = Math.max(4, Math.min(10, Math.ceil((H * 0.9) / (lh + gap)))), passo = Math.min(0.2, 1.3 / n);
				const esce = inExpo(clamp((t - (DUR - 0.45)) / 0.45));
				const y0 = H * 0.1 - t * H * 0.1 - esce * H * 1.3;
				for (let i = 0; i < n; i++) {
					const p = outExpo(clamp((t - 0.08 - i * passo) / 0.6));
					if (p <= 0) continue;
					const y = y0 + i * (lh + gap);
					ctx.save();
					ctx.beginPath(); ctx.rect((W - bw) / 2, y, bw, lh); ctx.clip();
					ctx.drawImage(riga(w2, bw, lh, BLACK), (W - bw) / 2, y + (1 - p) * lh * 1.05, bw, lh);
					ctx.restore();
				}
			},
			// colonna che scorre in verticale, schiacciata a clessidra (BASKET STUNT DRIFT)
			(t) => {
				bg(WHITE);
				const parole = w3.split(' ');
				const cw = Math.min(W * (W < H ? 0.8 : 0.46), H * 0.95), base = H * (W < H ? 0.1 : 0.14);   // in verticale piu' larga
				const alt = parole.map((p) => base * (p.length <= 2 ? 0.62 : p.length >= 5 ? 1.2 : 1));
				const gap = base * 0.1, ciclo = alt.reduce((a, b) => a + b + gap, 0);
				const k = `col|${w3}|${cw | 0}|${H | 0}`;
				let col = cache.get(k);
				if (!col) {   // due cicli e un'altezza in piu': lo scorrimento non vede mai il bordo
					col = document.createElement('canvas');
					col.width = cw | 0; col.height = Math.ceil(ciclo * 2 + H);
					const x = col.getContext('2d');
					let y = 0;
					while (y < col.height) {
						parole.forEach((p, i) => { x.drawImage(riga(p, cw, alt[i], BLACK), 0, y); y += alt[i] + gap; });
					}
					cache.set(k, col);
				}
				const v = H * 0.45, row = Math.max(2, Math.round(H / 360));
				for (let y = 0; y < H; y += row) {
					const ny = (y + row / 2 - H / 2) / (H / 2);
					const s = 0.26 + 0.74 * Math.pow(Math.abs(ny), 1.2);
					const dw = cw * s;
					ctx.drawImage(col, 0, mod(y + t * v, ciclo), cw, row, (W - dw) / 2, y, dw, row + 0.6);
				}
			},
			// --- la prima bobina (26/09) ---
			// 1 — estrusione a strati (SNOW BOARD)
			(t) => {
				const bw = W * 0.6, bh = H * 0.28;
				const src = textBlock(w0.replace('-', '-\n').split('\n'), bw, bh);
				[0.3, 0.72].forEach((cy, j) => {
					const K = 18;
					for (let k = K; k >= 0; k--) {
						const oy = -k * H * 0.009 * (0.7 + 0.3 * Math.sin(t * 3 + k * 0.35 + j));
						ctx.globalAlpha = k === 0 ? 1 : 0.18 + 0.5 * (1 - k / K);
						ctx.drawImage(src, (W - bw) / 2, H * cy - bh / 2 + oy, bw, bh);
					}
				});
				ctx.globalAlpha = 1;
			},
			// 2 — onda (SKATE BOARD)
			(t) => {
				const bw = W * 0.92, bh = H * 0.62;
				const src = textBlock([w1.slice(0, 5), w1.slice(5)], bw, bh);
				const step = Math.max(2, (W / 420) | 0);
				const x0 = (W - bw) / 2, y0 = (H - bh) / 2;
				for (let x = 0; x < bw; x += step) {
					const u = x / bw;
					const dy = Math.sin(u * 9 + t * 4) * H * 0.07 * Math.sin(u * Math.PI);
					const sy = 1 + 0.35 * Math.sin(u * 6 - t * 3);
					ctx.drawImage(src, x, 0, step, bh, x0 + x, y0 + dy - (bh * (sy - 1)) / 2, step + 0.5, bh * sy);
				}
			},
			// 3 — griglia spezzata (MR FLATLAND)
			(t) => {
				const bw = W * 0.27, bh = H * 0.2;
				const src = textBlock([w2], bw, bh);
				const bands = 9;
				for (let r = 0; r < 3; r++) {
					for (let c = 0; c < 3; c++) {
						const x = W * (0.06 + c * 0.305), y = H * (0.12 + r * 0.29);
						for (let b = 0; b < bands; b++) {
							const n = Math.sin((b + 1) * 12.9898 + Math.floor(t * 7) * 78.233 + r * 3 + c) * 43758.5453;
							const dx = ((n - Math.floor(n)) - 0.5) * bw * 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + c));
							const sh = bh / bands;
							ctx.drawImage(src, 0, b * sh, bw, sh, x + dx, y + b * sh, bw, sh + 0.5);
						}
					}
				}
			},
			// 4 — lente (PANNA PRO)
			(t) => {
				const bw = W * 0.8, bh = H * 0.86;
				const src = textBlock(w3.split(' '), bw, bh);
				const cy = H / 2, R = bh / 2, row = Math.max(2, (H / 360) | 0);
				const k = 0.55 + 0.35 * Math.sin(t * 2.2);
				for (let yd = cy - R; yd < cy + R; yd += row) {
					const nd = (yd - cy) / R;
					const ns = Math.sign(nd) * Math.pow(Math.abs(nd), 1 + k);
					const sy = (ns * R) + R;
					const sx = 1 + k * 0.9 * (1 - nd * nd);
					const dw = bw * sx;
					ctx.drawImage(src, 0, sy, bw, row, (W - dw) / 2, yd, dw, row + 0.5);
				}
			},
		];

		// l'istante T (secondi) della bobina; fra una scena e l'altra, taglio netto con due fotogrammi di lampo lime
		const drawAt = (T) => {
			const s = Math.floor(T / DUR) % scenes.length;
			const tl = T % DUR;
			[W, H] = sizeCanvas(canvas, 1.5);
			ctx.fillStyle = tl < 0.07 ? LIME : BLACK;
			ctx.fillRect(0, 0, W, H);
			if (tl >= 0.07) scenes[s](tl);
		};
		const frameLoop = (now) => {
			if (!running) return;
			if (!t0) t0 = now;
			drawAt((now - t0) / 1000);
			raf = requestAnimationFrame(frameLoop);
		};
		return {
			draw: drawAt,
			durata: DUR * scenes.length,
			play() { if (!running) { running = true; raf = requestAnimationFrame(frameLoop); } },
			pause() { running = false; cancelAnimationFrame(raf); },
		};
	};
	const reel = reelCanvas && !reduce ? Reel(reelCanvas, D.reel || []) : null;

	/* ---------- Preloader ---------- */
	const pre = $('.preloader');
	const prePct = $('.preloader__pct');
	const setPct = (p) => { if (prePct) prePct.textContent = String(Math.round(p * 100)).padStart(2, '0'); };
	const fonts = document.fonts ? Promise.all([document.fonts.load('700 100px Inter'), document.fonts.ready]) : Promise.resolve();
	const timeout = new Promise((r) => setTimeout(r, 6000));
	let directorReady = null;
	Promise.race([Promise.all([loadFrames(setPct), fonts]), timeout]).then(() => {
		setPct(1);
		sizeWords();
		draw(current);
		if (directorReady) directorReady();
		if (G) ScrollTrigger.refresh();
		if (reel) reel.play();
		setTimeout(() => { if (pre) pre.classList.add('is-done'); introIn(); }, 250);
	});
	addEventListener('resize', () => { sizeWords(); draw(current); layoutLeaders(); });

	if (!G || reduce) {
		if (reduce && N) setTimeout(() => { current = Math.floor(N / 3); draw(current); }, 0);
		return;
	}

	/* ---------- Ingresso ---------- */
	function introIn() {
		G.from('.intro__word svg', { yPercent: 102, duration: 1.3, ease: 'expo.out', delay: 0.15 });
		G.from('.intro__meta > *', { y: 12, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06, delay: 0.35 });
		G.from('.frame', { opacity: 0, duration: 0.6, delay: 0.6 });
	}

	/* ---------- Regia dell'intro: il riquadro cresce, poi il prodotto ---------- */
	const frameEl = $('.frame');
	const bar = $('.bar');
	if (intro && frameEl) {
		const thumbScale = () => {
			const target = innerWidth < 900 ? innerWidth * 0.36 : Math.max(210, innerWidth * 0.155);
			return target / frameEl.offsetWidth;
		};
		const obj = { f: 0 };
		// la sequenza del prodotto: giro, apertura dell'esploso, esploso che continua a girare (Andrea, 27/09).
		// Tempi della regia non lineari: all'esploso finito va piu' scorrimento, perche' li' compaiono le direttrici.
		const FR = (A && A.frames) || { giro: N, apertura: [N, N], totale: N };
		// esploso finito 3,4 unita': tre gruppi di direttrici, ognuno ~0,8 (il titolo entra in 0,55; con 2,2 svaniva prima)
		const TAPPE = [[0, 2.6], [FR.giro, 7.0], [FR.apertura[1], 8.4], [Math.max(1, N - 1), 11.8]];
		const T_FINE = TAPPE[TAPPE.length - 1][1];
		const tDi = (f) => {                               // da fotogramma a tempo della regia
			for (let i = 1; i < TAPPE.length; i++) {
				const [f0, t0] = TAPPE[i - 1], [f1, t1] = TAPPE[i];
				if (f <= f1) return t0 + (t1 - t0) * (f1 > f0 ? (f - f0) / (f1 - f0) : 1);
			}
			return T_FINE;
		};
		const tl = G.timeline({
			defaults: { ease: 'none' },
			scrollTrigger: {
				trigger: intro, start: 'top top', end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true,
				onUpdate: (self) => {
					const t = self.progress * tl.duration();
					if (reel) (t < 2.75 ? reel.play() : reel.pause());
					if (bar) bar.classList.toggle('is-on', t > 1.1 && t < T_FINE - 0.1);
				},
			},
		});
		tl.fromTo(frameEl, { scale: thumbScale, y: () => -pad() }, { scale: 1, y: 0, duration: 1.2, ease: 'power2.inOut' }, 0)
			.to('.intro__word', { y: () => -innerHeight * 1.05, duration: 1.1, ease: 'power1.in' }, 0)
			.to('.intro__meta', { y: () => -innerHeight * 0.4, opacity: 0, duration: 0.7 }, 0)
			.to('.reel', { opacity: 0, duration: 0.35 }, 2.25)
			.to('.seq__canvas', { opacity: 1, duration: 0.35 }, 2.35)
			.to('.frame__tag', { opacity: 1, duration: 0.3 }, 2.45);
		const mostra = () => { const i = Math.round(obj.f); if (i !== current) { current = i; draw(i); } };
		for (let i = 1; i < TAPPE.length; i++) {
			tl.to(obj, { f: TAPPE[i][0], duration: TAPPE[i][1] - TAPPE[i - 1][1], onUpdate: mostra }, TAPPE[i - 1][1]);
		}

		// le direttrici si costruiscono quando il riquadro ha la sua misura piena
		const buildFeatures = () => {
			const s0 = G.getProperty(frameEl, 'scale');
			G.set(frameEl, { scale: 1 });
			layoutLeaders();
			G.set(frameEl, { scale: s0 });
			// due gruppi (Andrea, 27/09): i blocchi di solo testo durante il giro, e si chiudono prima dell'apertura;
			// i materiali con le direttrici sull'esploso finito, e l'ultimo gruppo resta fino alla fine
			const feats = $$('.feat');
			const gruppi = [
				{ fase: 'giro', da: 2.75, fine: tDi(FR.giro) - 0.2, resta: false },
				{ fase: 'esploso', da: tDi(FR.apertura[1]) + 0.05, fine: T_FINE - 0.1, resta: true },
			];
			gruppi.forEach(({ fase, da, fine, resta }) => {
				const fs = feats.filter((el) => (el.dataset.fase || 'giro') === fase);
				if (!fs.length) return;
				const nSlot = Math.max(...fs.map((f) => Number(f.dataset.slot) || 0)) + 1;
				const span = (fine - da) / nSlot;
				fs.forEach((el) => {
					const s = Number(el.dataset.slot) || 0;
					const a = da + s * span + (el.classList.contains('feat--b') ? 0.2 : 0);
					const b = (s < nSlot - 1 || !resta) ? da + (s + 1) * span - 0.3 : null;
					const split = new SplitText($('.feat__title', el), { type: 'lines,words', mask: 'lines' });
					tl.set(el, { opacity: 1 }, a)
						.from($('.feat__n', el), { opacity: 0, duration: 0.2 }, a)
						.from(split.words, { yPercent: 110, duration: 0.4, stagger: 0.03, ease: 'power3.out' }, a + 0.08);
					if ($('.feat__text', el)) tl.from($('.feat__text', el), { opacity: 0, y: 10, duration: 0.25 }, a + 0.2);
					if (el._g && el._g.childNodes.length) {
						tl.set(el._g, { opacity: 1 }, a)
							.fromTo($$('path', el._g), { attr: { 'stroke-dashoffset': 1 } }, { attr: { 'stroke-dashoffset': 0 }, duration: 0.45, ease: 'power2.out' }, a)
							.from($$('circle', el._g), { scale: 0, transformOrigin: 'center center', duration: 0.2 }, a + 0.35);
						if (b !== null) tl.to(el._g, { opacity: 0, duration: 0.25 }, b);
					}
					if (b !== null) tl.to(el, { opacity: 0, y: -24, duration: 0.25, ease: 'power2.in' }, b);
				});
			});
			tl.to({}, { duration: 0.01 }, T_FINE);
		};
		directorReady = buildFeatures;
	}

	/* ---------- Parole giganti che salgono entrando ---------- */
	$$('.gal .word svg, .shop .word svg, .ftr .word svg').forEach((svg) => {
		G.from(svg, { yPercent: 102, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: svg.parentElement, start: 'top 88%' } });
	});

	/* ---------- Galleria: comparsa dei riquadri ---------- */
	$$('.gal__item .ph, .tile__box').forEach((box) => {
		G.fromTo(box, { clipPath: 'inset(100% 0% 0% 0%)' }, {
			clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, ease: 'expo.out',
			scrollTrigger: { trigger: box, start: 'top 92%' },
		});
	});

	/* ---------- Film: la striscia si apre a tutta pagina con lo scorrimento (Andrea, 27/09) ---------- */
	// aperta al 60% del tratto fermo, poi resta a tutta pagina; il video (quando c'e') gira solo mentre si vede
	const film = $('.film');
	if (film) {
		G.timeline({ scrollTrigger: { trigger: film, start: 'top top', end: 'bottom bottom', scrub: 0.6 } })
			.fromTo('.film__frame', { clipPath: 'inset(36% 0% 36% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.6, ease: 'power2.inOut' })
			.to({}, { duration: 0.4 });
		const v = $('.film__video');
		if (v) new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.15 }).observe(v);
	}

	/* ---------- Shop: la pagina si ferma un momento (Andrea, 27/09: «si riesce a far fermare di un paio di
	   scrollate di mouse la pagina sulla sezione shop? passa troppo veloce») ---------- */
	// su PC, col blocco immagine + testo al centro dello schermo, per mezzo schermo di scorrimento (~2 scrollate da
	// 3 scatti: Lenis ne conta 90 px l'uno); sul telefono no, perche' lo shop va in colonna ed e' piu' alto dello schermo
	/* ---------- Manuale: le tavole scorrono da destra a sinistra con lo scroll (Andrea, 27/09) ---------- */
	// la sezione si ferma e il nastro scorre per tutta la sua lunghezza; in coda c'e' di nuovo la 01: «ricomincia il loop»
	const passi = $('.passi');
	if (passi) {
		const nastro = $('.passi__nastro', passi);
		const corsa = () => Math.max(0, nastro.scrollWidth - innerWidth);
		G.to(nastro, {
			x: () => -corsa(), ease: 'none',
			scrollTrigger: { trigger: passi, pin: true, start: 'top top', end: () => '+=' + corsa(), scrub: 0.6, invalidateOnRefresh: true },
		});
	}

	// la fascia nera in fondo al manuale: la pagina ci si ferma per mezzo schermo, su PC e se la fascia sta nello schermo
	// (Andrea, 27/09: «magari con una fascia nera e un paio di scroll per superare»)
	const fascia = $('.manuale__fascia');
	if (fascia && matchMedia('(min-width: 901px)').matches && fascia.offsetHeight <= innerHeight) {
		ScrollTrigger.create({ trigger: fascia, pin: true, start: 'center center', end: () => '+=' + innerHeight * 0.5, invalidateOnRefresh: true });
	}

	// e un fermo piu' breve sul riquadro del manuale, in fondo alla galleria (Andrea, 27/09: «farei fermare leggermente lo
	// scroll?»): col riquadro al centro dello schermo, per un terzo di schermo; su PC, come lo shop
	const tileManuale = $('.gal .g6');
	if (tileManuale && matchMedia('(min-width: 901px)').matches) {
		// refreshPriority: si ricalcola prima del film, che e' creato prima nel codice ma sta piu' in basso nella pagina
		ScrollTrigger.create({ trigger: tileManuale, pin: '.gal', start: 'center center', end: () => '+=' + innerHeight * 0.35, invalidateOnRefresh: true, refreshPriority: 1 });
	}

	const FERMO_SHOP = 0.5;   // in altezze dello schermo
	const shopGrid = $('.shop__grid');
	if (shopGrid && matchMedia('(min-width: 901px)').matches) {
		ScrollTrigger.create({ trigger: shopGrid, pin: '.shop', start: 'center center', end: () => '+=' + innerHeight * FERMO_SHOP, invalidateOnRefresh: true });
	}

	/* ---------- Immagini che scorrono dentro la cornice (parallasse di Liteshop) ---------- */
	// l'immagine e' alta il 140% della cornice: ±14% della sua altezza usa tutto il margine (Liteshop ±20% della cornice)
	// lo shop no: la sua immagine si vede intera, alta quanto la cornice
	$$('.ph__img').forEach((img) => {
		if (img.closest('.shop')) return;
		G.fromTo(img, { yPercent: -14 }, {
			yPercent: 14, ease: 'none',
			scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
		});
	});

	/* ---------- Cursore alla Liteshop: etichetta che segue il mouse sopra [data-cursor] ---------- */
	if (matchMedia('(pointer: fine)').matches) {
		const cur = document.createElement('div');
		cur.className = 'cursor-label';
		cur.setAttribute('aria-hidden', 'true');
		document.body.appendChild(cur);
		let mx = -200, my = -200, cx = mx, cy = my;
		addEventListener('mousemove', (e) => { mx = e.clientX + 16; my = e.clientY + 16; }, { passive: true });
		G.ticker.add(() => {       // stesso ritardo di Liteshop (lerp 0,12)
			cx += (mx - cx) * 0.12;
			cy += (my - cy) * 0.12;
			cur.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
		});
		document.addEventListener('mouseover', (e) => {
			const el = e.target.closest('[data-cursor]');
			if (el && el.dataset.cursor) {
				cur.textContent = el.dataset.cursor;
				cur.dataset.tone = el.dataset.cursorTone || 'dark';
				cur.classList.add('is-on');
			} else {
				cur.classList.remove('is-on');
			}
		});
		document.addEventListener('mouseleave', () => cur.classList.remove('is-on'));
	}

	/* ---------- Shop: quantità ---------- */
	const qv = $('[data-qty-val]');
	const buy = $('.shop .ajax_add_to_cart');
	document.addEventListener('click', (e) => {
		const b = e.target.closest('[data-qty]');
		if (!b || !qv) return;
		const v = Math.max(1, Math.min(9, Number(qv.textContent) + Number(b.dataset.qty)));
		qv.textContent = v;
		if (buy) {
			buy.setAttribute('data-quantity', v);
			if (window.jQuery) jQuery(buy).data('quantity', v); // add-to-cart.js legge .data()
		}
	});
})();

/* Galleria: immagine ingrandita al clic (anche col movimento ridotto, senza animazione) */
(() => {
	const lb = document.querySelector('.lb');
	if (!lb) return;
	const img = lb.querySelector('.lb__img');
	const G = matchMedia('(prefers-reduced-motion: reduce)').matches ? null : window.gsap;
	const apri = (src) => {
		img.src = src;
		lb.classList.add('is-open');
		lb.setAttribute('aria-hidden', 'false');
		if (G) {
			G.fromTo(lb, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' });
			G.fromTo(img, { scale: 0.94, clipPath: 'inset(8% 8% 8% 8%)' }, { scale: 1, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'expo.out' });
		} else {
			lb.style.opacity = 1;
		}
		lb.querySelector('.lb__close').focus({ preventScroll: true });
	};
	const chiudi = () => {
		if (!lb.classList.contains('is-open')) return;
		const fine = () => { lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); lb.style.opacity = ''; };
		if (G) G.to(lb, { opacity: 0, duration: 0.3, ease: 'power2.out', onComplete: fine });
		else fine();
	};
	document.addEventListener('click', (e) => {
		const ph = e.target.closest('.gal .ph.has-img');
		if (ph) {
			const t = ph.querySelector('.ph__img');
			apri(t.currentSrc || t.src);
		} else if (e.target.closest('[data-lb-close]')) {
			chiudi();
		}
	});
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape') chiudi(); });
})();

/* Il cassetto vive anche nelle pagine interne */
(() => {
	const drawer = document.querySelector('.drawer');
	if (!drawer) return;
	const open = () => { drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false'); };
	const close = () => { drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); };
	document.addEventListener('click', (e) => {
		if (e.target.closest('[data-drawer-open]')) { e.preventDefault(); open(); }
		if (e.target.closest('[data-drawer-close]')) { e.preventDefault(); close(); }
	});
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
	if (window.jQuery) jQuery(document.body).on('added_to_cart', open);
})();
