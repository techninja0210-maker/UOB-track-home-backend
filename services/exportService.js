const { createObjectCsvStringifier } = require('csv-writer');
const PDFDocument = require('pdfkit');
const { query } = require('../config/database');

class ExportService {
  /**
   * Export transactions to CSV
   */
  async exportTransactionsToCSV(userId, filters = {}) {
    try {
      // Build query
      let queryText = `
        SELECT 
          t.id,
          t.type,
          t.from_currency,
          t.from_amount,
          t.to_currency,
          t.to_amount,
          t.status,
          t.fee_amount,
          t.description,
          t.created_at,
          t.completed_at
        FROM transactions t
        WHERE t.user_id = $1
      `;

      const params = [userId];
      let paramCount = 1;

      // Add filters
      if (filters.startDate) {
        paramCount++;
        queryText += ` AND t.created_at >= $${paramCount}`;
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        paramCount++;
        queryText += ` AND t.created_at <= $${paramCount}`;
        params.push(filters.endDate);
      }

      if (filters.type) {
        paramCount++;
        queryText += ` AND t.type = $${paramCount}`;
        params.push(filters.type);
      }

      if (filters.status) {
        paramCount++;
        queryText += ` AND t.status = $${paramCount}`;
        params.push(filters.status);
      }

      queryText += ` ORDER BY t.created_at DESC`;

      // Execute query
      const result = await query(queryText, params);

      // Create CSV
      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: 'id', title: 'Transaction ID' },
          { id: 'type', title: 'Type' },
          { id: 'from_currency', title: 'From Currency' },
          { id: 'from_amount', title: 'From Amount' },
          { id: 'to_currency', title: 'To Currency' },
          { id: 'to_amount', title: 'To Amount' },
          { id: 'status', title: 'Status' },
          { id: 'fee_amount', title: 'Fee' },
          { id: 'description', title: 'Description' },
          { id: 'created_at', title: 'Created At' },
          { id: 'completed_at', title: 'Completed At' },
        ]
      });

      const csvHeader = csvStringifier.getHeaderString();
      const csvBody = csvStringifier.stringifyRecords(result.rows);

      return csvHeader + csvBody;
    } catch (error) {
      console.error('CSV export error:', error);
      throw error;
    }
  }

  /**
   * Export gold holdings to CSV
   */
  async exportGoldHoldingsToCSV(userId) {
    try {
      const result = await query(
        `SELECT 
          id,
          weight_grams,
          purchase_price_per_gram,
          total_value_usd,
          current_value_usd,
          profit_loss_usd,
          source_crypto,
          source_crypto_amount,
          status,
          created_at
        FROM gold_holdings
        WHERE user_id = $1
        ORDER BY created_at DESC`,
        [userId]
      );

      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: 'id', title: 'Holding ID' },
          { id: 'weight_grams', title: 'Weight (grams)' },
          { id: 'purchase_price_per_gram', title: 'Purchase Price/gram (USD)' },
          { id: 'total_value_usd', title: 'Total Value (USD)' },
          { id: 'current_value_usd', title: 'Current Value (USD)' },
          { id: 'profit_loss_usd', title: 'Profit/Loss (USD)' },
          { id: 'source_crypto', title: 'Source Crypto' },
          { id: 'source_crypto_amount', title: 'Source Amount' },
          { id: 'status', title: 'Status' },
          { id: 'created_at', title: 'Created At' },
        ]
      });

      const csvHeader = csvStringifier.getHeaderString();
      const csvBody = csvStringifier.stringifyRecords(result.rows);

      return csvHeader + csvBody;
    } catch (error) {
      console.error('Gold CSV export error:', error);
      throw error;
    }
  }

  /**
   * Export SKRs to CSV
   */
  async exportSKRsToCSV(userId) {
    try {
      const result = await query(
        `SELECT 
          s.id,
          s.receipt_number,
          s.gold_grams,
          s.status,
          s.issue_date,
          t.description as transaction_description,
          t.created_at
        FROM skrs s
        LEFT JOIN transactions t ON s.transaction_id = t.id
        WHERE s.user_id = $1
        ORDER BY s.issue_date DESC`,
        [userId]
      );

      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: 'id', title: 'SKR ID' },
          { id: 'receipt_number', title: 'Receipt Number' },
          { id: 'gold_grams', title: 'Gold Weight (grams)' },
          { id: 'status', title: 'Status' },
          { id: 'issue_date', title: 'Issue Date' },
          { id: 'transaction_description', title: 'Transaction Description' },
          { id: 'created_at', title: 'Created At' },
        ]
      });

      const csvHeader = csvStringifier.getHeaderString();
      const csvBody = csvStringifier.stringifyRecords(result.rows);

      return csvHeader + csvBody;
    } catch (error) {
      console.error('SKR CSV export error:', error);
      throw error;
    }
  }

  /**
   * Generate PDF report for transactions
   */
  async generateTransactionsPDF(userId, userName, userEmail, filters = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get transactions
        let queryText = `
          SELECT 
            t.type,
            t.from_currency,
            t.from_amount,
            t.to_currency,
            t.to_amount,
            t.status,
            t.fee_amount,
            t.description,
            t.created_at
          FROM transactions t
          WHERE t.user_id = $1
        `;

        const params = [userId];
        let paramCount = 1;

        if (filters.startDate) {
          paramCount++;
          queryText += ` AND t.created_at >= $${paramCount}`;
          params.push(filters.startDate);
        }

        if (filters.endDate) {
          paramCount++;
          queryText += ` AND t.created_at <= $${paramCount}`;
          params.push(filters.endDate);
        }

        queryText += ` ORDER BY t.created_at DESC LIMIT 100`;

        const result = await query(queryText, params);

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(20).fillColor('#FFD700').text('UOB Security House', { align: 'center' });
        doc.fontSize(16).fillColor('#000').text('Transaction Report', { align: 'center' });
        doc.moveDown();

        // User info
        doc.fontSize(10).fillColor('#666')
          .text(`Name: ${userName}`, 50, doc.y)
          .text(`Email: ${userEmail}`, 50, doc.y)
          .text(`Generated: ${new Date().toLocaleString()}`, 50, doc.y);
        
        doc.moveDown();
        doc.strokeColor('#FFD700').lineWidth(2).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Transactions table
        if (result.rows.length === 0) {
          doc.fontSize(12).fillColor('#000').text('No transactions found.', { align: 'center' });
        } else {
          doc.fontSize(10).fillColor('#000');

          result.rows.forEach((transaction, index) => {
            if (doc.y > 700) {
              doc.addPage();
            }

            // Transaction details
            doc.fontSize(11).fillColor('#FFD700').text(`Transaction #${index + 1}`, 50, doc.y);
            doc.fontSize(10).fillColor('#000')
              .text(`Type: ${transaction.type}`, 60, doc.y)
              .text(`From: ${transaction.from_amount} ${transaction.from_currency}`, 60, doc.y)
              .text(`To: ${transaction.to_amount} ${transaction.to_currency}`, 60, doc.y)
              .text(`Status: ${transaction.status}`, 60, doc.y)
              .text(`Fee: ${transaction.fee_amount || 0}`, 60, doc.y)
              .text(`Date: ${new Date(transaction.created_at).toLocaleString()}`, 60, doc.y);

            if (transaction.description) {
              doc.text(`Description: ${transaction.description}`, 60, doc.y);
            }

            doc.moveDown();
            doc.strokeColor('#DDD').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();
          });
        }

        // Footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).fillColor('#999')
            .text(
              `Page ${i + 1} of ${pageCount}`,
              50,
              doc.page.height - 50,
              { align: 'center' }
            );
        }

        doc.end();
      } catch (error) {
        console.error('PDF generation error:', error);
        reject(error);
      }
    });
  }

  /**
   * Generate PDF report for gold holdings
   */
  async generateGoldHoldingsPDF(userId, userName, userEmail) {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await query(
          `SELECT 
            weight_grams,
            purchase_price_per_gram,
            total_value_usd,
            current_value_usd,
            profit_loss_usd,
            source_crypto,
            source_crypto_amount,
            status,
            created_at
          FROM gold_holdings
          WHERE user_id = $1
          ORDER BY created_at DESC`,
          [userId]
        );

        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(20).fillColor('#FFD700').text('UOB Security House', { align: 'center' });
        doc.fontSize(16).fillColor('#000').text('Gold Holdings Report', { align: 'center' });
        doc.moveDown();

        // User info
        doc.fontSize(10).fillColor('#666')
          .text(`Name: ${userName}`, 50, doc.y)
          .text(`Email: ${userEmail}`, 50, doc.y)
          .text(`Generated: ${new Date().toLocaleString()}`, 50, doc.y);
        
        doc.moveDown();
        doc.strokeColor('#FFD700').lineWidth(2).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Summary
        const totalWeight = result.rows.reduce((sum, h) => sum + parseFloat(h.weight_grams || 0), 0);
        const totalValue = result.rows.reduce((sum, h) => sum + parseFloat(h.current_value_usd || h.total_value_usd || 0), 0);
        const totalPL = result.rows.reduce((sum, h) => sum + parseFloat(h.profit_loss_usd || 0), 0);

        doc.fontSize(12).fillColor('#FFD700').text('Summary', 50, doc.y);
        doc.fontSize(10).fillColor('#000')
          .text(`Total Holdings: ${result.rows.length}`, 60, doc.y)
          .text(`Total Weight: ${totalWeight.toFixed(2)} grams`, 60, doc.y)
          .text(`Total Value: $${totalValue.toFixed(2)}`, 60, doc.y)
          .text(`Total P&L: ${totalPL >= 0 ? '+' : ''}$${totalPL.toFixed(2)}`, 60, doc.y);

        doc.moveDown();
        doc.strokeColor('#DDD').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Holdings details
        if (result.rows.length === 0) {
          doc.fontSize(12).fillColor('#000').text('No gold holdings found.', { align: 'center' });
        } else {
          result.rows.forEach((holding, index) => {
            if (doc.y > 700) {
              doc.addPage();
            }

            doc.fontSize(11).fillColor('#FFD700').text(`Holding #${index + 1}`, 50, doc.y);
            doc.fontSize(10).fillColor('#000')
              .text(`Weight: ${holding.weight_grams} grams`, 60, doc.y)
              .text(`Purchase Price: $${holding.purchase_price_per_gram}/gram`, 60, doc.y)
              .text(`Total Paid: $${holding.total_value_usd}`, 60, doc.y)
              .text(`Current Value: $${holding.current_value_usd || holding.total_value_usd}`, 60, doc.y)
              .text(`P&L: ${holding.profit_loss_usd >= 0 ? '+' : ''}$${holding.profit_loss_usd || 0}`, 60, doc.y)
              .text(`Source: ${holding.source_crypto_amount} ${holding.source_crypto}`, 60, doc.y)
              .text(`Status: ${holding.status}`, 60, doc.y)
              .text(`Date: ${new Date(holding.created_at).toLocaleString()}`, 60, doc.y);

            doc.moveDown();
            doc.strokeColor('#DDD').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();
          });
        }

        // Footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).fillColor('#999')
            .text(
              `Page ${i + 1} of ${pageCount}`,
              50,
              doc.page.height - 50,
              { align: 'center' }
            );
        }

        doc.end();
      } catch (error) {
        console.error('Gold PDF generation error:', error);
        reject(error);
      }
    });
  }
}

module.exports = new ExportService();


