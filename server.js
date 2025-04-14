const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const cors = require("cors");
const { body, validationResult } = require("express-validator");
const app = express();
const PORT = 3000;
const SECRET = "1234567";
const path = require("path");
app.use(express.static(path.join(__dirname, "public")));

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

// MySQL connection
const db = mysql.createConnection({
  host: "sql8.freesqldatabase.com",
  user: "sql8772473",
  password: "Gn7RXNh6De",
  database: "sql8772473",
});
db.connect((err) => {
  if (err) {
    console.error("DB connection failed:", err.message);
  } else {
    console.log("Connected to  MySQL database!");
  }
});

// Signup endpoint
app.post("/signup", (req, res) => {
  const { name, email, password, role } = req.body;

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error("Hashing error:", err);
      return res.status(500).json({ error: "Hashing error" });
    }

    const query =
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)";
    db.query(query, [name, email, hashedPassword, role], (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.status(201).json({ message: "User registered successfully" });
    });
  });
});

// Login endpoint
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const query = "SELECT * FROM users WHERE email = ?";
  db.query(query, [email], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (results.length === 0) {
      console.log("No user found with that email");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = results[0];
    console.log("User found:", user);

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.error("Bcrypt error:", err);
        return res.status(500).json({ error: "Hashing failed" });
      }

      if (!isMatch) {
        console.log("Password does not match");
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, SECRET, {
        expiresIn: "1h",
      });
      res.json({ message: "Login successful", token, user });
    });
  });
});

// Middleware to verify JWT token
const authenticateSeller = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token)
      return res.status(401).json({ error: "Unauthorized: No token provided" });

    const decoded = jwt.verify(token, SECRET);

    // Verify user is a seller
    const [users] = await pool.query(
      "SELECT user_id, is_seller FROM users WHERE user_id = ?",
      [decoded.userId]
    );

    if (users.length === 0 || !users[0].is_seller) {
      return res
        .status(403)
        .json({ error: "Forbidden: Only sellers can create listings" });
    }

    req.user = users[0];
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
    console.error("Authentication error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
// Create listing endpoint with validation and authentication
app.post(
  "/listings",
  authenticateSeller,
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("description")
      .trim()
      .notEmpty()
      .withMessage("Description is required"),
    body("price")
      .isFloat({ gt: 0 })
      .withMessage("Price must be a positive number"),
    body("availability")
      .optional()
      .isBoolean()
      .withMessage("Availability must be true or false"),
  ],
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, description, price, availability = true } = req.body;
      const owner_id = req.user.user_id;

      // Insert into database
      const [result] = await pool.query(
        "INSERT INTO listings (owner_id, title, description, price, availability) VALUES (?, ?, ?, ?, ?)",
        [owner_id, title, description, price, availability]
      );

      // Get the newly created listing
      const [listing] = await pool.query(
        "SELECT * FROM listings WHERE listing_id = ?",
        [result.insertId]
      );

      res.status(201).json(listing[0]);
    } catch (err) {
      console.error("Error creating listing:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

app.listen(PORT, () => {
  console.log(`Auth server running on http://localhost:${PORT}`);
});
// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  console.log("📦 Auth Header:", authHeader);

  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    console.log("❌ No token found");
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, SECRET, (err, user) => {
    if (err) {
      console.log("❌ JWT verification failed:", err.message);
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    console.log("✅ JWT verified. User:", user);
    req.user = user;
    next();
  });
};
