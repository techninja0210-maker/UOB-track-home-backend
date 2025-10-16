const { query } = require('../config/database');

class GoldSecurity {
  // Get all gold securities
  static async findAll() {
    const result = await query(
      'SELECT * FROM gold_securities WHERE is_active = true ORDER BY weight_grams ASC'
    );
    return result.rows;
  }

  // Get gold security by ID
  static async findById(id) {
    const result = await query(
      'SELECT * FROM gold_securities WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  // Update gold price (admin only)
  static async updatePrice(id, pricePerGram, adminId, reason = null) {
    return await transaction(async (client) => {
      // Calculate new total price
      const security = await client.query(
        'SELECT weight_grams FROM gold_securities WHERE id = $1',
        [id]
      );
      
      if (security.rows.length === 0) {
        throw new Error('Gold security not found');
      }
      
      const weightGrams = parseFloat(security.rows[0].weight_grams);
      const totalPrice = (pricePerGram * weightGrams).toFixed(2);
      
      // Update gold security price
      const result = await client.query(
        `UPDATE gold_securities 
         SET price_per_gram_usd = $1, total_price_usd = $2
         WHERE id = $3
         RETURNING *`,
        [pricePerGram, totalPrice, id]
      );
      
      // Log price change history
      await client.query(
        `INSERT INTO gold_price_history (gold_security_id, price_per_gram_usd, total_price_usd, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, pricePerGram, totalPrice, adminId, reason]
      );
      
      return result.rows[0];
    });
  }

  // Get price history
  static async getPriceHistory(id, limit = 30) {
    const result = await query(
      `SELECT gph.*, u.full_name as changed_by_name
       FROM gold_price_history gph
       LEFT JOIN users u ON gph.changed_by = u.id
       WHERE gph.gold_security_id = $1
       ORDER BY gph.created_at DESC
       LIMIT $2`,
      [id, limit]
    );
    return result.rows;
  }

  // Get statistics
  static async getStatistics() {
    const result = await query('SELECT * FROM gold_statistics');
    return result.rows;
  }

  // Create new gold security (admin)
  static async create(data) {
    const { name, weightGrams, purity, pricePerGram, availableQuantity, description, imageUrl } = data;
    const totalPrice = (pricePerGram * weightGrams).toFixed(2);
    
    const result = await query(
      `INSERT INTO gold_securities (name, weight_grams, purity, price_per_gram_usd, total_price_usd, available_quantity, description, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, weightGrams, purity, pricePerGram, totalPrice, availableQuantity, description, imageUrl]
    );
    
    return result.rows[0];
  }

  // Update availability
  static async updateAvailability(id, quantity) {
    const result = await query(
      `UPDATE gold_securities 
       SET available_quantity = available_quantity + $1
       WHERE id = $2
       RETURNING *`,
      [quantity, id]
    );
    return result.rows[0];
  }
}

module.exports = GoldSecurity;


