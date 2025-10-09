const { query } = require('../config/database');

class Receipt {
  // Generate reference number
  static generateReferenceNumber() {
    const timestamp = Date.now().toString().slice(-8);
    return 'UOB' + timestamp;
  }

  // Get all receipts
  static async findAll() {
    const result = await query(
      'SELECT * FROM receipts ORDER BY created_at DESC'
    );
    return result.rows;
  }

  // Find receipt by ID
  static async findById(id) {
    const result = await query(
      'SELECT * FROM receipts WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  // Find receipt by reference number
  static async findByReferenceNumber(referenceNumber) {
    const result = await query(
      'SELECT * FROM receipts WHERE reference_number = $1',
      [referenceNumber.toUpperCase()]
    );
    return result.rows[0];
  }

  // Create new receipt
  static async create(receiptData) {
    const {
      dateOfIssue,
      dateOfRelease,
      depositorName,
      representative,
      depositorsAddress,
      type,
      dateOfInitialDeposit,
      nameType,
      numberOfItems,
      chargePerBox,
      origin,
      declaredValue,
      weight,
      status = 'active'
    } = receiptData;

    const referenceNumber = this.generateReferenceNumber();

    const result = await query(
      `INSERT INTO receipts (
        reference_number, date_of_issue, date_of_release, depositor_name,
        representative, depositors_address, type, date_of_initial_deposit,
        name_type, number_of_items, charge_per_box, origin, declared_value,
        weight, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        referenceNumber, dateOfIssue, dateOfRelease, depositorName,
        representative, depositorsAddress, type, dateOfInitialDeposit,
        nameType, numberOfItems, chargePerBox, origin, declaredValue,
        weight, status
      ]
    );

    return result.rows[0];
  }

  // Update receipt
  static async update(id, receiptData) {
    const {
      dateOfIssue,
      dateOfRelease,
      depositorName,
      representative,
      depositorsAddress,
      type,
      dateOfInitialDeposit,
      nameType,
      numberOfItems,
      chargePerBox,
      origin,
      declaredValue,
      weight,
      status
    } = receiptData;

    const result = await query(
      `UPDATE receipts SET
        date_of_issue = $1,
        date_of_release = $2,
        depositor_name = $3,
        representative = $4,
        depositors_address = $5,
        type = $6,
        date_of_initial_deposit = $7,
        name_type = $8,
        number_of_items = $9,
        charge_per_box = $10,
        origin = $11,
        declared_value = $12,
        weight = $13,
        status = $14
      WHERE id = $15
      RETURNING *`,
      [
        dateOfIssue, dateOfRelease, depositorName, representative,
        depositorsAddress, type, dateOfInitialDeposit, nameType,
        numberOfItems, chargePerBox, origin, declaredValue, weight,
        status, id
      ]
    );

    return result.rows[0];
  }

  // Delete receipt
  static async delete(id) {
    const result = await query(
      'DELETE FROM receipts WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rowCount > 0;
  }

  // Get statistics
  static async getStatistics() {
    const result = await query('SELECT * FROM receipt_statistics');
    return result.rows[0];
  }

  // Search receipts
  static async search(searchTerm) {
    const result = await query(
      `SELECT * FROM receipts 
       WHERE reference_number ILIKE $1 
          OR depositor_name ILIKE $1 
          OR type ILIKE $1 
          OR name_type ILIKE $1
       ORDER BY created_at DESC`,
      [`%${searchTerm}%`]
    );
    return result.rows;
  }
}

module.exports = Receipt;
