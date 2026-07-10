# SOLUNE — Store one-page

Colliers magnétiques Soleil & Lune pour couples. Frontend one-page + backend commandes (Express + SQLite) + admin.

## Structure

- `docs/` — frontend statique (servi par GitHub Pages **et** par le backend)
  - `index.html` — la page de vente
  - `admin.html` — interface admin (commandes, statuts, CA)
  - `config.js` — **mettre ici l'URL du backend Render** : `window.SOLUNE_API = "https://xxx.onrender.com"`
  - `img/` — photos produit
- `server.js` — API : `POST /api/orders`, `GET /api/orders` (token), `PATCH /api/orders/:id`, `POST /api/checkout` (Stripe)
- `render.yaml` — déploiement Render en 1 clic

## Déployer le backend sur Render (gratuit)

1. Créer un compte sur render.com (login GitHub).
2. New + → Web Service → connecter ce repo `solune-store`.
3. Build: `npm install` · Start: `node server.js` · Plan: Free.
4. Env vars : `ADMIN_TOKEN` (votre secret), `STRIPE_SECRET_KEY` (optionnel, active le paiement), `BASE_URL` (URL du service).
5. Copier l'URL du service dans `docs/config.js` (`window.SOLUNE_API`).

## Admin

`https://<site>/admin.html` — entrer le `ADMIN_TOKEN`. Sans backend connecté, mode démo (localStorage).

## Stripe (marché EU)

Renseigner `STRIPE_SECRET_KEY` active Stripe Checkout (cartes + Bancontact + iDEAL, adresses EU). Sans clé, les commandes sont enregistrées avec le statut `stripe_pending` (envoi manuel du lien de paiement).

## Local

```bash
npm install && npm start   # http://localhost:3000 — admin: /admin (token: solune-admin-2026)
```
