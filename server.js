/**
 * SOLUNE — Store one-page : backend Express + SQLite
 * - POST /api/orders          : enregistre une commande
 * - GET  /api/orders          : liste des commandes (admin, token requis)
 * - PATCH /api/orders/:id     : maj statut (admin)
 * - GET  /admin               : interface admin (login par token)
 * - POST /api/checkout        : structure Stripe Checkout (activée si STRIPE_SECRET_KEY)
 *
 * Déploiement : Render / Railway / Fly.io — `npm start`
 * Env : PORT, ADMIN_TOKEN (défaut: change-me), STRIPE_SECRET_KEY (optionnel), BASE_URL
 */
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "solune-admin-2026";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "orders.db");

// ---------- DB ----------
const db = new Database(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  zip TEXT NOT NULL,
  country TEXT NOT NULL,
  offer TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_eur REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'stripe_pending',
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT
)`);

app.use(express.json());
// CORS : autorise le frontend GitHub Pages à appeler ce backend
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname, "docs")));

// ---------- Offres (source de vérité côté serveur) ----------
const OFFERS = {
  solo:   { label: "1 set SOLUNE (2 colliers)", price: 34.9 },
  duo:    { label: "2 sets SOLUNE (-20%)",      price: 55.8 },
  trio:   { label: "3 sets SOLUNE (-30%)",      price: 73.2 },
};

// ---------- API commandes ----------
app.post("/api/orders", (req, res) => {
  const b = req.body || {};
  const required = ["name", "email", "address", "city", "zip", "country", "offer"];
  for (const f of required) {
    if (!b[f] || String(b[f]).trim() === "") {
      return res.status(400).json({ error: `Champ manquant : ${f}` });
    }
  }
  if (!OFFERS[b.offer]) return res.status(400).json({ error: "Offre invalide" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) {
    return res.status(400).json({ error: "Email invalide" });
  }
  const id = "SOL-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const offer = OFFERS[b.offer];
  db.prepare(`INSERT INTO orders (id, created_at, name, email, phone, address, city, zip, country, offer, quantity, total_eur, payment_method, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      id, new Date().toISOString(),
      String(b.name).slice(0, 120), String(b.email).slice(0, 160), String(b.phone || "").slice(0, 40),
      String(b.address).slice(0, 240), String(b.city).slice(0, 80), String(b.zip).slice(0, 20),
      String(b.country).slice(0, 60), offer.label, 1, offer.price,
      b.payment_method === "cod" ? "cod" : "stripe_pending", "new", String(b.notes || "").slice(0, 500)
    );
  res.json({ ok: true, orderId: id, total: offer.price });
});

// ---------- Admin auth ----------
function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: "Non autorisé" });
  next();
}

app.get("/api/orders", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  res.json({ count: rows.length, revenue: rows.reduce((s, r) => s + r.total_eur, 0), orders: rows });
});

app.patch("/api/orders/:id", requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const allowed = ["new", "paid", "shipped", "delivered", "cancelled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Statut invalide" });
  const r = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);
  if (!r.changes) return res.status(404).json({ error: "Commande introuvable" });
  res.json({ ok: true });
});

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "docs", "admin.html")));

// ---------- Stripe (structure prête, marché EU : cartes + Bancontact + iDEAL) ----------
app.post("/api/checkout", async (req, res) => {
  const { offer } = req.body || {};
  if (!OFFERS[offer]) return res.status(400).json({ error: "Offre invalide" });
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({
      error: "stripe_not_configured",
      message: "Paiement en ligne bientôt disponible — votre commande est enregistrée, nous vous enverrons un lien de paiement par email.",
    });
  }
  try {
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "bancontact", "ideal"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: OFFERS[offer].label, description: "Colliers magnétiques Soleil & Lune — SOLUNE" },
          unit_amount: Math.round(OFFERS[offer].price * 100),
        },
        quantity: 1,
      }],
      shipping_address_collection: { allowed_countries: ["FR", "BE", "CH", "LU", "DE", "ES", "IT", "NL", "PT", "AT", "IE"] },
      success_url: (process.env.BASE_URL || "http://localhost:" + PORT) + "/?paid=1",
      cancel_url: (process.env.BASE_URL || "http://localhost:" + PORT) + "/?cancelled=1",
      automatic_tax: { enabled: false },
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: "stripe_error", message: e.message });
  }
});

app.get("/api/health", (_, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, () => console.log(`SOLUNE store -> http://localhost:${PORT} (admin: /admin, token: ${ADMIN_TOKEN})`));
