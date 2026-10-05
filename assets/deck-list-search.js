/*
 * Recherche par liste de cartes (Magic: The Gathering)
 *
 * Le client colle sa liste. Le catalogue est chargé une fois via le template
 * alternatif `collection.deck.liquid` (JSON), puis chaque carte est retrouvée :
 *  - par son nom anglais, déduit du handle produit
 *    (« chaos-warp-commander-marvel-super-heroes-extras-rare-359-893236 » → « chaos warp »),
 *  - ou par le nom affiché dans le titre (« Distorsion chaotique - … » → « distorsion chaotique »).
 * Les exemplaires dispo s'affichent avec prix et stock, et tout s'ajoute au panier en un clic.
 */
(function () {
  'use strict';

  /* ---------- Lecture de la liste ---------- */

  var HEADER_RE = /^(deck|main ?deck|mainboard|main|sideboard|side|commander|companion|maybeboard|considering|tokens?|lands?|creatures?|spells?|instants?|sorceries|artifacts?|enchantments?|planeswalkers?|battles?)\s*:?\s*(\(\d+\))?$/i;

  function normalize(s) {
    return String(s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/æ/g, 'ae')
      .replace(/œ/g, 'oe')
      .replace(/['’‘`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Clé de comparaison sans espaces : « Thalia's Lancers » et « thalia-s-lancers » → « thaliaslancers »
  function key(s) {
    return normalize(s).replace(/ /g, '');
  }

  // « Commander: Marvel Super Heroes: Extras » → « commander-marvel-super-heroes-extras »
  function slugify(s) {
    return normalize(String(s).replace(/['’]/g, ' ')).replace(/ /g, '-');
  }

  // « Fire // Ice » → « Fire »
  function frontFace(name) {
    return String(name).split(/\s*\/{1,2}\s*/)[0].trim();
  }

  function parseLine(raw) {
    var line = String(raw).replace(/\s+/g, ' ').trim();
    if (!line || /^(\/\/|#)/.test(line) || HEADER_RE.test(line)) return null;

    line = line.replace(/^SB:\s*/i, '');

    var qty = 1;
    var m;
    if ((m = line.match(/^(\d+)\s*x?\s+(.+)$/i))) {
      qty = parseInt(m[1], 10);
      line = m[2];
    } else if ((m = line.match(/^(.+?)\s+x\s?(\d+)$/i))) {
      qty = parseInt(m[2], 10);
      line = m[1];
    }

    line = line
      .replace(/\s+\*[a-z]+\*$/i, '')                        // marqueur foil : *F*
      .replace(/\s+[(\[][^)\]]*[)\]](\s+[\w-]+)?$/, '')      // édition : (M10) 146 ou [M10]
      .trim();

    if (!line || !(qty > 0)) return null;
    return { name: line, qty: qty };
  }

  // Retourne [{ name, qty }] en fusionnant les doublons (main + sideboard).
  function parseDeckList(text) {
    var byKey = new Map();
    String(text).split(/\r?\n/).forEach(function (raw) {
      var card = parseLine(raw);
      if (!card) return;
      var k = key(card.name);
      if (byKey.has(k)) byKey.get(k).qty += card.qty;
      else byKey.set(k, card);
    });
    return Array.from(byKey.values());
  }

  /* ---------- Noms d'un produit ---------- */

  var RARITIES = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus', 'land', 'basic-land', 'token', 'promo', 'time-shifted'];

  // « Distorsion chaotique - Commander: … (Rare) [XMSC-359] » → « Distorsion chaotique »
  function titleName(title) {
    return String(title)
      .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
      .split(/\s+[-–—|]\s+/)[0]
      .trim();
  }

  // handle = <nom anglais>[-v-N]-<extension>-<rareté>[-numéro][-id]
  // L'extension et la rareté sont retrouvées grâce aux tags du produit.
  function handleName(handle, tags) {
    var h = String(handle);
    var slugs = (tags || []).map(slugify);

    var rarity = RARITIES.filter(function (r) { return slugs.indexOf(r) !== -1; })
      .sort(function (a, b) { return b.length - a.length; })[0];
    if (!rarity) return null;
    var at = h.lastIndexOf('-' + rarity + '-');
    if (at === -1 && h.slice(-rarity.length - 1) === '-' + rarity) at = h.length - rarity.length - 1;
    if (at <= 0) return null;
    h = h.slice(0, at);

    // Tags d'extension tels quels, ou sans le suffixe « (Magic) » : « Promos (Magic) » → « promos »
    var sets = [];
    (tags || []).forEach(function (t) {
      sets.push(slugify(t), slugify(String(t).replace(/\s*\([^)]*\)\s*$/, '')));
    });
    var set = sets
      .filter(function (s) { return s && h.slice(-s.length - 1) === '-' + s; })
      .sort(function (a, b) { return b.length - a.length; })[0];
    if (!set) return null;
    h = h.slice(0, -set.length - 1)
      .replace(/-magic-the-gathering$/, '')
      .replace(/-v-\d+$/, '');

    return h || null;
  }

  // « Frodo Sacquet - Le Seigneur des Anneaux (Uncommon) [LTR-205] » →
  // { name: 'Frodo Sacquet', set: 'Le Seigneur des Anneaux', code: 'LTR-205' }
  function printingInfo(title) {
    var t = String(title);
    var code = (t.match(/\[([^\]]+)\]\s*$/) || [])[1] || '';
    var parts = t.split(/\s+[-–—|]\s+/);
    var set = parts.slice(1).join(' - ')
      .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { name: titleName(t), set: set, code: code };
  }

  function productKeys(p) {
    var keys = new Set();
    var t = titleName(p.t);
    keys.add(key(t));
    keys.add(key(frontFace(t)));
    var en = handleName(p.h, p.g);
    if (en) keys.add(key(en));
    keys.delete('');
    return keys;
  }

  function buildIndex(products) {
    var index = new Map();
    products.forEach(function (p) {
      productKeys(p).forEach(function (k) {
        if (!index.has(k)) index.set(k, []);
        if (index.get(k).indexOf(p) === -1) index.get(k).push(p);
      });
    });
    return index;
  }

  function findProducts(index, products, name, loose) {
    var found = [];
    function add(list) {
      (list || []).forEach(function (p) { if (found.indexOf(p) === -1) found.push(p); });
    }
    add(index.get(key(name)));
    add(index.get(key(frontFace(name))));

    if (loose && !found.length) {
      var needle = ' ' + normalize(frontFace(name)) + ' ';
      add(products.filter(function (p) {
        var en = handleName(p.h, p.g);
        return (' ' + normalize(p.t) + ' ').indexOf(needle) !== -1 ||
          (en && (' ' + normalize(en) + ' ').indexOf(needle) !== -1);
      }));
    }
    return found;
  }

  /* ---------- Répartition des quantités ---------- */

  // « Français / Near Mint / Régulière » → « francais »
  function variantLanguage(variantTitle) {
    return normalize(String(variantTitle).split('/')[0]);
  }

  function variantOrder(lang) {
    return function (a, b) {
      if (lang) {
        var pa = variantLanguage(a.t) === lang ? 0 : 1;
        var pb = variantLanguage(b.t) === lang ? 0 : 1;
        if (pa !== pb) return pa - pb;
      }
      return a.p - b.p;
    };
  }

  // Répartit la quantité demandée sur les variantes dispo :
  // langue préférée d'abord, puis la moins chère.
  // `used` (facultatif) garde le stock déjà pris par les lignes précédentes de la liste,
  // pour ne pas réserver deux fois le même exemplaire (ex. « Thriving Moor » + « Lande prospère »).
  function allocate(variants, wanted, lang, used) {
    var remaining = wanted;
    var picks = new Map();
    variants.slice().sort(variantOrder(lang)).forEach(function (v) {
      if (!v.a || remaining <= 0 || picks.has(v.id)) return;
      var already = used ? used.get(v.id) || 0 : 0;
      var take = v.q == null ? remaining : Math.min(remaining, Math.max(v.q - already, 0));
      if (take > 0) {
        picks.set(v.id, take);
        if (used) used.set(v.id, already + take);
        remaining -= take;
      }
    });
    return picks;
  }

  var core = {
    normalize: normalize,
    key: key,
    slugify: slugify,
    frontFace: frontFace,
    parseLine: parseLine,
    parseDeckList: parseDeckList,
    titleName: titleName,
    printingInfo: printingInfo,
    handleName: handleName,
    buildIndex: buildIndex,
    findProducts: findProducts,
    variantLanguage: variantLanguage,
    allocate: allocate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = core;
    return;
  }

  /* ---------- Interface ---------- */

  // Ancienne clé : la liste collée était gardée d'une visite à l'autre. On l'efface.
  var OLD_LIST_KEY = 'deck-list-search:last';
  var CACHE_TTL = 10 * 60 * 1000;
  var CONCURRENCY = 4;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function store(kind, k, value) {
    try {
      var s = window[kind];
      if (value === undefined) return s.getItem(k);
      if (value === null) s.removeItem(k);
      else s.setItem(k, value);
    } catch (e) { /* stockage indisponible ou plein */ }
    return null;
  }

  function DeckListSearch(root) {
    this.root = root;
    this.form = root.querySelector('[data-dls-form]');
    this.textarea = root.querySelector('[data-dls-input]');
    this.langSelect = root.querySelector('[data-dls-lang]');
    this.status = root.querySelector('[data-dls-status]');
    this.results = root.querySelector('[data-dls-results]');
    this.submitBtn = root.querySelector('[data-dls-submit]');

    var d = root.dataset;
    this.catalogUrl = d.catalogUrl || '/collections/all';
    this.productsUrl = d.productsUrl || '/products/';
    this.cartAddUrl = (d.cartAddUrl || '/cart/add') + '.js';
    this.cartUrl = d.cartUrl || '/cart';
    this.loose = d.loose === 'true';
    this.showStock = d.showStock !== 'false';
    this.money = new Intl.NumberFormat(d.locale || 'fr', { style: 'currency', currency: d.currency || 'EUR' });
    this.catalog = null;

    store('localStorage', OLD_LIST_KEY, null);
    this.textarea.value = '';

    // Retour sur la page via « Précédent » : le navigateur peut restaurer la page telle
    // quelle (cache) ou remettre le texte dans le champ. On repart d'un formulaire vide,
    // sauf si le visiteur a déjà commencé à taper pendant le chargement.
    var typed = false;
    this.textarea.addEventListener('input', function () { typed = true; });
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) this.reset();
      else if (!typed) this.textarea.value = '';
    }.bind(this));

    this.form.addEventListener('submit', this.onSubmit.bind(this));
    root.querySelector('[data-dls-clear]').addEventListener('click', this.onClear.bind(this));
    this.results.addEventListener('input', this.updateSummary.bind(this));
    this.results.addEventListener('change', function (event) {
      var input = event.target.closest('[data-variant-id]');
      if (!input) return;
      var max = input.max === '' ? Infinity : Number(input.max);
      input.value = Math.max(0, Math.min(max, parseInt(input.value, 10) || 0));
      this.updateSummary();
    }.bind(this));
    this.results.addEventListener('click', this.onResultsClick.bind(this));
  }

  DeckListSearch.prototype.setStatus = function (msg, isError) {
    this.status.textContent = msg || '';
    this.status.classList.toggle('dls__status--error', !!isError);
  };

  DeckListSearch.prototype.reset = function () {
    this.textarea.value = '';
    this.results.hidden = true;
    this.results.innerHTML = '';
    this.setStatus('');
  };

  DeckListSearch.prototype.onClear = function () {
    this.reset();
    this.textarea.focus();
  };

  DeckListSearch.prototype.fetchPage = function (page) {
    var url = this.catalogUrl + '?view=deck&page=' + page;
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (text) {
        try {
          return JSON.parse(text);
        } catch (e) {
          throw new Error('template');
        }
      });
  };

  // Charge tout le catalogue (pages de 250 produits), avec cache de 10 min dans la session.
  DeckListSearch.prototype.loadCatalog = function () {
    var self = this;
    if (this.catalog) return Promise.resolve(this.catalog);

    var cacheKey = 'deck-list-search:catalog:' + this.catalogUrl;
    var cached = store('sessionStorage', cacheKey);
    if (cached) {
      try {
        var c = JSON.parse(cached);
        if (Date.now() - c.at < CACHE_TTL) return Promise.resolve(this.setCatalog(c.products));
      } catch (e) { /* cache illisible */ }
    }

    this.setStatus('Chargement du catalogue…');
    return this.fetchPage(1).then(function (first) {
      var pages = Math.max(1, first.pages || 1);
      var all = [first.products];
      var todo = [];
      for (var p = 2; p <= pages; p++) todo.push(p);
      var loaded = 1;

      var i = 0;
      function next() {
        if (i >= todo.length) return Promise.resolve();
        var page = todo[i++];
        return self.fetchPage(page).then(function (res) {
          all[page - 1] = res.products;
          loaded++;
          self.setStatus('Chargement du catalogue… ' + loaded + ' / ' + pages);
          return next();
        });
      }
      var runners = [];
      for (var k = 0; k < Math.min(CONCURRENCY, todo.length); k++) runners.push(next());

      return Promise.all(runners).then(function () {
        var products = [].concat.apply([], all);
        store('sessionStorage', cacheKey, JSON.stringify({ at: Date.now(), products: products }));
        return self.setCatalog(products);
      });
    });
  };

  DeckListSearch.prototype.setCatalog = function (products) {
    this.catalog = { products: products, index: buildIndex(products) };
    return this.catalog;
  };

  DeckListSearch.prototype.onSubmit = function (event) {
    event.preventDefault();
    var self = this;
    var cards = parseDeckList(this.textarea.value);
    if (!cards.length) {
      this.setStatus('Colle ta liste de cartes, une carte par ligne.', true);
      return;
    }

    this.submitBtn.disabled = true;
    this.loadCatalog()
      .then(function (catalog) {
        var results = cards.map(function (card) {
          return { card: card, products: findProducts(catalog.index, catalog.products, card.name, self.loose) };
        });
        self.render(results);
      })
      .catch(function (err) {
        self.setStatus(err.message === 'template'
          ? 'Le template « collection.deck » est absent du thème : la recherche ne peut pas fonctionner.'
          : 'Impossible de charger le catalogue (' + err.message + '). Réessaie dans un instant.', true);
      })
      .then(function () { self.submitBtn.disabled = false; });
  };

  DeckListSearch.prototype.variantLabel = function (product, variant) {
    var label = product.t;
    if (variant.t && variant.t !== 'Default Title') label += ' — ' + variant.t;
    return label;
  };

  DeckListSearch.prototype.stockLabel = function (variant) {
    if (!variant.a) return 'Épuisé';
    if (this.showStock && variant.q != null) return variant.q + ' en stock';
    return 'Disponible';
  };

  DeckListSearch.prototype.render = function (results) {
    var self = this;
    var lang = this.langSelect ? this.langSelect.value : '';
    var byLangAndPrice = variantOrder(lang);
    var order = function (a, b) {
      return (b.variant.a - a.variant.a) || byLangAndPrice(a.variant, b.variant);
    };

    var found = [];
    var missing = [];
    var used = new Map();

    results.forEach(function (r) {
      var rows = [];
      r.products.forEach(function (p) {
        p.v.forEach(function (v) { rows.push({ product: p, variant: v }); });
      });
      var picks = allocate(rows.map(function (x) { return x.variant; }), r.card.qty, lang, used);
      var have = 0;
      picks.forEach(function (n) { have += n; });

      if (!rows.some(function (x) { return x.variant.a; })) missing.push(r);
      else found.push({ card: r.card, rows: rows.sort(order), picks: picks, have: have });
    });

    var html = '';

    if (found.length) {
      html += '<h3 class="dls__heading">Disponibles (' + found.length + ')</h3><ul class="dls__cards">';
      found.forEach(function (f) {
        var state = f.have >= f.card.qty ? 'ok' : 'partial';
        var shown = f.rows.filter(function (x) { return f.picks.get(x.variant.id); });
        var others = f.rows.filter(function (x) { return !f.picks.get(x.variant.id); });

        html += '<li class="dls__card dls__card--' + state + '">' +
          '<div class="dls__card-head">' +
          '<span class="dls__card-name">' + esc(f.card.qty) + ' × ' + esc(f.card.name) + '</span>' +
          '<span class="dls__badge">' + (state === 'ok' ? 'Complet' : f.have + ' / ' + f.card.qty) + '</span>' +
          '</div><ul class="dls__variants">';
        shown.forEach(function (x) { html += self.variantRow(x, f.picks, false); });
        others.forEach(function (x) { html += self.variantRow(x, f.picks, true); });
        html += '</ul>';
        if (others.length) {
          var moreLabel = 'Voir ' + others.length + (others.length > 1 ? ' autres exemplaires' : ' autre exemplaire');
          html += '<button type="button" class="dls__more" data-dls-more aria-expanded="false" data-label="' +
            esc(moreLabel) + '">' + esc(moreLabel) + '</button>';
        }
        html += '</li>';
      });
      html += '</ul>';
    }

    if (missing.length) {
      var missingText = missing.map(function (r) { return r.card.qty + ' ' + r.card.name; }).join('\n');
      html += '<h3 class="dls__heading">Introuvables ou épuisées (' + missing.length + ')</h3>' +
        '<ul class="dls__missing">' +
        missing.map(function (r) { return '<li>' + esc(r.card.qty) + ' × ' + esc(r.card.name) + '</li>'; }).join('') +
        '</ul>' +
        '<button type="button" class="button-secondary dls__copy" data-dls-copy="' + esc(missingText) + '">Copier la liste des cartes manquantes</button>';
    }

    // Barre collée en bas de l'écran tant que les résultats sont visibles.
    if (found.length) {
      html += '<div class="dls__summary">' +
        '<div class="dls__summary-main">' +
        '<p class="dls__summary-text" data-dls-summary></p>' +
        '<button type="button" class="button" data-dls-add>Ajouter au panier</button>' +
        '</div>' +
        '<p class="dls__cart-msg" data-dls-cart-msg role="status" aria-live="polite"></p>' +
        '</div>';
    }

    this.results.innerHTML = html;
    this.results.hidden = false;
    this.setStatus(found.length + (found.length > 1 ? ' cartes trouvées' : ' carte trouvée') + ' sur ' + results.length + '.');
    this.updateSummary();
    // Sur mobile, les résultats sont sous le formulaire : on les amène à l'écran.
    if (this.status.scrollIntoView) this.status.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  DeckListSearch.prototype.variantRow = function (x, picks, extra) {
    var v = x.variant;
    var p = x.product;
    var info = printingInfo(p.t);
    var details = [info.code].concat(v.t && v.t !== 'Default Title' ? v.t.split(/\s*\/\s*/) : [])
      .filter(Boolean).join(' · ');
    var max = v.q != null && v.q >= 0 ? v.q : '';
    var qty = picks.get(v.id) || 0;
    var label = this.variantLabel(p, v);
    var img = p.i
      ? '<img src="' + esc(p.i) + '" alt="" width="40" height="56" loading="lazy">'
      : '<span class="dls__noimg"></span>';

    return '<li class="dls__variant' + (v.a ? '' : ' dls__variant--soldout') + '"' + (extra ? ' data-dls-extra hidden' : '') + '>' +
      img +
      '<div class="dls__variant-info">' +
      '<a class="dls__variant-title" href="' + esc(this.productsUrl + p.h) + '?variant=' + esc(v.id) +
      '" target="_blank" rel="noopener" title="' + esc(label) + '">' +
      esc(info.name) + (info.set ? ' <span class="dls__set">— ' + esc(info.set) + '</span>' : '') + '</a>' +
      (details ? '<span class="dls__details">' + esc(details) + '</span>' : '') +
      '<span class="dls__price-line"><span class="dls__price">' + esc(this.money.format(v.p / 100)) + '</span> ' +
      '<span class="dls__stock">' + esc(this.stockLabel(v)) + '</span></span>' +
      '</div>' +
      (v.a
        ? '<div class="dls__stepper">' +
          '<button type="button" class="dls__step" data-dls-step="-1" aria-label="Retirer un exemplaire">−</button>' +
          '<input class="dls__qty" type="number" inputmode="numeric" pattern="[0-9]*" min="0"' +
          (max !== '' ? ' max="' + max + '"' : '') +
          ' value="' + qty + '" data-variant-id="' + esc(v.id) + '" data-price="' + esc(v.p) + '"' +
          ' aria-label="Quantité pour ' + esc(label) + '">' +
          '<button type="button" class="dls__step" data-dls-step="1" aria-label="Ajouter un exemplaire">+</button>' +
          '</div>'
        : '<span class="dls__soldout">Épuisé</span>') +
      '</li>';
  };

  DeckListSearch.prototype.selection = function () {
    var items = [];
    this.results.querySelectorAll('[data-variant-id]').forEach(function (input) {
      var q = parseInt(input.value, 10);
      if (q > 0) items.push({ id: Number(input.dataset.variantId), quantity: q, price: Number(input.dataset.price) });
    });
    return items;
  };

  DeckListSearch.prototype.updateSummary = function () {
    var count = 0;
    var total = 0;
    this.selection().forEach(function (i) { count += i.quantity; total += i.quantity * i.price; });
    var text = count + (count > 1 ? ' cartes' : ' carte') + ' · ' + this.money.format(total / 100);
    this.results.querySelectorAll('[data-dls-summary]').forEach(function (el) { el.textContent = text; });
    this.results.querySelectorAll('[data-dls-add]').forEach(function (btn) { btn.disabled = count === 0; });
  };

  DeckListSearch.prototype.onResultsClick = function (event) {
    var addBtn = event.target.closest('[data-dls-add]');
    if (addBtn) return this.addToCart(addBtn);

    if (event.target.closest('[data-dls-open-cart]')) return this.openCart();

    var step = event.target.closest('[data-dls-step]');
    if (step) {
      var input = step.parentNode.querySelector('[data-variant-id]');
      var max = input.max === '' ? Infinity : Number(input.max);
      var next = (parseInt(input.value, 10) || 0) + Number(step.dataset.dlsStep);
      input.value = Math.max(0, Math.min(max, next));
      return this.updateSummary();
    }

    var more = event.target.closest('[data-dls-more]');
    if (more) {
      var open = more.getAttribute('aria-expanded') !== 'true';
      more.closest('.dls__card').querySelectorAll('[data-dls-extra]').forEach(function (li) { li.hidden = !open; });
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Masquer les autres exemplaires' : more.dataset.label;
      return;
    }

    var copyBtn = event.target.closest('[data-dls-copy]');
    if (copyBtn && navigator.clipboard) {
      navigator.clipboard.writeText(copyBtn.dataset.dlsCopy).then(function () {
        copyBtn.textContent = 'Liste copiée !';
      });
    }
  };

  // Ajoute via les actions standard Shopify quand le thème les fournit (Horizon) :
  // la pastille et le tiroir du panier se mettent alors à jour tout seuls.
  // Sinon, repli sur l'API Ajax /cart/add.js.
  DeckListSearch.prototype.postToCart = function (items) {
    var actions = window.Shopify && window.Shopify.actions;
    if (actions && actions.updateCart) {
      return actions.updateCart(
        { lines: items.map(function (i) { return { merchandiseId: String(i.id), quantity: i.quantity }; }) },
        { event: { context: 'standard-action' } }
      ).then(function (res) {
        var errors = (res && res.userErrors) || [];
        if (errors.length) throw new Error(errors.map(function (e) { return e.message; }).join(' '));
        return res;
      });
    }
    return fetch(this.cartAddUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.description || data.message || 'Erreur');
        return data;
      });
    });
  };

  DeckListSearch.prototype.openCart = function () {
    var actions = window.Shopify && window.Shopify.actions;
    if (actions && actions.openCart) actions.openCart();
    else window.location.href = this.cartUrl;
  };

  DeckListSearch.prototype.addToCart = function (btn) {
    var self = this;
    var msgs = this.results.querySelectorAll('[data-dls-cart-msg]');
    var buttons = this.results.querySelectorAll('[data-dls-add]');
    var items = this.selection().map(function (i) { return { id: i.id, quantity: i.quantity }; });
    if (!items.length) return;

    function say(html, isError) {
      msgs.forEach(function (m) {
        m.classList.toggle('dls__cart-msg--error', !!isError);
        m.innerHTML = html;
      });
    }

    buttons.forEach(function (b) { b.disabled = true; });
    say('Ajout au panier…');

    this.postToCart(items)
      .then(function () {
        say('Cartes ajoutées au panier. <button type="button" data-dls-open-cart>Voir le panier</button>');
      })
      .catch(function (err) {
        say(esc('Impossible d’ajouter au panier : ' + err.message), true);
      })
      .then(function () { self.updateSummary(); });
  };

  function init() {
    document.querySelectorAll('[data-dls]').forEach(function (root) {
      if (!root.dlsInstance) root.dlsInstance = new DeckListSearch(root);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // Éditeur de thème : réinitialise quand la section est ajoutée / modifiée.
  document.addEventListener('shopify:section:load', init);
})();
