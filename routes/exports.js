const express = require('express');
const router = express.Router();
const auth = require('./auth');
const exportService = require('../services/exportService');
const { query } = require('../config/database');

/**
 * Export transactions to CSV
 * GET /api/exports/transactions/csv
 */
router.get('/transactions/csv', auth.authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      type: req.query.type,
      status: req.query.status,
    };

    const csv = await exportService.exportTransactionsToCSV(userId, filters);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transactions_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Transaction CSV export error:', error);
    res.status(500).json({ message: 'Failed to export transactions' });
  }
});

/**
 * Export gold holdings to CSV
 * GET /api/exports/gold-holdings/csv
 */
router.get('/gold-holdings/csv', auth.authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const csv = await exportService.exportGoldHoldingsToCSV(userId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gold_holdings_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Gold holdings CSV export error:', error);
    res.status(500).json({ message: 'Failed to export gold holdings' });
  }
});

/**
 * Export SKRs to CSV
 * GET /api/exports/skrs/csv
 */
router.get('/skrs/csv', auth.authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const csv = await exportService.exportSKRsToCSV(userId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="skrs_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('SKR CSV export error:', error);
    res.status(500).json({ message: 'Failed to export SKRs' });
  }
});

/**
 * Export transactions to PDF
 * GET /api/exports/transactions/pdf
 */
router.get('/transactions/pdf', auth.authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = req.user;
    
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const pdfBuffer = await exportService.generateTransactionsPDF(
      userId,
      user.fullName,
      user.email,
      filters
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="transactions_report_${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Transaction PDF export error:', error);
    res.status(500).json({ message: 'Failed to generate PDF report' });
  }
});

/**
 * Export gold holdings to PDF
 * GET /api/exports/gold-holdings/pdf
 */
router.get('/gold-holdings/pdf', auth.authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = req.user;

    const pdfBuffer = await exportService.generateGoldHoldingsPDF(
      userId,
      user.fullName,
      user.email
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="gold_holdings_report_${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Gold holdings PDF export error:', error);
    res.status(500).json({ message: 'Failed to generate PDF report' });
  }
});

/**
 * Admin: Export all transactions to CSV
 * GET /api/exports/admin/transactions/csv
 */
router.get('/admin/transactions/csv', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        t.id,
        u.full_name,
        u.email,
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
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC`
    );

    const { createObjectCsvStringifier } = require('csv-writer');
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'id', title: 'Transaction ID' },
        { id: 'full_name', title: 'User Name' },
        { id: 'email', title: 'User Email' },
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

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="all_transactions_${Date.now()}.csv"`);
    res.send(csvHeader + csvBody);
  } catch (error) {
    console.error('Admin transaction CSV export error:', error);
    res.status(500).json({ message: 'Failed to export all transactions' });
  }
});

module.exports = router;


