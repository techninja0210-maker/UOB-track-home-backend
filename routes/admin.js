const express = require('express');
const router = express.Router();
const Receipt = require('../models/Receipt');

// Get all receipts (admin view)
router.get('/receipts', async (req, res) => {
  try {
    const receipts = await Receipt.findAll();
    
    // Format response to match frontend expectations
    const formattedReceipts = receipts.map(receipt => ({
      _id: receipt.id,
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
      status: receipt.status,
      createdAt: receipt.created_at,
      updatedAt: receipt.updated_at
    }));
    
    res.json(formattedReceipts);
  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new receipt
router.post('/receipts', async (req, res) => {
  try {
    const receipt = await Receipt.create(req.body);
    
    // Format response
    const formattedReceipt = {
      _id: receipt.id,
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
      status: receipt.status,
      createdAt: receipt.created_at,
      updatedAt: receipt.updated_at
    };
    
    res.status(201).json(formattedReceipt);
  } catch (error) {
    console.error('Create receipt error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update receipt
router.put('/receipts/:id', async (req, res) => {
  try {
    const receipt = await Receipt.update(req.params.id, req.body);
    
    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found' });
    }
    
    // Format response
    const formattedReceipt = {
      _id: receipt.id,
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
      status: receipt.status,
      createdAt: receipt.created_at,
      updatedAt: receipt.updated_at
    };
    
    res.json(formattedReceipt);
  } catch (error) {
    console.error('Update receipt error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete receipt
router.delete('/receipts/:id', async (req, res) => {
  try {
    const success = await Receipt.delete(req.params.id);
    
    if (!success) {
      return res.status(404).json({ message: 'Receipt not found' });
    }
    
    res.json({ message: 'Receipt deleted successfully' });
  } catch (error) {
    console.error('Delete receipt error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get receipt by ID (admin view)
router.get('/receipts/:id', async (req, res) => {
  try {
    const receipt = await Receipt.findById(req.params.id);
    
    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found' });
    }
    
    // Format response
    const formattedReceipt = {
      _id: receipt.id,
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
      status: receipt.status,
      createdAt: receipt.created_at,
      updatedAt: receipt.updated_at
    };
    
    res.json(formattedReceipt);
  } catch (error) {
    console.error('Get receipt error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;