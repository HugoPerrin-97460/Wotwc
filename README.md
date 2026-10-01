# Wotwc

Code du thème Shopify de la boutique de cartes Magic.

## Recherche par liste de cartes

Une page où le client colle sa liste de deck (une carte par ligne) : chaque carte est
cherchée dans la boutique, les exemplaires disponibles s'affichent avec prix et stock,
et tout peut être ajouté au panier en un clic. Les cartes absentes ou épuisées sont
listées à part (avec un bouton pour copier la liste).

Les noms peuvent être en **anglais ou en français**, quelle que soit la langue du titre produit :
le nom anglais est déduit du *handle* (`chaos-warp-commander-…-rare-359-893236` → Chaos Warp),
le nom français vient du titre (`Distorsion chaotique - Commander … (Rare) [XMSC-359]`).

Formats acceptés : `4 Lightning Bolt`, `4x Lightning Bolt`, `Lightning Bolt x4`,
export Arena/MTGO/Moxfield (`1 Fire // Ice (MH2) 290 *F*`), lignes `Deck` / `Sideboard` /
`SB:`, commentaires `//`. Les doublons (main + side) sont additionnés.

Pour chaque carte, la quantité demandée est répartie automatiquement sur les
exemplaires en stock : langue préférée d'abord (Français / Anglais, lue dans le titre de
variante « Français / Near Mint / Régulière »), puis du moins cher au plus cher. Le client
peut ajuster les quantités avant d'ajouter au panier.

Le catalogue est chargé une fois (pages de 250 produits, ~6 requêtes pour 1 400 produits)
puis gardé 10 minutes dans le navigateur : les recherches suivantes sont instantanées.

### Fichiers

| Fichier | Rôle |
| --- | --- |
| `sections/deck-list-search.liquid` | La section (formulaire + réglages dans l'éditeur de thème) |
| `assets/deck-list-search.js` | Lecture de la liste, recherche, affichage, ajout au panier |
| `assets/deck-list-search.css` | Styles |
| `templates/collection.deck.liquid` | Vue JSON du catalogue utilisée par le script (**obligatoire**) |
| `templates/page.deck-list.json` | Modèle de page qui contient la section |

### Installation sur la boutique

1. **Boutique en ligne → Thèmes → … → Modifier le code** (faire d'abord une copie du thème).
2. Créer chaque fichier ci-dessus dans le dossier correspondant et coller son contenu.
3. **Boutique en ligne → Pages → Ajouter une page** : titre « Recherche par liste »,
   puis à droite **Modèle → `deck-list`**. Enregistrer.
4. Ajouter la page au menu (**Boutique en ligne → Navigation**).

Réglages dans l'éditeur de thème : titre, texte d'intro, collection où chercher (toutes
les cartes par défaut), affichage du stock, et « Correspondance souple » (si une carte
n'est pas trouvée par son nom exact, accepte les titres qui contiennent ce nom).

### Développement

```sh
npm test      # tests (lecture des listes, noms tirés du vrai catalogue, répartition du stock)
npm run dev   # démo locale avec un extrait du catalogue : http://localhost:3000
```
