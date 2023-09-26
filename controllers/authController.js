// authController.js
const pool = require("../config/dbConfig");
const { v4: uuidv4 } = require("uuid");

const register = async (req, res) => {
  console.log("sadf", req.body);
  const { email: username, password } = req.body;

  // Generate a UUID for the user
  const userId = uuidv4();

  try {
    const connection = await pool.getConnection();

    const insertQuery =
      "INSERT INTO users (id, username, password) VALUES (?, ?, ?)";
    await connection.query(insertQuery, [userId, username, password]);

    connection.release();
    res.status(200).send("User registered successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error registering user");
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const connection = await pool.getConnection();

    const selectQuery =
      "SELECT * FROM users WHERE username = ? AND password = ?";
    const [rows] = await connection.query(selectQuery, [username, password]);

    connection.release();

    if (rows.length === 0) {
      res.status(401).send("Invalid username or password");
    } else {
      res.status(200).send("Login successful");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error logging in");
  }
};

module.exports = { register, login };
