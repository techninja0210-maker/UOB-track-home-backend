const { Pool } = require('pg');
const pool = require('../config/database');

class WithdrawalRequest {
  constructor(data) {
    this.id = data.id;
    this.userId = data.user_id;
    this.currency = data.currency;
    this.amount = data.amount;
    this.destinationAddress = data.destination_address;
    this.status = data.status; // 'pending', 'approved', 'rejected', 'completed', 'failed'
    this.adminId = data.admin_id;
    this.adminNotes = data.admin_notes;
    this.transactionHash = data.transaction_hash;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
    this.completedAt = data.completed_at;
    
    // User information (when joined with users table)
    this.fullName = data.full_name;
    this.email = data.email;
  }

  static async create(data) {
    const query = `
      INSERT INTO withdrawal_requests (
        user_id, currency, amount, destination_address, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())
      RETURNING *
    `;
    
    const values = [
      data.userId,
      data.currency,
      data.amount,
      data.destinationAddress
    ];

    try {
      const result = await pool.query(query, values);
      return new WithdrawalRequest(result.rows[0]);
    } catch (error) {
      console.error('Error creating withdrawal request:', error);
      throw error;
    }
  }

  static async findByUserId(userId, limit = 50, offset = 0) {
    const query = `
      SELECT wr.*, u.full_name, u.email
      FROM withdrawal_requests wr
      JOIN users u ON wr.user_id = u.id
      WHERE wr.user_id = $1
      ORDER BY wr.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await pool.query(query, [userId, limit, offset]);
      return result.rows.map(row => new WithdrawalRequest(row));
    } catch (error) {
      console.error('Error fetching user withdrawal requests:', error);
      throw error;
    }
  }

  static async findAll(limit = 50, offset = 0, status = null) {
    let query = `
      SELECT wr.*, u.full_name, u.email
      FROM withdrawal_requests wr
      JOIN users u ON wr.user_id = u.id
    `;
    
    const values = [limit, offset];
    let paramCount = 2;

    if (status) {
      query += ` WHERE wr.status = $${paramCount + 1}`;
      values.push(status);
      paramCount++;
    }

    query += ` ORDER BY wr.created_at DESC LIMIT $1 OFFSET $2`;

    try {
      const result = await pool.query(query, values);
      return result.rows.map(row => new WithdrawalRequest(row));
    } catch (error) {
      console.error('Error fetching withdrawal requests:', error);
      throw error;
    }
  }

  static async findById(id) {
    const query = `
      SELECT wr.*, u.full_name, u.email
      FROM withdrawal_requests wr
      JOIN users u ON wr.user_id = u.id
      WHERE wr.id = $1
    `;
    
    try {
      const result = await pool.query(query, [id]);
      if (result.rows.length === 0) return null;
      return new WithdrawalRequest(result.rows[0]);
    } catch (error) {
      console.error('Error fetching withdrawal request by ID:', error);
      throw error;
    }
  }

  static async updateStatus(id, status, adminId = null, adminNotes = null, transactionHash = null) {
    const query = `
      UPDATE withdrawal_requests 
      SET status = $1, admin_id = $2, admin_notes = $3, transaction_hash = $4, updated_at = NOW()
      ${status === 'completed' ? ', completed_at = NOW()' : ''}
      WHERE id = $5
      RETURNING *
    `;
    
    const values = [status, adminId, adminNotes, transactionHash, id];

    try {
      const result = await pool.query(query, values);
      if (result.rows.length === 0) return null;
      return new WithdrawalRequest(result.rows[0]);
    } catch (error) {
      console.error('Error updating withdrawal request status:', error);
      throw error;
    }
  }

  static async getStats() {
    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM withdrawal_requests 
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY status
    `;
    
    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error fetching withdrawal stats:', error);
      throw error;
    }
  }

  async save() {
    const query = `
      UPDATE withdrawal_requests 
      SET user_id = $1, currency = $2, amount = $3, destination_address = $4, 
          status = $5, admin_id = $6, admin_notes = $7, transaction_hash = $8, 
          updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `;
    
    const values = [
      this.userId, this.currency, this.amount, this.destinationAddress,
      this.status, this.adminId, this.adminNotes, this.transactionHash, this.id
    ];

    try {
      const result = await pool.query(query, values);
      return new WithdrawalRequest(result.rows[0]);
    } catch (error) {
      console.error('Error saving withdrawal request:', error);
      throw error;
    }
  }
}

module.exports = WithdrawalRequest;
