const { query, transaction } = require('../config/database');

class GoldHolding {
  // Generate SKR reference number
  static generateSKRReference() {
    const timestamp = Date.now().toString().slice(-10);
    return 'SKR' + timestamp;
  }

  // Get all holdings for user
  static async findByUserId(userId, status = null) {
    let sql = `
      SELECT gh.*, gs.name as gold_name, gs.purity
      FROM gold_holdings gh
      JOIN gold_securities gs ON gh.gold_security_id = gs.id
      WHERE gh.user_id = $1
    `;
    const params = [userId];
    
    if (status) {
      sql += ` AND gh.status = $2`;
      params.push(status);
    }
    
    sql += ` ORDER BY gh.created_at DESC`;
    
    const result = await query(sql, params);
    return result.rows;
  }

  // Get holding by SKR reference
  static async findBySKR(skrReference) {
    const result = await query(
      `SELECT gh.*, gs.name as gold_name, gs.purity, gs.price_per_gram_usd as current_market_price
       FROM gold_holdings gh
       JOIN gold_securities gs ON gh.gold_security_id = gs.id
       WHERE gh.skr_reference = $1`,
      [skrReference]
    );
    return result.rows[0];
  }

  // Create new gold holding (when user purchases gold)
  static async create(data) {
    const {
      userId,
      goldSecurityId,
      quantity,
      weightGrams,
      purchasePricePerGram,
      totalPaidUsd,
      paymentCurrency,
      paymentAmount
    } = data;

    const skrReference = this.generateSKRReference();

    const result = await query(
      `INSERT INTO gold_holdings (
        user_id, gold_security_id, skr_reference, quantity, weight_grams,
        purchase_price_per_gram, total_paid_usd, payment_currency, payment_amount, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'holding')
      RETURNING *`,
      [userId, goldSecurityId, skrReference, quantity, weightGrams, purchasePricePerGram, 
       totalPaidUsd, paymentCurrency, paymentAmount]
    );

    return result.rows[0];
  }

  // Update holding status (when sold or withdrawn)
  static async updateStatus(id, status, sellDate = null) {
    const updates = ['status = $1'];
    const params = [status, id];
    let paramCount = 2;

    if (sellDate) {
      updates.push(`sell_date = $${++paramCount}`);
      params.splice(paramCount - 1, 0, sellDate);
    }

    if (status === 'withdrawn') {
      updates.push(`withdrawal_date = CURRENT_TIMESTAMP`);
    }

    const result = await query(
      `UPDATE gold_holdings 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    return result.rows[0];
  }

  // Calculate current profit/loss
  static async calculateProfit(skrReference) {
    const result = await query(
      `SELECT 
        gh.*,
        gs.price_per_gram_usd as current_price_per_gram,
        (gs.price_per_gram_usd * gh.weight_grams) as current_value,
        ((gs.price_per_gram_usd * gh.weight_grams) - gh.total_paid_usd) as profit_loss,
        (((gs.price_per_gram_usd * gh.weight_grams) - gh.total_paid_usd) / gh.total_paid_usd * 100) as profit_loss_percentage,
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - gh.purchase_date)) as days_held
       FROM gold_holdings gh
       JOIN gold_securities gs ON gh.gold_security_id = gs.id
       WHERE gh.skr_reference = $1`,
      [skrReference]
    );
    
    return result.rows[0];
  }

  // Get all holdings (admin view)
  static async findAll(filters = {}) {
    let sql = `
      SELECT gh.*, gs.name as gold_name, gs.purity, u.email as user_email, u.full_name
      FROM gold_holdings gh
      JOIN gold_securities gs ON gh.gold_security_id = gs.id
      JOIN users u ON gh.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (filters.status) {
      sql += ` AND gh.status = $${++paramCount}`;
      params.push(filters.status);
    }

    if (filters.userId) {
      sql += ` AND gh.user_id = $${++paramCount}`;
      params.push(filters.userId);
    }

    sql += ` ORDER BY gh.created_at DESC`;

    const result = await query(sql, params);
    return result.rows;
  }

  // Sell gold back (user sells gold to platform)
  static async sellGold(id, userId) {
    return await transaction(async (client) => {
      // Get holding details
      const holding = await client.query(
        `SELECT gh.*, gs.price_per_gram_usd as current_price
         FROM gold_holdings gh
         JOIN gold_securities gs ON gh.gold_security_id = gs.id
         WHERE gh.id = $1 AND gh.user_id = $2 AND gh.status = 'holding'`,
        [id, userId]
      );

      if (holding.rows.length === 0) {
        throw new Error('Gold holding not found or already sold');
      }

      const goldData = holding.rows[0];
      const currentValue = parseFloat(goldData.current_price) * parseFloat(goldData.weight_grams);
      const profitLoss = currentValue - parseFloat(goldData.total_paid_usd);

      // Update holding status
      await client.query(
        `UPDATE gold_holdings 
         SET status = 'sold', sell_date = CURRENT_TIMESTAMP,
             current_price_per_gram = $1, current_value_usd = $2,
             profit_loss_usd = $3
         WHERE id = $4`,
        [goldData.current_price, currentValue, profitLoss, id]
      );

      // Credit user wallet with USDT (or original currency)
      await client.query(
        `UPDATE wallets 
         SET usdt_balance = usdt_balance + $1
         WHERE user_id = $2`,
        [currentValue, userId]
      );

      // Create transaction record
      await client.query(
        `INSERT INTO transactions (
          user_id, type, from_currency, to_currency, from_amount, to_amount,
          skr_reference, status, completed_at
        ) VALUES ($1, 'gold_sale', 'GOLD', 'USDT', $2, $3, $4, 'completed', CURRENT_TIMESTAMP)`,
        [userId, goldData.weight_grams, currentValue, goldData.skr_reference]
      );

      // Increase gold availability
      await client.query(
        `UPDATE gold_securities 
         SET available_quantity = available_quantity + $1
         WHERE id = $2`,
        [goldData.quantity, goldData.gold_security_id]
      );

      return {
        soldPrice: currentValue,
        profitLoss: profitLoss,
        skrReference: goldData.skr_reference
      };
    });
  }

  // Withdraw profit only (not principal)
  static async withdrawProfit(id, userId) {
    const holding = await this.calculateProfit(id);
    
    if (!holding || holding.user_id !== userId) {
      throw new Error('Gold holding not found');
    }

    if (holding.profit_loss <= 0) {
      throw new Error('No profit available to withdraw');
    }

    // Credit profit to wallet
    await query(
      `UPDATE wallets 
       SET usdt_balance = usdt_balance + $1
       WHERE user_id = $2`,
      [holding.profit_loss, userId]
    );

    // Update holding to reflect profit withdrawn
    await query(
      `UPDATE gold_holdings 
       SET total_paid_usd = current_value
       WHERE id = $1`,
      [id]
    );

    return {
      profitWithdrawn: holding.profit_loss,
      skrReference: holding.skr_reference
    };
  }
}

module.exports = GoldHolding;


