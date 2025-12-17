import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateSampleDataDictionary() {
  const workbook = new ExcelJS.Workbook();

  // === TableMetadata sheet ===
  const tableSheet = workbook.addWorksheet('TableMetadata');

  tableSheet.addRow([
    'Logical Table Name',
    'Data Kind',
    'Description',
    'Domain'
  ]);

  const tableRows = [
    // Core sales domain
    ['Customer', 'entity', 'End customers placing orders', 'Sales'],
    ['Order', 'entity', 'Customer orders', 'Sales'],
    ['OrderLine', 'entity', 'Line items for each order', 'Sales'],

    // Catalog / product domain
    ['Product', 'entity', 'Products available for sale', 'Catalog'],

    // Operations / inventory domain
    ['InventoryTransaction', 'entity', 'Inventory movements for products', 'Operations'],

    // Billing / finance domain
    ['Invoice', 'entity', 'Invoices generated for orders', 'Billing'],
    ['Payment', 'entity', 'Payments received for invoices', 'Billing'],

    // Shared/static lookup tables
    ['Country', 'staticentity', 'Country reference data', 'Shared'],
    ['Currency', 'staticentity', 'Currency reference data', 'Shared'],
    ['OrderStatus', 'staticentity', 'Allowed order statuses', 'Sales'],
    ['PaymentMethod', 'staticentity', 'Allowed payment methods', 'Billing']
  ];

  for (const row of tableRows) {
    tableSheet.addRow(row);
  }

  // === AttributeMetadata sheet ===
  const attributeSheet = workbook.addWorksheet('AttributeMetadata');

  attributeSheet.addRow([
    'Logical Table Name',
    'Attribute Name',
    'Type',
    'Is Autonumber',
    'Reference Table',
    'Column Table',
    'Description'
  ]);

  const attributeRows = [
    // Customer
    ['Customer', 'CustomerId', 'int', 'true', '', '', 'Primary key for Customer'],
    ['Customer', 'Name', 'varchar(200)', 'false', '', '', 'Customer name'],
    ['Customer', 'Email', 'varchar(200)', 'false', '', '', 'Primary contact email'],
    ['Customer', 'CountryCode', 'varchar(3)', 'false', 'Country', 'Code', 'FK to Country'],

    // Order
    ['Order', 'OrderId', 'int', 'true', '', '', 'Primary key for Order'],
    ['Order', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    ['Order', 'OrderDate', 'datetime', 'false', '', '', 'Date the order was placed'],
    ['Order', 'StatusCode', 'varchar(20)', 'false', 'OrderStatus', 'Code', 'FK to OrderStatus'],
    ['Order', 'CurrencyCode', 'varchar(3)', 'false', 'Currency', 'Code', 'FK to Currency'],
    ['Order', 'TotalAmount', 'decimal(18,2)', 'false', '', '', 'Total order amount'],

    // OrderLine
    ['OrderLine', 'OrderLineId', 'int', 'true', '', '', 'Primary key for OrderLine'],
    ['OrderLine', 'OrderId', 'int', 'false', 'Order', 'OrderId', 'FK to Order'],
    ['OrderLine', 'ProductId', 'int', 'false', 'Product', 'ProductId', 'FK to Product'],
    ['OrderLine', 'Quantity', 'int', 'false', '', '', 'Quantity ordered'],
    ['OrderLine', 'UnitPrice', 'decimal(18,2)', 'false', '', '', 'Price per unit at time of order'],

    // Product
    ['Product', 'ProductId', 'int', 'true', '', '', 'Primary key for Product'],
    ['Product', 'Name', 'varchar(200)', 'false', '', '', 'Product name'],
    ['Product', 'SKU', 'varchar(50)', 'false', '', '', 'Stock keeping unit identifier'],

    // InventoryTransaction
    ['InventoryTransaction', 'InventoryTransactionId', 'int', 'true', '', '', 'Primary key for InventoryTransaction'],
    ['InventoryTransaction', 'ProductId', 'int', 'false', 'Product', 'ProductId', 'FK to Product'],
    ['InventoryTransaction', 'QuantityDelta', 'int', 'false', '', '', 'Change in inventory quantity'],
    ['InventoryTransaction', 'TransactionDate', 'datetime', 'false', '', '', 'Date of inventory movement'],

    // Invoice
    ['Invoice', 'InvoiceId', 'int', 'true', '', '', 'Primary key for Invoice'],
    ['Invoice', 'OrderId', 'int', 'false', 'Order', 'OrderId', 'FK to Order'],
    ['Invoice', 'InvoiceDate', 'datetime', 'false', '', '', 'Date of invoice'],
    ['Invoice', 'TotalAmount', 'decimal(18,2)', 'false', '', '', 'Total invoiced amount'],

    // Payment
    ['Payment', 'PaymentId', 'int', 'true', '', '', 'Primary key for Payment'],
    ['Payment', 'InvoiceId', 'int', 'false', 'Invoice', 'InvoiceId', 'FK to Invoice'],
    ['Payment', 'Amount', 'decimal(18,2)', 'false', '', '', 'Amount paid'],
    ['Payment', 'PaymentDate', 'datetime', 'false', '', '', 'Date of payment'],
    ['Payment', 'PaymentMethodCode', 'varchar(20)', 'false', 'PaymentMethod', 'Code', 'FK to PaymentMethod'],

    // Country (lookup)
    ['Country', 'Code', 'varchar(3)', 'true', '', '', 'Country code (e.g., USA, CAN)'],
    ['Country', 'Name', 'varchar(200)', 'false', '', '', 'Country name'],

    // Currency (lookup)
    ['Currency', 'Code', 'varchar(3)', 'true', '', '', 'Currency code (e.g., USD, EUR)'],
    ['Currency', 'Name', 'varchar(100)', 'false', '', '', 'Currency name'],

    // OrderStatus (lookup)
    ['OrderStatus', 'Code', 'varchar(20)', 'true', '', '', 'Status code (e.g., NEW, SHIPPED, CANCELLED)'],
    ['OrderStatus', 'Description', 'varchar(200)', 'false', '', '', 'Status description'],

    // PaymentMethod (lookup)
    ['PaymentMethod', 'Code', 'varchar(20)', 'true', '', '', 'Payment method code (e.g., CARD, BANK_TRANSFER)'],
    ['PaymentMethod', 'Description', 'varchar(200)', 'false', '', '', 'Payment method description']
  ];

  for (const row of attributeRows) {
    attributeSheet.addRow(row);
  }

  const outputPath = path.join(__dirname, '..', 'docs', 'Sample_DataDictionary.xlsx');
  await workbook.xlsx.writeFile(outputPath);

  console.log(`✅ Sample data dictionary written to: ${outputPath}`);
}

generateSampleDataDictionary().catch((err) => {
  console.error('❌ Failed to generate sample data dictionary:', err);
  process.exit(1);
});






