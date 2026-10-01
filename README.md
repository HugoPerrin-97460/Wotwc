# Wotwc

Code du thème Shopify de la boutique de cartes Magic.

## Recherche par liste de cartes

Une page où le client colle sa liste de deck (une carte par ligne) : chaque carte est
cherchée dans la boutique, les exemplaires disponibles s'affichent avec prix et stock,
et tout peut être ajouté au panier en un clic. Les cartes absentes ou épuisées sont
listées à part (avec un bouton pour copier la liste).

Formats acceptés : `4 Lightning Bolt`, `4x Lightning Bolt`, `Lightning Bolt x4`,
export Arena/MTGO/Moxfield (`1 Fire // Ice (MH2) 290 *F*`), lignes `Deck` / `Sideboard` /
`SB:`, commentaires `//`. Les doublons (main + side) sont additionnés.

Pour chaque carte, la quantité demandée est répartie automatiquement sur les
exemplaires en stock, du moins cher au plus cher ; le client peut ajuster.

### Fichiers

| Fichier | Rôle |
| --- | --- |
| `sections/deck-list-search.liquid` | La section (formulaire + réglages dans l'éditeur de thème) |
| `assets/deck-list-search.js` | Lecture de la liste, recherche, affichage, ajout au panier |
| `assets/deck-list-search.css` | Styles |
| `templates/search.deck.liquid` | Vue JSON de la recherche Shopify utilisée par le script (**obligatoire**) |
| `templates/page.deck-list.json` | Modèle de page qui contient la section |

### Installation sur la boutique

1. **Boutique en ligne → Thèmes → … → Modifier le code** (faire d'abord une copie du thème).
2. Créer chaque fichier ci-dessus dans le dossier correspondant et coller son contenu.
3. **Boutique en ligne → Pages → Ajouter une page** : titre « Recherche par liste »,
   puis à droite **Modèle → `deck-list`**. Enregistrer.
4. Ajouter la page au menu (**Boutique en ligne → Navigation**).

Réglages dans l'éditeur de thème : titre, texte d'intro, affichage du stock, et
« Correspondance souple » si les titres produits contiennent autre chose que le nom
de la carte (par défaut, `Lightning Bolt [M10] - Foil` correspond déjà à « Lightning Bolt » :
ce qui est entre crochets/parenthèses et après ` - ` est ignoré).

### Développement

```sh
npm test      # tests du lecteur de liste et de la correspondance des noms
npm run dev   # démo locale avec un faux catalogue : http://localhost:3000
```
