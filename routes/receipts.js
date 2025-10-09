const express = require('express');
const router = express.Router();
const Receipt = require('../models/Receipt');

// Get receipt by reference number (for client tracking)
router.get('/:referenceNumber', async (req, res) => {
  try {
    const receipt = await Receipt.findByReferenceNumber(req.params.referenceNumber);
    
    if (!receipt) {
      return res.status(404).json({ 
        message: 'Receipt not found with the provided reference number' 
      });
    }
    
    // Format response to match frontend expectations
    const formattedReceipt = {
      referenceNumber: receipt.reference_number,
      dateOfIssue: receipt.date_of_issue,
      dateOfRelease: receipt.date_of_release,
      depositorName: receipt.depositor_name,
      representative: receipt.representative,
      depositorsAddress: receipt.depositors_address,
      type: receipt.type,
      dateOfInitialDeposit: receipt.date_of_initial_deposit,
      nameType: receipt.name_type,
      numberOfItems: receipt.number_of_items,
      chargePerBox: parseFloat(receipt.charge_per_box),
      origin: receipt.origin,
      declaredValue: parseFloat(receipt.declared_value),
      weight: parseFloat(receipt.weight),
      status: receipt.status
    };
    
    res.json(formattedReceipt);
  } catch (error) {
    console.error('Get receipt error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Generate PDF data for receipt
router.get('/:referenceNumber/pdf', async (req, res) => {
  try {
    const receipt = await Receipt.findByReferenceNumber(req.params.referenceNumber);
    
    if (!receipt) {
      return res.status(404).json({ 
        message: 'Receipt not found with the provided reference number' 
      });
    }
    
    // Return receipt data formatted for PDF generation
    const pdfData = {
      referenceNumber: receipt.reference_number,
      dateOfIssue: new Date(receipt.date_of_issue).toLocaleDateString(),
      dateOfRelease: receipt.date_of_release ? new Date(receipt.date_of_release).toLocaleDateString() : 'N/A',
      depositorName: receipt.depositor_name,
      representative: receipt.representative || 'N/A',
      depositorsAddress: receipt.depositors_address,
      type: receipt.type,
      dateOfInitialDeposit: new Date(receipt.date_of_initial_deposit).toLocaleDateString(),
      nameType: receipt.name_type,
      numberOfItems: receipt.number_of_items,
      chargePerBox: parseFloat(receipt.charge_per_box),
      origin: receipt.origin,
      declaredValue: parseFloat(receipt.declared_value),
      weight: parseFloat(receipt.weight),
      status: receipt.status
    };
    
    res.json(pdfData);
  } catch (error) {
    console.error('Get PDF data error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;