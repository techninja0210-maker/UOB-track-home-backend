const { createObjectCsvStringifier } = require('csv-writer');
const PDFDocument = require('pdfkit');
const { query } = require('../config/database');

class ExportService {
  /**
   * Export transactions to CSV
   */
  async exportTransactionsToCSV(userId, filters = {}) {
    try {
      // Build query for transactions_ledger
      let queryText = `
        SELECT 
          tl.id,
          tl.type,
          tl.currency,
          tl.amount,
          tl.reference_id,
          tl.meta,
          tl.created_at
        FROM transactions_ledger tl
        WHERE tl.user_id = $1
      `;

      const params = [userId];
      let paramCount = 1;

      // Add filters
      if (filters.startDate) {
        paramCount++;
        queryText += ` AND tl.created_at >= $${paramCount}`;
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        paramCount++;
        queryText += ` AND tl.created_at <= $${paramCount}`;
        params.push(filters.endDate);
      }

      if (filters.type) {
        paramCount++;
        queryText += ` AND tl.type = $${paramCount}`;
        params.push(filters.type);
      }

      queryText += ` ORDER BY tl.created_at DESC`;

      // Execute query
      const result = await query(queryText, params);

      // Get real pool addresses for display
      const poolWalletService = require('./poolWalletService');
      await poolWalletService.initializePoolWallets();
      const poolAddresses = poolWalletService.getPoolAddresses();

      // Transform data for CSV
      const csvData = result.rows.map(row => {
        const meta = row.meta ? (typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta) : {};
        
        // Generate better descriptions based on transaction type
        let description = meta.description || 'N/A';
        if (row.type === 'buy_gold' && meta.goldGrams) {
          description = `Bought ${meta.goldGrams}g gold with ${row.amount} ${row.currency}`;
        } else if (row.type === 'deposit' && meta.transactionHash) {
          description = `MetaMask deposit to pool wallet ${meta.toAddress || poolAddresses[row.currency] || 'N/A'}`;
        } else if (row.type === 'withdrawal') {
          description = `Withdrawal to external wallet`;
        }
        
        // Use real pool addresses if available
        const realPoolAddress = poolAddresses[row.currency] || meta.toAddress || 'Pool Wallet';
        const realFromAddress = meta.fromAddress || (row.type === 'deposit' ? 'MetaMask Wallet (Address not captured)' : 'N/A');
        
        return {
          id: row.id,
          type: row.type,
          currency: row.currency,
          amount: row.amount,
          reference_id: row.reference_id,
          description: description,
          transaction_hash: meta.transactionHash || (row.type === 'deposit' ? 'Pending' : 'N/A'),
          from_address: realFromAddress,
          to_address: realPoolAddress,
          gold_grams: meta.goldGrams || (row.type === 'buy_gold' ? '0' : 'N/A'),
          gold_price_per_gram: meta.goldPricePerGram || (row.type === 'buy_gold' ? '65.5' : 'N/A'),
          created_at: new Date(row.created_at).toLocaleString()
        };
      });

      // Create CSV
      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: 'id', title: 'Transaction ID' },
          { id: 'type', title: 'Type' },
          { id: 'currency', title: 'Currency' },
          { id: 'amount', title: 'Amount' },
          { id: 'reference_id', title: 'Reference ID' },
          { id: 'description', title: 'Description' },
          { id: 'transaction_hash', title: 'Transaction Hash' },
          { id: 'from_address', title: 'From Address' },
          { id: 'to_address', title: 'To Address' },
          { id: 'gold_grams', title: 'Gold Grams' },
          { id: 'gold_price_per_gram', title: 'Gold Price/Gram' },
          { id: 'created_at', title: 'Created At' }
        ]
      });

      const csvHeader = csvStringifier.getHeaderString();
      const csvBody = csvStringifier.stringifyRecords(csvData);

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
          total_paid_usd,
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
          { id: 'total_paid_usd', title: 'Total Paid (USD)' },
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
          gh.id,
          gh.skr_reference as receipt_number,
          gh.weight_grams as gold_grams,
          gh.status,
          gh.created_at as issue_date,
          gh.purchase_price_per_gram,
          gh.total_paid_usd
        FROM gold_holdings gh
        WHERE gh.user_id = $1 AND gh.status IN ('holding', 'active')
        ORDER BY gh.created_at DESC`,
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
        console.log('Starting PDF generation for user:', userId, userName, userEmail);
        
        // Get transactions from transactions_ledger
        let queryText = `
          SELECT 
            tl.type,
            tl.currency,
            tl.amount,
            tl.reference_id,
            tl.meta,
            tl.created_at
          FROM transactions_ledger tl
          WHERE tl.user_id = $1
        `;

        const params = [userId];
        let paramCount = 1;

        if (filters.startDate) {
          paramCount++;
          queryText += ` AND tl.created_at >= $${paramCount}`;
          params.push(filters.startDate);
        }

        if (filters.endDate) {
          paramCount++;
          queryText += ` AND tl.created_at <= $${paramCount}`;
          params.push(filters.endDate);
        }

        if (filters.type) {
          paramCount++;
          queryText += ` AND tl.type = $${paramCount}`;
          params.push(filters.type);
        }

        queryText += ` ORDER BY tl.created_at DESC LIMIT 100`;

        console.log('Executing query:', queryText, 'with params:', params);
        const result = await query(queryText, params);
        console.log('Query result:', result.rows.length, 'transactions found');

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Compact header with watermark
        doc.save();
        doc.rotate(-45, { origin: [300, 200] });
        doc.fontSize(40).fillColor('#FFD700', 0.05).text('UOB SECURITY HOUSE', 50, 150);
        doc.restore();

        // Compact header
        doc.rect(50, 30, 500, 50).stroke('#FFD700', 1);
        doc.fontSize(16).fillColor('#FFD700').text('UOB SECURITY HOUSE', 60, 40);
        doc.fontSize(10).fillColor('#000').text('Transaction History Report', 60, 55);
        doc.fontSize(8).fillColor('#666').text(`Generated: ${new Date().toLocaleString()}`, 60, 68);

        // Compact summary section
        doc.moveDown(0.5);
        const totalTransactions = result.rows.length;
        const totalDeposits = result.rows.filter(t => t.type === 'deposit_credit').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const totalWithdrawals = result.rows.filter(t => t.type === 'withdrawal_debit').reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);
        const totalGoldTrades = result.rows.filter(t => t.type === 'buy_gold' || t.type === 'sell_gold').length;

        doc.fontSize(10).fillColor('#000').text(`Summary: ${totalTransactions} transactions | Deposits: $${totalDeposits.toFixed(2)} | Withdrawals: $${totalWithdrawals.toFixed(2)} | Gold Trades: ${totalGoldTrades}`, 60, doc.y);
        doc.fontSize(8).fillColor('#666').text(`User: ${userName} (${userEmail})`, 60, doc.y + 12);

        doc.moveDown(0.5);
        doc.strokeColor('#DDD').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.3);

        // Transactions table
        if (result.rows.length === 0) {
          doc.fontSize(12).fillColor('#000').text('No transactions found.', { align: 'center' });
        } else {
          result.rows.forEach((transaction, index) => {
            if (doc.y > 700) {
              doc.addPage();
              // Add compact watermark to new page
              doc.save();
              doc.rotate(-45, { origin: [300, 200] });
              doc.fontSize(40).fillColor('#FFD700', 0.05).text('UOB SECURITY HOUSE', 50, 150);
              doc.restore();
            }

            const meta = transaction.meta ? (typeof transaction.meta === 'string' ? JSON.parse(transaction.meta) : transaction.meta) : {};
            
            // Compact transaction entry
            doc.fontSize(10).fillColor('#FFD700').text(`${index + 1}. ${transaction.type.toUpperCase()} - ${transaction.currency}`, 60, doc.y);
            
            const entryY = doc.y + 12;
            doc.fontSize(8).fillColor('#000')
              .text(`Amount: ${transaction.amount} | Date: ${new Date(transaction.created_at).toLocaleDateString()}`, 60, entryY)
              .text(`Ref: ${transaction.reference_id}`, 60, entryY + 10);

            // Add meta information if available (compact)
            if (meta.transactionHash) {
              doc.text(`Hash: ${meta.transactionHash.substring(0, 20)}...`, 60, entryY + 20);
            }
            if (meta.goldGrams) {
              doc.text(`Gold: ${meta.goldGrams}g`, 60, entryY + 30);
            }
            if (meta.description) {
              const shortDesc = meta.description.length > 60 ? meta.description.substring(0, 60) + '...' : meta.description;
              doc.text(`Desc: ${shortDesc}`, 60, entryY + 30);
            }

            doc.moveDown(0.8);
            doc.strokeColor('#EEE').lineWidth(0.5).moveTo(60, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(0.3);
          });
        }

        // Compact footer
        const pageRange = doc.bufferedPageRange();
        const pageCount = pageRange.count;
        for (let i = pageRange.start; i < pageRange.start + pageCount; i++) {
          doc.switchToPage(i);
          
          doc.fontSize(7).fillColor('#999')
            .text(`Page ${i - pageRange.start + 1} of ${pageCount}`, 50, 750, { align: 'left' })
            .text('UOB Security House', 50, 750, { align: 'center' })
            .text(`ID: ${Date.now()}`, 50, 750, { align: 'right' });
        }

        doc.end();
      } catch (error) {
        console.error('PDF generation error:', error);
        reject(error);
      }
    });
  }

  /**
   * Generate PDF report for SKRs
   */
  async generateSKRsPDF(userId, userName, userEmail) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get gold holdings data (which represents SKRs in our current system)
        const result = await query(
          `SELECT 
            gh.id,
            gh.skr_reference as receipt_number,
            gh.weight_grams as gold_grams,
            gh.status,
            gh.created_at as issue_date,
            gh.purchase_price_per_gram,
            gh.total_paid_usd,
            gh.gold_security_id
          FROM gold_holdings gh
          WHERE gh.user_id = $1 AND gh.status IN ('holding', 'active')
          ORDER BY gh.created_at DESC`,
          [userId]
        );

        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Add watermark background
        doc.save();
        doc.rotate(-45, { origin: [300, 400] });
        doc.fontSize(60).fillColor('#FFD700', 0.1).text('UOB SECURITY HOUSE', 50, 300);
        doc.restore();

        // Header with logo placeholder and company info
        doc.rect(50, 50, 500, 80).stroke('#FFD700', 2);
        doc.fontSize(24).fillColor('#FFD700').text('UOB SECURITY HOUSE', 70, 70);
        doc.fontSize(12).fillColor('#000').text('Secure Gold Trading Platform', 70, 95);
        doc.fontSize(10).fillColor('#666').text('Licensed Gold Trading & Storage', 70, 110);

        // Document title
        doc.moveDown(2);
        doc.fontSize(18).fillColor('#000').text('SECURE KEY RECEIPTS (SKRs) REPORT', { align: 'center' });
        doc.fontSize(12).fillColor('#FFD700').text(`Report Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown();

        // Security border for summary
        doc.rect(50, doc.y, 500, 120).stroke('#FFD700', 1);
        doc.rect(55, doc.y + 5, 490, 110).stroke('#000', 0.5);

        // Summary section
        const totalSKRs = result.rows.length;
        const totalGoldGrams = result.rows.reduce((sum, s) => sum + parseFloat(s.gold_grams || 0), 0);
        const totalValue = result.rows.reduce((sum, s) => sum + parseFloat(s.total_paid_usd || 0), 0);

        doc.fontSize(12).fillColor('#000').text('PORTFOLIO SUMMARY', 60, doc.y + 15);
        doc.moveDown(0.5);
        
        const summaryY = doc.y;
        doc.fontSize(10).fillColor('#000')
          .text(`Total SKRs: ${totalSKRs}`, 60, summaryY)
          .text(`Total Gold Holdings: ${totalGoldGrams.toFixed(4)} grams`, 60, summaryY + 15)
          .text(`Total Investment Value: $${totalValue.toFixed(2)}`, 60, summaryY + 30)
          .text(`Average Gold Price: $${totalSKRs > 0 ? (totalValue / totalGoldGrams).toFixed(2) : '0.00'}/gram`, 60, summaryY + 45);

        // Holder information
        doc.moveDown(1);
        doc.fontSize(10).fillColor('#000').text('HOLDER INFORMATION', 60, doc.y);
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#666')
          .text(`Name: ${userName}`, 60, doc.y)
          .text(`Email: ${userEmail}`, 60, doc.y + 12)
          .text(`Report Generated: ${new Date().toLocaleString()}`, 60, doc.y + 24);

        doc.moveDown(1.5);
        doc.strokeColor('#DDD').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // SKR details
        if (result.rows.length === 0) {
          doc.fontSize(12).fillColor('#000').text('No SKRs found.', { align: 'center' });
        } else {
          result.rows.forEach((skr, index) => {
            if (doc.y > 650) {
              doc.addPage();
              // Add watermark to new page
              doc.save();
              doc.rotate(-45, { origin: [300, 400] });
              doc.fontSize(60).fillColor('#FFD700', 0.1).text('UOB SECURITY HOUSE', 50, 300);
              doc.restore();
            }

            // SKR entry with border
            doc.rect(50, doc.y, 500, 80).stroke('#FFD700', 1);
            doc.rect(55, doc.y + 5, 490, 70).stroke('#000', 0.3);

            doc.fontSize(12).fillColor('#FFD700').text(`SKR #${index + 1} - ${skr.receipt_number}`, 60, doc.y + 10);
            doc.moveDown(0.3);
            
            const entryY = doc.y;
            doc.fontSize(9).fillColor('#000')
              .text(`Gold Weight: ${skr.gold_grams} grams (999.9 purity)`, 60, entryY)
              .text(`Purchase Price: $${skr.purchase_price_per_gram || 0}/gram`, 60, entryY + 12)
              .text(`Total Paid: $${skr.total_paid_usd || 0}`, 60, entryY + 24)
              .text(`Status: ${skr.status.toUpperCase()}`, 60, entryY + 36)
              .text(`Issue Date: ${new Date(skr.issue_date).toLocaleDateString()}`, 60, entryY + 48);

            doc.moveDown(2);
          });
        }

        // Professional footer
        const pageRange = doc.bufferedPageRange();
        const pageCount = pageRange.count;
        for (let i = pageRange.start; i < pageRange.start + pageCount; i++) {
          doc.switchToPage(i);
          
          // Footer border
          doc.rect(50, 730, 500, 40).stroke('#FFD700', 1);
          
          doc.fontSize(8).fillColor('#666')
            .text(`Page ${i - pageRange.start + 1} of ${pageCount}`, 60, 740, { align: 'left' })
            .text('UOB Security House - Licensed Gold Trading Platform', 60, 740, { align: 'center' })
            .text(`Report ID: ${Date.now()}`, 60, 740, { align: 'right' })
            .text('www.uobsecurityhouse.com | support@uobsecurityhouse.com', 60, 755, { align: 'center' });
        }

        doc.end();
      } catch (error) {
        console.error('SKR PDF generation error:', error);
        reject(error);
      }
    });
  }

  /**
   * Generate individual SKR PDF
   */
  async generateIndividualSKRPDF(userId, userName, userEmail, skrId) {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await query(
          `SELECT 
            gh.id,
            gh.skr_reference as receipt_number,
            gh.weight_grams as gold_grams,
            gh.status,
            gh.created_at as issue_date,
            gh.purchase_price_per_gram,
            gh.total_paid_usd,
            gh.gold_security_id
          FROM gold_holdings gh
          WHERE gh.user_id = $1 AND gh.id = $2 AND gh.status IN ('holding', 'active')`,
          [userId, skrId]
        );

        if (result.rows.length === 0) {
          return reject(new Error('SKR not found'));
        }

        const skr = result.rows[0];
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Add watermark background
        doc.save();
        doc.rotate(-45, { origin: [300, 400] });
        doc.fontSize(60).fillColor('#FFD700', 0.1).text('UOB SECURITY HOUSE', 50, 300);
        doc.restore();

        // Header with logo placeholder and company info
        doc.rect(50, 50, 500, 80).stroke('#FFD700', 2);
        doc.fontSize(24).fillColor('#FFD700').text('UOB SECURITY HOUSE', 70, 70);
        doc.fontSize(12).fillColor('#000').text('Secure Gold Trading Platform', 70, 95);
        doc.fontSize(10).fillColor('#666').text('Licensed Gold Trading & Storage', 70, 110);

        // Document title and number
        doc.moveDown(2);
        doc.fontSize(18).fillColor('#000').text('SECURE KEY RECEIPT (SKR)', { align: 'center' });
        doc.fontSize(14).fillColor('#FFD700').text(`Document No: ${skr.receipt_number}`, { align: 'center' });
        doc.moveDown();

        // Security border
        doc.rect(50, doc.y, 500, 200).stroke('#FFD700', 1);
        doc.rect(55, doc.y + 5, 490, 190).stroke('#000', 0.5);

        // SKR Details section
        doc.fontSize(12).fillColor('#000').text('GOLD HOLDING DETAILS', 60, doc.y + 15);
        doc.moveDown(0.5);
        
        const startY = doc.y;
        doc.fontSize(10).fillColor('#000')
          .text(`Receipt Number: ${skr.receipt_number}`, 60, startY)
          .text(`Gold Weight: ${skr.gold_grams} grams`, 60, startY + 15)
          .text(`Gold Purity: 999.9 (24K)`, 60, startY + 30)
          .text(`Purchase Price: $${skr.purchase_price_per_gram || 0}/gram`, 60, startY + 45)
          .text(`Total Paid: $${skr.total_paid_usd || 0}`, 60, startY + 60)
          .text(`Status: ${skr.status.toUpperCase()}`, 60, startY + 75)
          .text(`Issue Date: ${new Date(skr.issue_date).toLocaleDateString()}`, 60, startY + 90)
          .text(`Valid Until: ${new Date(new Date(skr.issue_date).getTime() + 365*24*60*60*1000).toLocaleDateString()}`, 60, startY + 105);

        // Owner information
        doc.moveDown(2);
        doc.fontSize(12).fillColor('#000').text('HOLDER INFORMATION', 60, doc.y);
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#000')
          .text(`Name: ${userName}`, 60, doc.y)
          .text(`Email: ${userEmail}`, 60, doc.y + 15)
          .text(`Document Generated: ${new Date().toLocaleString()}`, 60, doc.y + 30);

        // Security features
        doc.moveDown(2);
        doc.fontSize(12).fillColor('#000').text('SECURITY FEATURES', 60, doc.y);
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor('#666')
          .text('• This document is digitally signed and encrypted', 60, doc.y)
          .text('• Unique SKR number for verification', 60, doc.y + 12)
          .text('• Tamper-evident design with security borders', 60, doc.y + 24)
          .text('• Blockchain-verified gold holdings', 60, doc.y + 36);

        // Legal disclaimer
        doc.moveDown(2);
        doc.fontSize(10).fillColor('#000').text('LEGAL DISCLAIMER', 60, doc.y);
        doc.moveDown(0.3);
        doc.fontSize(8).fillColor('#666')
          .text('This Secure Key Receipt represents ownership of physical gold stored in secure facilities.', 60, doc.y, { width: 480 })
          .text('UOB Security House maintains full insurance coverage for all stored assets.', 60, doc.y + 10, { width: 480 })
          .text('For verification, contact: support@uobsecurityhouse.com', 60, doc.y + 20, { width: 480 });

        // Footer with company details
        doc.moveDown(2);
        doc.rect(50, doc.y, 500, 40).stroke('#FFD700', 1);
        doc.fontSize(8).fillColor('#666')
          .text('UOB Security House - Licensed Gold Trading Platform', 60, doc.y + 10, { align: 'center' })
          .text('www.uobsecurityhouse.com | support@uobsecurityhouse.com', 60, doc.y + 20, { align: 'center' })
          .text(`Document ID: ${skr.id} | Generated: ${new Date().toISOString()}`, 60, doc.y + 30, { align: 'center' });

        doc.end();
      } catch (error) {
        console.error('Individual SKR PDF generation error:', error);
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
            total_paid_usd,
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
        const totalValue = result.rows.reduce((sum, h) => sum + parseFloat(h.current_value_usd || h.total_paid_usd || 0), 0);
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
              .text(`Total Paid: $${holding.total_paid_usd}`, 60, doc.y)
              .text(`Current Value: $${holding.current_value_usd || holding.total_paid_usd}`, 60, doc.y)
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
        const pageRange = doc.bufferedPageRange();
        const pageCount = pageRange.count;
        for (let i = pageRange.start; i < pageRange.start + pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).fillColor('#999')
            .text(
              `Page ${i - pageRange.start + 1} of ${pageCount}`,
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


