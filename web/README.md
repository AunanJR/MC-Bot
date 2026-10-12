# Blueprint Builds (website)

A static website with interactive 3D guides for Minecraft builds. Visitors can rotate and zoom a build,
step through it layer by layer, read the material list and download a schematic. The site needs no build
step and no server code.

## Run it

Serve the folder with any static file server, for example:

```bash
npx http-server web -p 8080      # or: python3 -m http.server -d web 8080
```

Then open <http://localhost:8080>. Opening `index.html` straight from disk works too.

## What is in it

| Page               | Route                | Notes                                                                 |
|--------------------|----------------------|-----------------------------------------------------------------------|
| Home               | `#/`                 | Hero with a live 3D model, new builds, builds of the week, how it works, pricing, reviews, FAQ, Discord |
| Catalog            | `#/builds`           | Tabs for Buildings / Decorations / Redstone & Farms, filters for style, size and difficulty, search, sorting |
| 3D guide           | `#/build/<id>`       | Rotate, zoom, pan, layer slider, stack or single-layer view, ghost blocks, block names on hover, top-view layer plan, material list per layer or whole build with checkboxes, downloads |
| Pricing            | `#/pricing`          | Free, monthly and yearly (40% off)                                    |
| How it works       | `#/how`              | The five steps, tutorials and pricing                                 |
| Mod & add-on       | `#/mod`              | Fabric mod, Bedrock add-on, and the Blueprint bot as auto-builder     |
| Tutorials          | `#/tutorials`        | Litematica, Java worlds, Bedrock worlds and add-on                    |
| Request a build    | `#/requests`         | Suggestion form and voting                                            |
| Favorites, account | `#/favorites`, `#/account` |                                                                 |
| About, FAQ         | `#/about`, `#/faq`   |                                                                       |

The site has English and Norwegian text. A rule-based assistant in the corner answers common questions.

## How the builds work

Every build is code in `js/builds.js`, which generates a list of blocks. The 3D guide, the material list,
the layer plan and the `.schem` download all read that same list, so they always match. The block palette
(names, colours, shapes and Minecraft block states) lives in `js/blocks.js`.

The `.schem` export is Sponge Schematic v2. It opens in Litematica and WorldEdit, and the Blueprint API in
this repository accepts it (`POST /schematics`), so the bot can build any catalog entry.

To add a build: write a generator function in `js/builds.js` with the `builder()` helpers (`fill`, `walls`,
`ring`, `disk`, `gable`, …), then add an entry to `window.CATALOG`.

## Before you launch

The site is a working front end. Some parts are demos because they need a backend:

- **Payments**: choosing a plan unlocks premium in the browser's local storage. Connect a payment provider.
- **Accounts, favorites, votes and requests** are stored in the visitor's browser only.
- **Java worlds, `.mcworld` and `.mcaddon` files, the Fabric mod and tutorial videos** are not hosted. Set the
  links in `js/config.js` (`downloads`, `modUrl`).
- **Reviews** in `js/i18n.js` (`CONTENT.reviews`) are sample text. Replace them with real reviews.
- Set your Discord invite and the Blueprint API URL in `js/config.js`.

## Files

```
web/
  index.html
  css/styles.css
  js/config.js     site settings
  js/blocks.js     block palette
  js/builds.js     build generators and catalog
  js/viewer.js     three.js viewer, thumbnails, layer plan
  js/schem.js      .schem export
  js/i18n.js       UI text (en, no), FAQ, tutorials, sample reviews, requests
  js/app.js        pages, routing, assistant
  vendor/three.min.js   three.js r158 (MIT, see three.LICENSE)
```
