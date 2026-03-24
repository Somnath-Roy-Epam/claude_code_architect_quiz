require("dotenv").config();
const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// --- Razorpay (optional — enabled when keys are set) ---
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
let razorpay = null;
if (RZP_KEY_ID && RZP_KEY_SECRET) {
  const Razorpay = require("razorpay");
  razorpay = new Razorpay({ key_id: RZP_KEY_ID, key_secret: RZP_KEY_SECRET });
}
const PRICE_AMOUNT = parseInt(process.env.RAZORPAY_PRICE_AMOUNT || "49900", 10); // paise (₹499)
const PRICE_CURRENCY = process.env.RAZORPAY_CURRENCY || "INR";

// --- Questions (loaded from root, never exposed as static file) ---
const quizQuestions = require("./questions");

// --- Database setup ---
const db = new Database(path.join(__dirname, "quiz.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    paid INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    current_index INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    answers TEXT DEFAULT '[]',
    selected_domain INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS pending_registrations (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    razorpay_order_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Add 'paid' column if missing (for existing DBs)
try { db.exec("ALTER TABLE users ADD COLUMN paid INTEGER DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE progress ADD COLUMN selected_domain INTEGER DEFAULT 0"); } catch (_) {}

// --- Middleware ---
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

// Block direct access to questions.js
app.use("/questions.js", (_req, res) => res.status(404).end());

// Static files
app.use(express.static(path.join(__dirname, "public")));

// --- Public config (tells frontend if payment is needed + Razorpay key) ---
app.get("/api/config", (_req, res) => {
  res.json({
    paymentRequired: !!razorpay,
    razorpayKeyId: RZP_KEY_ID || null,
    priceAmount: PRICE_AMOUNT,
    priceCurrency: PRICE_CURRENCY,
  });
});

// --- Auth routes ---

// Direct registration (only when Razorpay is NOT configured — dev/test mode)
app.post("/api/register", (req, res) => {
  if (razorpay) {
    return res.status(403).json({ error: "Registration requires payment." });
  }

  const { username, displayName, password } = req.body;
  const err = validateRegistration(username, displayName, password);
  if (err) return res.status(400).json({ error: err });

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(409).json({ error: "Username already taken" });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (username, display_name, password_hash, paid) VALUES (?, ?, ?, 1)")
    .run(username, displayName, hash);
  const userId = result.lastInsertRowid;
  db.prepare("INSERT INTO progress (user_id, answers) VALUES (?, '[]')").run(userId);

  req.session.userId = userId;
  req.session.username = username;
  req.session.displayName = displayName;
  res.json({ ok: true, user: { username, displayName } });
});

// Paid registration — Step 1: create Razorpay order
app.post("/api/create-order", async (req, res) => {
  if (!razorpay) return res.status(400).json({ error: "Payments not configured" });

  const { username, displayName, password } = req.body;
  const err = validateRegistration(username, displayName, password);
  if (err) return res.status(400).json({ error: err });

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(409).json({ error: "Username already taken" });

  const pendingId = crypto.randomUUID();
  const hash = bcrypt.hashSync(password, 10);

  try {
    const order = await razorpay.orders.create({
      amount: PRICE_AMOUNT,
      currency: PRICE_CURRENCY,
      receipt: pendingId,
      notes: { pendingId },
    });

    db.prepare(
      "INSERT INTO pending_registrations (id, username, display_name, password_hash, razorpay_order_id) VALUES (?, ?, ?, ?, ?)"
    ).run(pendingId, username, displayName, hash, order.id);

    res.json({ orderId: order.id, pendingId, amount: PRICE_AMOUNT, currency: PRICE_CURRENCY });
  } catch (err) {
    console.error("Razorpay error:", err.message);
    res.status(500).json({ error: "Payment setup failed. Please try again." });
  }
});

// Paid registration — Step 2: verify payment and create account
app.post("/api/verify-payment", (req, res) => {
  if (!razorpay) return res.status(400).json({ error: "Payments not configured" });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, pendingId } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !pendingId) {
    return res.status(400).json({ error: "Missing payment verification data" });
  }

  // Verify signature (HMAC SHA256)
  const expectedSignature = crypto
    .createHmac("sha256", RZP_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: "Payment verification failed" });
  }

  const pending = db.prepare("SELECT * FROM pending_registrations WHERE id = ? AND razorpay_order_id = ?")
    .get(pendingId, razorpay_order_id);
  if (!pending) return res.status(400).json({ error: "Invalid registration" });

  // Check if already processed (idempotent)
  let user = db.prepare("SELECT * FROM users WHERE username = ?").get(pending.username);
  if (!user) {
    const result = db.prepare(
      "INSERT INTO users (username, display_name, password_hash, paid) VALUES (?, ?, ?, 1)"
    ).run(pending.username, pending.display_name, pending.password_hash);
    const userId = result.lastInsertRowid;
    db.prepare("INSERT INTO progress (user_id, answers) VALUES (?, '[]')").run(userId);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  }

  // Clean up pending
  db.prepare("DELETE FROM pending_registrations WHERE id = ?").run(pendingId);

  // Log in
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.displayName = user.display_name;
  res.json({ ok: true, user: { username: user.username, displayName: user.display_name } });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.displayName = user.display_name;
  res.json({ ok: true, user: { username: user.username, displayName: user.display_name } });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  res.json({ user: { username: req.session.username, displayName: req.session.displayName } });
});

// --- Questions (authenticated only) ---
app.get("/api/questions", requireAuth, (_req, res) => {
  res.json(quizQuestions);
});

// --- Progress routes ---
app.get("/api/progress", requireAuth, (req, res) => {
  const row = db.prepare("SELECT current_index, score, answers, selected_domain FROM progress WHERE user_id = ?").get(req.session.userId);
  if (!row) return res.json({ currentIndex: 0, score: 0, answers: [], selectedDomain: 0 });
  let answers;
  try { answers = JSON.parse(row.answers); } catch (_) { answers = []; }
  res.json({ currentIndex: row.current_index, score: row.score, answers, selectedDomain: row.selected_domain || 0 });
});

app.post("/api/progress", requireAuth, (req, res) => {
  const { currentIndex, score, answers, selectedDomain } = req.body;
  if (typeof currentIndex !== "number" || typeof score !== "number" || !Array.isArray(answers)) {
    return res.status(400).json({ error: "Invalid progress data" });
  }
  const answersJson = JSON.stringify(answers);
  const domain = typeof selectedDomain === "number" ? selectedDomain : 0;
  const existing = db.prepare("SELECT id FROM progress WHERE user_id = ?").get(req.session.userId);
  if (existing) {
    db.prepare("UPDATE progress SET current_index = ?, score = ?, answers = ?, selected_domain = ?, updated_at = datetime('now') WHERE user_id = ?")
      .run(currentIndex, score, answersJson, domain, req.session.userId);
  } else {
    db.prepare("INSERT INTO progress (user_id, current_index, score, answers, selected_domain) VALUES (?, ?, ?, ?, ?)")
      .run(req.session.userId, currentIndex, score, answersJson, domain);
  }
  res.json({ ok: true });
});

app.delete("/api/progress", requireAuth, (req, res) => {
  db.prepare("UPDATE progress SET current_index = 0, score = 0, answers = '[]', selected_domain = 0, updated_at = datetime('now') WHERE user_id = ?")
    .run(req.session.userId);
  res.json({ ok: true });
});

// --- Serve pages ---
app.get("/login", (_req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));

app.get("/quiz", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/", (req, res) => {
  if (req.session.userId) return res.redirect("/quiz");
  res.redirect("/login");
});

// --- Helpers ---
function validateRegistration(username, displayName, password) {
  if (!username || !password || !displayName) return "All fields are required";
  if (username.length < 3 || username.length > 30) return "Username must be 3-30 characters";
  if (password.length < 6) return "Password must be at least 6 characters";
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) return "Username: letters, numbers, dot, hyphen, underscore only";
  return null;
}

app.listen(PORT, () => {
  console.log(`Server running at ${BASE_URL}`);
  console.log(`Razorpay payments: ${razorpay ? "ENABLED" : "DISABLED (free registration)"}`);
});
