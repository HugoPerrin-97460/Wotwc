const test = require('node:test');
const assert = require('node:assert/strict');
const dls = require('../assets/deck-list-search.js');

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

test('correspondance des titres produit', () => {
  assert.ok(dls.titleMatches('Lightning Bolt', 'Lightning Bolt'));
  assert.ok(dls.titleMatches('Lightning Bolt [M10] - Foil', 'lightning bolt'));
  assert.ok(dls.titleMatches('Fire // Ice (MH2)', 'Fire // Ice'));
  assert.ok(dls.titleMatches('Fire', 'Fire // Ice'));
  assert.ok(dls.titleMatches('Urzas Saga', "Urza's Saga"));
  assert.ok(dls.titleMatches('Æther Vial', 'Aether Vial'));
  assert.ok(!dls.titleMatches('Shock Troops', 'Shock'));
  assert.ok(!dls.titleMatches('Lot Lightning Bolt FR', 'Lightning Bolt'));
  assert.ok(dls.titleMatches('Lot Lightning Bolt FR', 'Lightning Bolt', true));
  assert.ok(!dls.titleMatches('Shock Troops', 'Shock Trooper', true));
});

test('répartit la quantité sur les variantes les moins chères', () => {
  const picks = dls.allocate([
    { id: 1, price: 300, available: true, qty: 5 },
    { id: 2, price: 100, available: true, qty: 1 },
    { id: 3, price: 50, available: false, qty: 0 },
    { id: 4, price: 200, available: true, qty: null },
  ], 4);
  assert.deepEqual([...picks], [[2, 1], [4, 3]]);
});
