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
| `templates/page.deck-list.json` | Modèle de page autonome (optionnel) |
| `templates/collection.json` | Modèle de collection Horizon avec la section, affichée seulement sur « Cartes à l'unité » (`magic-single`) |

### Installation sur la boutique

La section est installée sur la copie de thème **« Horizon – Recherche par liste »** (non publiée),
dans le modèle de collection, entre le titre et la grille de produits. Elle n'apparaît que sur
la collection « Cartes à l'unité » (`magic-single`, réglage « N'afficher que sur cette collection »)
et cherche dans cette même collection.

- Aperçu : `https://wizardsofthewestcoast.com/collections/magic-single?preview_theme_id=189146628415`
- Pour la mettre en ligne : **Boutique en ligne → Thèmes → « Horizon – Recherche par liste » → Publier**.

Le panier passe par les actions standard Shopify du thème Horizon (`Shopify.actions.updateCart`) :
la pastille et le tiroir du panier se mettent à jour automatiquement. Sur un autre thème, le
script se replie sur `/cart/add.js`.

Pour l'installer à la main sur un autre thème : copier `sections/`, `assets/` et
`templates/collection.deck.liquid`, puis ajouter la section « Recherche par liste » au modèle
voulu depuis l'éditeur de thème.

### Développement

```sh
npm test      # tests (lecture des listes, noms tirés du vrai catalogue, répartition du stock)
npm run dev   # démo locale avec un extrait du catalogue : http://localhost:3000
```
