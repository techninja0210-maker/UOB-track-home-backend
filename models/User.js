const { query } = require('../config/database');

class User {
  // Find user by email
  static async findByEmail(email) {
    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    return result.rows[0];
  }

  // Find user by ID
  static async findById(id) {
    const result = await query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  // Create new user
  static async create({ fullName, email, passwordHash, role = 'user' }) {
    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role, created_at`,
      [fullName, email.toLowerCase(), passwordHash, role]
    );
    return result.rows[0];
  }

  // Update user
  static async update(id, { fullName, email }) {
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (fullName) {
      updates.push(`full_name = $${paramCount++}`);
      values.push(fullName);
    }
    if (email) {
      updates.push(`email = $${paramCount++}`);
      values.push(email.toLowerCase());
    }

    values.push(id);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, full_name, email, role, updated_at`,
      values
    );
    return result.rows[0];
  }

  // Update password
  static async updatePassword(id, passwordHash) {
    await query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, id]
    );
  }

  // Update last login
  static async updateLastLogin(id) {
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  // Get all users (admin only)
  static async findAll() {
    const result = await query(
      'SELECT id, full_name, email, role, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    return result.rows;
  }
}

module.exports = User;
