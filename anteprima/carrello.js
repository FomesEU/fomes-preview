/* Copia statica del prototipo per i soci: il server di WooCommerce, imitato nel browser.
   Le pagine restano quelle di WordPress, con il codice di WooCommerce intatto; qui si risponde
   al posto del server alle sue chiamate (wc-ajax via jQuery, Store API via fetch), col carrello
   in localStorage. I dati e i modelli delle risposte li scrive Esporta-Anteprima.mjs in dati.js,
   presi dal sito locale al momento dell'esportazione. */
(() => {
	const D = window.FOMES_ANTEPRIMA_DATI;
	if (!D) return;
	const RITARDO = 180; // ms: come una risposta del server locale, così le animazioni di caricamento restano
	const CHIAVE = 'fomes-anteprima';
	const clona = (o) => JSON.parse(JSON.stringify(o));

	/* ---------- Stato: il carrello, gli indirizzi, gli ordini ---------- */
	let memoria = null;
	const leggi = () => {
		try { return JSON.parse(localStorage.getItem(CHIAVE)) || {}; } catch { return memoria || {}; }
	};
	const S = Object.assign({
		qty: 0,
		billing: clona(D.cartVuoto.billing_address),
		shipping: clona(D.cartVuoto.shipping_address),
		prossimo: D.primoOrdine,
		ordini: {},
	}, leggi());
	const salva = () => {
		memoria = S;
		try { localStorage.setItem(CHIAVE, JSON.stringify(S)); } catch { /* navigazione privata: resta in memoria */ }
		// come i cookie che manda il server: cart-fragments li confronta con la copia in sessionStorage
		const scade = S.qty ? '' : '; expires=Thu, 01 Jan 1970 00:00:00 GMT';
		document.cookie = 'woocommerce_items_in_cart=1; path=/' + scade;
		document.cookie = 'woocommerce_cart_hash=' + hash() + '; path=/' + scade;
	};
	const hash = () => (S.qty ? 'anteprima' + S.qty : '');

	/* ---------- Cifre come le scrive WooCommerce (35,00) ---------- */
	const cifra = (cent) => {
		const [i, d] = (cent / 100).toFixed(2).split('.');
		return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
	};
	const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

	/* ---------- Store API: il carrello come lo restituisce WooCommerce ---------- */
	const inZona = (paese) => D.zona.includes(paese);
	const DEST = ['address_1', 'address_2', 'city', 'state', 'postcode', 'country'];
	function carrello() {
		const q = S.qty;
		const c = clona(q ? D.cartPieno : D.cartVuoto);
		c.billing_address = Object.assign(c.billing_address, S.billing);
		c.shipping_address = Object.assign(c.shipping_address, S.shipping);
		if (!q) return c;
		const it = c.items[0];
		const tot = String(D.prezzo * q);
		it.quantity = q;
		it.totals.line_subtotal = it.totals.line_total = tot;
		c.totals.total_items = c.totals.total_price = tot;
		c.items_count = q;
		for (const p of c.shipping_rates) {
			DEST.forEach((k) => { p.destination[k] = S.shipping[k] ?? ''; });
			p.items.forEach((i) => { i.quantity = q; });
			if (!inZona(S.shipping.country)) p.shipping_rates = [];
			p.shipping_rates.forEach((r) => { r.meta_data = r.meta_data.map((m) => (m.key === 'Items' ? { ...m, value: `${it.name} &times; ${q}` } : m)); });
		}
		return c;
	}
	const intestazioni = () => Object.assign({}, D.intestazioni, { 'Nonce-Timestamp': String(Math.floor(Date.now() / 1000)), 'Cart-Hash': hash() });
	const errore = (stato, code, message) => [stato, { code, message, data: { status: stato } }];

	function storeApi(percorso, metodo, corpo) {
		const p = percorso.replace(/^\/?/, '/').replace(/\/$/, '');
		const risposta = () => [200, carrello()];
		switch (p) {
			case '/wc/store/v1/batch':
				return [207, { responses: (corpo.requests || []).map((r) => {
					const [status, body] = storeApi(r.path, r.method || 'POST', r.body || r.data || {});
					return { body, status, headers: intestazioni() };
				}) }];
			case '/wc/store/v1/cart':
				return risposta();
			case '/wc/store/v1/cart/add-item':
				S.qty += Number(corpo.quantity) || 1; salva(); return [201, carrello()];
			case '/wc/store/v1/cart/update-item':
				S.qty = Math.max(0, Number(corpo.quantity) || 0); salva(); return risposta();
			case '/wc/store/v1/cart/remove-item':
				S.qty = 0; salva(); return risposta();
			case '/wc/store/v1/cart/update-customer':
				if (corpo.billing_address) Object.assign(S.billing, corpo.billing_address);
				if (corpo.shipping_address) Object.assign(S.shipping, corpo.shipping_address);
				salva(); return risposta();
			case '/wc/store/v1/cart/select-shipping-rate':
			case '/wc/store/v1/cart/remove-coupon':
				return risposta();
			case '/wc/store/v1/cart/apply-coupon': {
				const codice = String(corpo.code || '').trim().toLowerCase();
				return errore(400, 'woocommerce_rest_cart_coupon_error', `Coupon &quot;${esc(codice)}&quot; cannot be applied because it does not exist.`);
			}
			case '/wc/store/v1/checkout':
				if (metodo === 'POST') return ordina(corpo);
				return [200, Object.assign(clona(D.checkoutRisposta), { order_id: 0, status: 'checkout-draft', payment_result: null })];
			default:
				return errore(404, 'rest_no_route', 'No route was found matching the URL and request method.');
		}
	}

	/* ---------- L'ordine: come il pagamento di prova del prototipo, senza addebito ---------- */
	function ordina(corpo) {
		if (!S.qty) return errore(400, 'woocommerce_rest_cart_empty', 'Cannot create order from empty cart.');
		if (corpo.billing_address) Object.assign(S.billing, corpo.billing_address);
		if (corpo.shipping_address) Object.assign(S.shipping, corpo.shipping_address);
		if (!inZona(S.shipping.country)) return errore(400, 'woocommerce_rest_invalid_shipping_option', 'Sorry, this order requires a shipping option.');
		const n = S.prossimo++;
		const key = 'wc_order_' + Math.random().toString(36).slice(2, 15);
		S.ordini[n] = { n, key, data: Date.now(), qty: S.qty, billing: clona(S.billing), shipping: clona(S.shipping), nota: corpo.customer_note || '' };
		S.qty = 0;
		salva();
		const r = clona(D.checkoutRisposta);
		const url = `${location.origin}${D.base}/checkout/order-received/?order=${n}&key=${key}`;
		Object.assign(r, { order_id: n, order_number: String(n), order_key: key, customer_note: corpo.customer_note || '', billing_address: clona(S.billing), shipping_address: clona(S.shipping) });
		r.payment_result = Object.assign(r.payment_result || {}, { payment_status: 'success', redirect_url: url });
		return [200, r];
	}

	/* ---------- Le chiamate di jQuery (wc-ajax): aggiunta, rimozione, frammenti ---------- */
	function frammenti() {
		const q = S.qty;
		const mini = q ? D.mini.pieno.replace('{{QTY}}', q).replace('{{SUBTOTALE}}', cifra(D.prezzo * q)) : D.mini.vuoto;
		return {
			fragments: {
				'div.widget_shopping_cart_content': `<div class="widget_shopping_cart_content">${mini}</div>`,
				'span.fomes-cart-count': `<span class="fomes-cart-count">${q}</span>`,
				'div.drawer__content': `<div class="drawer__content">${mini}</div>`,
			},
			cart_hash: hash(),
		};
	}
	function wcAjax(azione, dati) {
		if (azione === 'add_to_cart') S.qty += Math.max(1, Number(dati.get('quantity')) || 1);
		else if (azione === 'remove_from_cart') S.qty = 0;
		if (azione !== 'get_refreshed_fragments') salva();
		return frammenti();
	}
	function jq() {
		const $ = window.jQuery;
		if (!$ || $.__fomesAnteprima) return;
		$.__fomesAnteprima = true;
		$.ajaxTransport('+*', (o) => {
			const m = /[?&]wc-ajax=([a-z_]+)/.exec(o.url || '');
			if (!m) return undefined;
			return {
				send(_h, fatto) {
					setTimeout(() => fatto(200, 'success', { text: JSON.stringify(wcAjax(m[1], new URLSearchParams(typeof o.data === 'string' ? o.data : ''))) }), RITARDO);
				},
				abort() {},
			};
		});
	}
	jq();
	document.addEventListener('DOMContentLoaded', jq);

	/* ---------- Le chiamate della Store API (fetch dei blocchi Carrello e Pagamento) ---------- */
	const fetchVero = window.fetch.bind(window);
	window.fetch = (input, init = {}) => {
		const url = typeof input === 'string' ? input : (input && input.url) || String(input);
		const m = /\/wp-json\/(wc\/store\/v1\/[^?#]*)/.exec(url);
		if (!m) return fetchVero(input, init);
		const metodo = String(init.method || (input && input.method) || 'GET').toUpperCase();
		let corpo = {};
		try { corpo = init.body ? JSON.parse(init.body) : {}; } catch { corpo = {}; }
		const [stato, dati] = storeApi(m[1], metodo, corpo);
		return new Promise((ok) => setTimeout(() => ok(new Response(JSON.stringify(dati), {
			status: stato,
			headers: Object.assign({ 'Content-Type': 'application/json; charset=UTF-8' }, intestazioni()),
		})), RITARDO));
	};

	/* Il carrello precaricato nelle pagine Carrello e Pagamento: quello di questo browser */
	const precarica = (dati) => {
		if (dati && dati['/wc/store/v1/cart']) dati['/wc/store/v1/cart'] = { body: carrello(), headers: intestazioni() };
		return dati;
	};

	/* Pagamento a carrello vuoto: il server rimanda al carrello */
	const qui = location.pathname.replace(D.base, '');
	if (qui === '/checkout/' && !S.qty) location.replace(D.base + '/cart/');

	/* La scheda prodotto non c'è: rimanda allo shop della home (Esporta-Anteprima.mjs), come sul sito */
	document.addEventListener('DOMContentLoaded', () => {
		if (qui.startsWith('/checkout/order-received/')) ricevuta();
	});

	/* ---------- Ordine ricevuto: lo stesso markup della pagina di WooCommerce ---------- */
	function indirizzo(a, conEmail) {
		const paese = a.country || '';
		const dati = D.paesi[paese] || {};
		let f = dati.format || D.formatoIndirizzo;
		if (paese === D.paeseBase) f = f.replace('{country}', '');
		const stato = (dati.states && dati.states[a.state]) || a.state || '';
		const nomePaese = D.nomiPaesi[paese] || paese;
		const v = {
			first_name: a.first_name, last_name: a.last_name, name: [a.first_name, a.last_name].filter(Boolean).join(' '),
			company: a.company, address_1: a.address_1, address_2: a.address_2, city: a.city, state: stato,
			postcode: a.postcode, country: nomePaese, state_code: a.state,
		};
		const righe = f.replace(/\{(\w+?)(_upper)?\}/g, (_, k, up) => {
			const t = String(v[k] ?? '');
			return up ? t.toUpperCase() : t;
		}).split('\n').map((r) => r.trim()).filter(Boolean).map(esc);
		let h = righe.join('<br />');
		if (a.phone) h += `\n\t\t\t\t\t<p class="woocommerce-customer-details--phone">${esc(a.phone)}</p>`;
		if (conEmail && a.email) h += `\n\t\t\t\t\t<p class="woocommerce-customer-details--email">${esc(a.email)}</p>`;
		return h;
	}
	function ricevuta() {
		const box = document.querySelector('.woocommerce-order');
		if (!box) return;
		const par = new URLSearchParams(location.search);
		const o = S.ordini[par.get('order')];
		if (!o || o.key !== par.get('key')) { box.innerHTML = D.ricevuta.grazie; return; }
		const data = new Date(o.data).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
		let h = D.ricevuta.modello
			.replace(/\{\{NUMERO\}\}/g, o.n).replace(/\{\{DATA\}\}/g, data).replace(/\{\{TOTALE\}\}/g, cifra(D.prezzo * o.qty))
			.replace(/\{\{QTY\}\}/g, o.qty).replace(/\{\{EMAIL\}\}/g, esc(o.billing.email))
			.replace('{{FATTURAZIONE}}', indirizzo(o.billing, true)).replace('{{SPEDIZIONE}}', indirizzo(o.shipping, false));
		if (o.nota) h = h.replace('</tfoot>', `\t<tr>\n\t\t\t\t\t\t<th>Note:</th>\n\t\t\t\t\t\t<td>${esc(o.nota).replace(/\n/g, '<br />')}</td>\n\t\t\t\t\t</tr>\n\t\t\t\t</tfoot>`);
		box.innerHTML = h;
	}

	window.FOMES_ANTEPRIMA = { precarica, jq };
})();
