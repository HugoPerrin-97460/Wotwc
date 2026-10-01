const test = require('node:test');
const assert = require('node:assert/strict');
const dls = require('../assets/deck-list-search.js');
// Extrait réel du catalogue de la boutique (titres FR/EN mélangés, handle toujours en anglais).
const catalog = require('./fixtures/catalog.json');

test('lit les formats courants', () => {
  const list = dls.parseDeckList([
    'Deck',
    '4 Lightning Bolt',
    '4x Counterspell',
    'Brainstorm x3',
    '1 Fire // Ice (MH2) 290',
    "2 Urza's Saga [MH2] *F*",
    'Snapcaster Mage',
    '',
    '// commentaire',
    'Sideboard',
    'SB: 2 Pyroblast',
    '1 Lightning Bolt',
  ].join('\n'));
  assert.deepEqual(list, [
    { name: 'Lightning Bolt', qty: 5 },
    { name: 'Counterspell', qty: 4 },
    { name: 'Brainstorm', qty: 3 },
    { name: 'Fire // Ice', qty: 1 },
    { name: "Urza's Saga", qty: 2 },
    { name: 'Snapcaster Mage', qty: 1 },
    { name: 'Pyroblast', qty: 2 },
  ]);
});

test('ne confond pas un nom commençant par X avec une quantité', () => {
  assert.deepEqual(dls.parseLine('4 Xenagos, God of Revels'), { name: 'Xenagos, God of Revels', qty: 4 });
});

test('déduit le nom anglais du handle', () => {
  const cases = [
    ['chaos-warp-commander-marvel-super-heroes-extras-rare-359-893236', ['Commander: Marvel Super Heroes: Extras', 'English', 'Rare'], 'chaos-warp'],
    ['arcbound-worker-darksteel-common-104', ['Common', 'Darksteel', 'French'], 'arcbound-worker'],
    ['prossh-skyraider-of-kher-v-1-commander-2013-mythic-204-264383', ['Commander 2013', 'Mythic'], 'prossh-skyraider-of-kher'],
    ['cannibalize-stronghold-common-9088', ['Common', 'Stronghold'], 'cannibalize'],
    ['aang-s-journey-magic-the-gathering-avatar-the-last-airbender-common-1-842843', ['Avatar: The Last Airbender (Magic)', 'Common'], 'aang-s-journey'],
    ['aven-mindcensor-promos-rare-1-573238', ['Promos (Magic)', 'Rare'], 'aven-mindcensor'],
    ['icatian-javelineers-time-spiral-time-shifted', ['Time Shifted', 'Time Spiral'], 'icatian-javelineers'],
    ['commander-s-sphere-commander-lorwyn-eclipsed-common-139-1', ['Commander: Lorwyn Eclipsed', 'Common'], 'commander-s-sphere'],
  ];
  for (const [handle, tags, expected] of cases) assert.equal(dls.handleName(handle, tags), expected, handle);
});

test('retrouve les cartes du vrai catalogue par nom anglais ou français', () => {
  const index = dls.buildIndex(catalog);
  const titles = (name) => dls.findProducts(index, catalog, name, false).map((p) => p.t);

  assert.deepEqual(titles('Chaos Warp'), [
    'Distorsion chaotique - Commander: Marvel Super Heroes: Extras (Rare) [XMSC-359]',
    'Distorsion chaotique - Commander 2013 (Rare) [C13-133]',
  ]);
  assert.equal(titles('distorsion chaotique').length, 2);
  assert.deepEqual(titles('Thriving Moor'), ['Lande prospère - Commander: Marvel Super Heroes: Extras (Common) [XMSC-582]']);
  assert.equal(titles("Thalia's Lancers").length, 1);
  assert.equal(titles('Thalias Lancers').length, 1);
  assert.equal(titles("Sif's Spearmaster").length, 1);
  assert.equal(titles('Prossh, Skyraider of Kher').length, 1);
  assert.equal(titles('Tom, Bert, and William').length, 1);
  assert.equal(titles('Whoosh!').length, 1);
  assert.equal(titles("Aang's Journey").length, 1);
  assert.equal(titles('Giant-Man, Gargantuan Genius').length, 1);
  assert.equal(titles('Iron Myr').length, 1);
  assert.equal(titles('Iron').length, 0);
  assert.equal(titles('Lightning Bolt').length, 0);
});

test('répartit la quantité : langue préférée puis prix', () => {
  const variants = [
    { id: 1, t: 'Anglais / Near Mint / Régulière', p: 300, a: true, q: 5 },
    { id: 2, t: 'Français / Good / Régulière', p: 100, a: true, q: 1 },
    { id: 3, t: 'Français / Near Mint / Régulière', p: 50, a: false, q: 0 },
    { id: 4, t: 'Anglais / Played / Régulière', p: 200, a: true, q: null },
  ];
  assert.deepEqual([...dls.allocate(variants, 4)], [[2, 1], [4, 3]]);
  assert.deepEqual([...dls.allocate(variants, 4, 'anglais')], [[4, 4]]);
  assert.deepEqual([...dls.allocate(variants, 4, 'francais')], [[2, 1], [4, 3]]);
});

test('ne réserve pas deux fois le même exemplaire', () => {
  const variants = [{ id: 1, t: 'Français / Near Mint / Régulière', p: 20, a: true, q: 1 }];
  const used = new Map();
  assert.deepEqual([...dls.allocate(variants, 2, '', used)], [[1, 1]]);
  assert.deepEqual([...dls.allocate(variants, 1, '', used)], []);
});
