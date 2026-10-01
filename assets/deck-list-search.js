/*
 * Recherche par liste de cartes (Magic: The Gathering)
 *
 * Le client colle sa liste, chaque carte est cherchée dans la boutique via
 * la recherche Shopify (template alternatif `search.deck.liquid`, qui renvoie
 * du JSON), puis les résultats sont affichés avec prix, stock et un bouton
 * pour tout ajouter au panier.
 */
(function () {
  'use strict';

  /* ---------- Lecture de la liste ---------- */

  var HEADER_RE = /^(deck|main ?deck|mainboard|main|sideboard|side|commander|companion|maybeboard|considering|tokens?|lands?|creatures?|spells?|instants?|sorceries|artifacts?|enchantments?|planeswalkers?)\s*:?\s*(\(\d+\))?$/i;

  function normalize(s) {
    return String(s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/æ/g, 'ae')
      .replace(/['’‘`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // "Fire // Ice" -> "Fire"
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
      var key = normalize(card.name);
      if (byKey.has(key)) byKey.get(key).qty += card.qty;
      else byKey.set(key, card);
    });
    return Array.from(byKey.values());
  }

  /* ---------- Correspondance titre produit / nom de carte ---------- */

  // "Lightning Bolt [M10] - Foil" -> "Lightning Bolt"
  function cleanTitle(title) {
    return String(title)
      .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
      .split(/\s+[-–—|]\s+/)[0];
  }

  function titleMatches(title, name, loose) {
    var t = cleanTitle(title);
    if (normalize(t) === normalize(name)) return true;
    if (normalize(frontFace(t)) === normalize(frontFace(name))) return true;
    if (loose) {
      var padded = ' ' + normalize(title) + ' ';
      return padded.indexOf(' ' + normalize(frontFace(name)) + ' ') !== -1;
    }
    return false;
  }

  // Répartit la quantité demandée sur les variantes dispo, la moins chère d'abord.
  function allocate(variants, wanted) {
    var remaining = wanted;
    var sorted = variants.slice().sort(function (a, b) { return a.price - b.price; });
    var picks = new Map();
    sorted.forEach(function (v) {
      if (!v.available || remaining <= 0) return;
      var take = v.qty == null ? remaining : Math.min(remaining, Math.max(v.qty, 0));
      if (take > 0) {
        picks.set(v.id, take);
        remaining -= take;
      }
    });
    return picks;
  }

  var core = {
    normalize: normalize,
    frontFace: frontFace,
    parseLine: parseLine,
    parseDeckList: parseDeckList,
    cleanTitle: cleanTitle,
    titleMatches: titleMatches,
    allocate: allocate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = core;
    return;
  }

  /* ---------- Interface ---------- */

  var STORAGE_KEY = 'deck-list-search:last';
  var CONCURRENCY = 4;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pool(items, limit, worker) {
    var i = 0;
    var results = new Array(items.length);
    function next() {
      if (i >= items.length) return Promise.resolve();
      var idx = i++;
      return worker(items[idx], idx).then(function (r) {
        results[idx] = r;
        return next();
      });
    }
    var runners = [];
    for (var k = 0; k < Math.min(limit, items.length); k++) runners.push(next());
    return Promise.all(runners).then(function () { return results; });
  }

  function DeckListSearch(root) {
    this.root = root;
    this.form = root.querySelector('[data-dls-form]');
    this.textarea = root.querySelector('[data-dls-input]');
    this.status = root.querySelector('[data-dls-status]');
    this.results = root.querySelector('[data-dls-results]');
    this.submitBtn = root.querySelector('[data-dls-submit]');

    var d = root.dataset;
    this.searchUrl = d.searchUrl || '/search';
    this.cartAddUrl = (d.cartAddUrl || '/cart/add') + '.js';
    this.cartUrl = d.cartUrl || '/cart';
    this.loose = d.loose === 'true';
    this.showStock = d.showStock !== 'false';
    this.money = new Intl.NumberFormat(d.locale || 'fr', { style: 'currency', currency: d.currency || 'EUR' });

    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && !this.textarea.value) this.textarea.value = saved;
    } catch (e) { /* stockage indisponible */ }

    this.form.addEventListener('submit', this.onSubmit.bind(this));
    root.querySelector('[data-dls-clear]').addEventListener('click', this.onClear.bind(this));
    this.results.addEventListener('input', this.updateSummary.bind(this));
    this.results.addEventListener('click', this.onResultsClick.bind(this));
  }

  DeckListSearch.prototype.setStatus = function (msg, isError) {
    this.status.textContent = msg || '';
    this.status.classList.toggle('dls__status--error', !!isError);
  };

  DeckListSearch.prototype.onClear = function () {
    this.textarea.value = '';
    this.results.hidden = true;
    this.results.innerHTML = '';
    this.setStatus('');
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    this.textarea.focus();
  };

  DeckListSearch.prototype.search = function (name) {
    var params = new URLSearchParams({
      q: frontFace(name),
      type: 'product',
      view: 'deck',
      'options[prefix]': 'last',
      'options[unavailable_products]': 'last'
    });
    return fetch(this.searchUrl + '?' + params.toString(), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (text) {
        try {
          return JSON.parse(text).products || [];
        } catch (e) {
          throw new Error('template');
        }
      });
  };

  DeckListSearch.prototype.onSubmit = function (event) {
    event.preventDefault();
    var self = this;
    var cards = parseDeckList(this.textarea.value);
    if (!cards.length) {
      this.setStatus('Colle ta liste de cartes, une carte par ligne.', true);
      return;
    }
    try { window.localStorage.setItem(STORAGE_KEY, this.textarea.value); } catch (e) { /* ignore */ }

    this.submitBtn.disabled = true;
    var done = 0;
    this.setStatus('Recherche de ' + cards.length + ' cartes…');

    pool(cards, CONCURRENCY, function (card) {
      return self.search(card.name)
        .then(function (products) {
          var matched = products.filter(function (p) { return titleMatches(p.title, card.name, self.loose); });
          return { card: card, products: matched };
        })
        .catch(function (err) {
          return { card: card, products: [], error: err.message };
        })
        .then(function (res) {
          done++;
          self.setStatus('Recherche… ' + done + ' / ' + cards.length);
          return res;
        });
    }).then(function (results) {
      self.submitBtn.disabled = false;
      if (results.some(function (r) { return r.error === 'template'; })) {
        self.setStatus('Le template « search.deck » est absent du thème : la recherche ne peut pas fonctionner.', true);
        return;
      }
      self.render(results);
    });
  };

  DeckListSearch.prototype.variantLabel = function (product, variant) {
    var label = product.title;
    if (variant.title && variant.title !== 'Default Title') label += ' — ' + variant.title;
    return label;
  };

  DeckListSearch.prototype.stockLabel = function (variant) {
    if (!variant.available) return 'Épuisé';
    if (this.showStock && variant.qty != null) return variant.qty + ' en stock';
    return 'Disponible';
  };

  DeckListSearch.prototype.render = function (results) {
    var self = this;
    var found = [];
    var missing = [];

    results.forEach(function (r) {
      var variants = [];
      r.products.forEach(function (p) {
        p.variants.forEach(function (v) { variants.push({ product: p, variant: v }); });
      });
      var picks = allocate(variants.map(function (x) { return x.variant; }), r.card.qty);
      var have = 0;
      picks.forEach(function (n) { have += n; });

      if (!variants.some(function (x) { return x.variant.available; })) {
        missing.push(r);
      } else {
        found.push({ card: r.card, variants: variants, picks: picks, have: have });
      }
    });

    var html = '';

    html += '<div class="dls__summary">' +
      '<p class="dls__summary-text" data-dls-summary></p>' +
      '<button type="button" class="button" data-dls-add>Ajouter au panier</button>' +
      '</div>' +
      '<p class="dls__cart-msg" data-dls-cart-msg role="status" aria-live="polite"></p>';

    if (found.length) {
      html += '<h3 class="dls__heading">Disponibles (' + found.length + ')</h3><ul class="dls__cards">';
      found.forEach(function (f) {
        var state = f.have >= f.card.qty ? 'ok' : 'partial';
        html += '<li class="dls__card dls__card--' + state + '">' +
          '<div class="dls__card-head">' +
          '<span class="dls__card-name">' + esc(f.card.qty) + ' × ' + esc(f.card.name) + '</span>' +
          '<span class="dls__badge">' + (state === 'ok' ? 'Complet' : f.have + ' / ' + f.card.qty) + '</span>' +
          '</div><ul class="dls__variants">';

        f.variants
          .slice()
          .sort(function (a, b) {
            return (b.variant.available - a.variant.available) || (a.variant.price - b.variant.price);
          })
          .forEach(function (x) {
            var v = x.variant;
            var p = x.product;
            var max = v.qty != null && v.qty >= 0 ? ' max="' + v.qty + '"' : '';
            var img = p.image
              ? '<img src="' + esc(p.image) + '" alt="" width="48" height="67" loading="lazy">'
              : '<span class="dls__noimg"></span>';
            html += '<li class="dls__variant' + (v.available ? '' : ' dls__variant--soldout') + '">' +
              img +
              '<a class="dls__variant-title" href="' + esc(p.url) + '?variant=' + esc(v.id) + '" target="_blank" rel="noopener">' +
              esc(self.variantLabel(p, v)) + '</a>' +
              '<span class="dls__price">' + esc(self.money.format(v.price / 100)) + '</span>' +
              '<span class="dls__stock">' + esc(self.stockLabel(v)) + '</span>' +
              (v.available
                ? '<input class="dls__qty" type="number" inputmode="numeric" min="0"' + max +
                  ' value="' + (f.picks.get(v.id) || 0) + '" data-variant-id="' + esc(v.id) +
                  '" data-price="' + esc(v.price) + '" aria-label="Quantité pour ' + esc(self.variantLabel(p, v)) + '">'
                : '<span class="dls__qty dls__qty--none">—</span>') +
              '</li>';
          });

        html += '</ul></li>';
      });
      html += '</ul>';
    }

    if (missing.length) {
      var missingText = missing.map(function (r) { return r.card.qty + ' ' + r.card.name; }).join('\n');
      html += '<h3 class="dls__heading">Introuvables ou épuisées (' + missing.length + ')</h3>' +
        '<ul class="dls__missing">' +
        missing.map(function (r) {
          return '<li>' + esc(r.card.qty) + ' × ' + esc(r.card.name) +
            (r.error ? ' <small>(erreur de recherche)</small>' : '') + '</li>';
        }).join('') +
        '</ul>' +
        '<button type="button" class="button button--secondary" data-dls-copy="' + esc(missingText) + '">Copier la liste des cartes manquantes</button>';
    }

    this.results.innerHTML = html;
    this.results.hidden = false;
    this.setStatus(found.length + ' cartes trouvées sur ' + results.length + '.');
    this.updateSummary();
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
    var summary = this.results.querySelector('[data-dls-summary]');
    if (!summary) return;
    var items = this.selection();
    var count = 0;
    var total = 0;
    items.forEach(function (i) { count += i.quantity; total += i.quantity * i.price; });
    summary.textContent = count + (count > 1 ? ' cartes sélectionnées' : ' carte sélectionnée') +
      ' · Total : ' + this.money.format(total / 100);
    this.results.querySelector('[data-dls-add]').disabled = count === 0;
  };

  DeckListSearch.prototype.onResultsClick = function (event) {
    var addBtn = event.target.closest('[data-dls-add]');
    if (addBtn) return this.addToCart(addBtn);

    var copyBtn = event.target.closest('[data-dls-copy]');
    if (copyBtn && navigator.clipboard) {
      navigator.clipboard.writeText(copyBtn.dataset.dlsCopy).then(function () {
        copyBtn.textContent = 'Liste copiée !';
      });
    }
  };

  DeckListSearch.prototype.addToCart = function (btn) {
    var self = this;
    var msg = this.results.querySelector('[data-dls-cart-msg]');
    var items = this.selection().map(function (i) { return { id: i.id, quantity: i.quantity }; });
    if (!items.length) return;

    btn.disabled = true;
    msg.classList.remove('dls__cart-msg--error');
    msg.textContent = 'Ajout au panier…';

    fetch(this.cartAddUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: items })
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.description || data.message || 'Erreur');
          return data;
        });
      })
      .then(function () {
        msg.innerHTML = 'Cartes ajoutées au panier. <a href="' + esc(self.cartUrl) + '">Voir le panier</a>';
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
      })
      .catch(function (err) {
        msg.classList.add('dls__cart-msg--error');
        msg.textContent = 'Impossible d’ajouter au panier : ' + err.message;
      })
      .then(function () { btn.disabled = false; });
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
