import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateAdvancedDataDictionary() {
  const workbook = new ExcelJS.Workbook();

  // === TableMetadata sheet ===
  const tableSheet = workbook.addWorksheet('TableMetadata');

  tableSheet.addRow([
    'Logical Table Name',
    'Data Kind',
    'Description',
    'Domain'
  ]);

  // We deliberately create a few hub tables:
  // - Account: parent for Customer, Subscription, Invoice
  // - Customer: referenced by Order, Subscription, SupportTicket, Interaction
  // - Product: referenced by OrderLine, InventoryTransaction, PriceListItem, CampaignTarget, FeatureFlag
  // - Opportunity: referenced by OpportunityStageHistory, Activity, CampaignResponse
  const tableRows = [
    // Core account & customer domain
    ['Account', 'entity', 'Top-level customer organization / tenant', 'Core'],
    ['Customer', 'entity', 'Individual customer contacts under an account', 'Core'],
    ['ContactPreference', 'entity', 'Per-customer communication preferences', 'Core'],

    // Sales domain
    ['Order', 'entity', 'Customer orders', 'Sales'],
    ['OrderLine', 'entity', 'Line items for each order', 'Sales'],
    ['Opportunity', 'entity', 'Sales opportunities per account', 'Sales'],
    ['OpportunityStageHistory', 'entity', 'Stage history for each opportunity', 'Sales'],
    ['SalesActivity', 'entity', 'Emails / calls tied to opportunities and accounts', 'Sales'],

    // Subscription / billing domain
    ['Subscription', 'entity', 'Active subscriptions per account/customer', 'Billing'],
    ['Invoice', 'entity', 'Invoices generated for orders and subscriptions', 'Billing'],
    ['InvoiceLine', 'entity', 'Line items on invoices', 'Billing'],
    ['Payment', 'entity', 'Payments received for invoices', 'Billing'],

    // Product / catalog domain
    ['Product', 'entity', 'Products and services available for sale', 'Catalog'],
    ['PriceList', 'entity', 'Named price lists per market / segment', 'Catalog'],
    ['PriceListItem', 'entity', 'Product-specific pricing entries in a price list', 'Catalog'],
    ['FeatureFlag', 'entity', 'Feature flags tied to products and plans', 'Catalog'],

    // Operations / fulfillment domain
    ['InventoryLocation', 'entity', 'Logical inventory locations / warehouses', 'Operations'],
    ['InventoryTransaction', 'entity', 'Inventory movements for products', 'Operations'],
    ['Shipment', 'entity', 'Shipments fulfilling orders', 'Operations'],
    ['ShipmentItem', 'entity', 'Line items for each shipment', 'Operations'],

    // Support domain
    ['SupportTicket', 'entity', 'Support tickets per account/customer', 'Support'],
    ['TicketComment', 'entity', 'Comments on support tickets', 'Support'],
    ['CustomerInteraction', 'entity', 'Generic logged interactions (email, chat, call)', 'Support'],

    // Marketing domain
    ['Campaign', 'entity', 'Marketing campaigns', 'Marketing'],
    ['CampaignTarget', 'entity', 'Targets (customers, accounts, segments) in a campaign', 'Marketing'],
    ['CampaignResponse', 'entity', 'Responses to campaigns tied to opportunities or customers', 'Marketing'],

    // Shared/static lookups
    ['Country', 'staticentity', 'Country reference data', 'Shared'],
    ['Currency', 'staticentity', 'Currency reference data', 'Shared'],
    ['OrderStatus', 'staticentity', 'Allowed order statuses', 'Sales'],
    ['PaymentMethod', 'staticentity', 'Allowed payment methods', 'Billing'],
    ['SubscriptionPlan', 'staticentity', 'Available subscription plans', 'Billing'],
    ['SupportPriority', 'staticentity', 'Priority levels for tickets', 'Support'],
    ['Channel', 'staticentity', 'Interaction channels (email, phone, chat, etc.)', 'Shared'],
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
    // Account (hub)
    ['Account', 'AccountId', 'int', 'true', '', '', 'Primary key for Account'],
    ['Account', 'Name', 'varchar(200)', 'false', '', '', 'Account name'],
    ['Account', 'CountryCode', 'varchar(3)', 'false', 'Country', 'Code', 'FK to Country'],
    ['Account', 'DefaultCurrencyCode', 'varchar(3)', 'false', 'Currency', 'Code', 'Default currency for billing'],

    // Customer (hub)
    ['Customer', 'CustomerId', 'int', 'true', '', '', 'Primary key for Customer'],
    ['Customer', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'FK to Account'],
    ['Customer', 'Name', 'varchar(200)', 'false', '', '', 'Customer name'],
    ['Customer', 'Email', 'varchar(200)', 'false', '', '', 'Customer email'],
    ['Customer', 'CountryCode', 'varchar(3)', 'false', 'Country', 'Code', 'FK to Country'],

    // ContactPreference
    ['ContactPreference', 'ContactPreferenceId', 'int', 'true', '', '', 'Primary key for ContactPreference'],
    ['ContactPreference', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    ['ContactPreference', 'ChannelCode', 'varchar(20)', 'false', 'Channel', 'Code', 'Preferred channel'],
    ['ContactPreference', 'IsSubscribed', 'bit', 'false', '', '', 'Opt-in flag'],

    // Order
    ['Order', 'OrderId', 'int', 'true', '', '', 'Primary key for Order'],
    ['Order', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'FK to Account'],
    ['Order', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    ['Order', 'OrderDate', 'datetime', 'false', '', '', 'Order date'],
    ['Order', 'StatusCode', 'varchar(20)', 'false', 'OrderStatus', 'Code', 'FK to OrderStatus'],
    ['Order', 'CurrencyCode', 'varchar(3)', 'false', 'Currency', 'Code', 'Billing currency'],
    ['Order', 'TotalAmount', 'decimal(18,2)', 'false', '', '', 'Total order amount'],

    // OrderLine
    ['OrderLine', 'OrderLineId', 'int', 'true', '', '', 'Primary key for OrderLine'],
    ['OrderLine', 'OrderId', 'int', 'false', 'Order', 'OrderId', 'FK to Order'],
    ['OrderLine', 'ProductId', 'int', 'false', 'Product', 'ProductId', 'FK to Product'],
    ['OrderLine', 'Quantity', 'int', 'false', '', '', 'Quantity ordered'],
    ['OrderLine', 'UnitPrice', 'decimal(18,2)', 'false', '', '', 'Unit price at time of order'],

    // Opportunity (hub in sales)
    ['Opportunity', 'OpportunityId', 'int', 'true', '', '', 'Primary key for Opportunity'],
    ['Opportunity', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'FK to Account'],
    ['Opportunity', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    ['Opportunity', 'Name', 'varchar(200)', 'false', '', '', 'Opportunity name'],
    ['Opportunity', 'EstimatedValue', 'decimal(18,2)', 'false', '', '', 'Estimated value'],

    // OpportunityStageHistory
    ['OpportunityStageHistory', 'OpportunityStageHistoryId', 'int', 'true', '', '', 'Primary key for OpportunityStageHistory'],
    ['OpportunityStageHistory', 'OpportunityId', 'int', 'false', 'Opportunity', 'OpportunityId', 'FK to Opportunity'],
    ['OpportunityStageHistory', 'StageName', 'varchar(100)', 'false', '', '', 'Stage name'],
    ['OpportunityStageHistory', 'ChangedDate', 'datetime', 'false', '', '', 'Stage change date'],

    // SalesActivity
    ['SalesActivity', 'SalesActivityId', 'int', 'true', '', '', 'Primary key for SalesActivity'],
    ['SalesActivity', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'FK to Account'],
    ['SalesActivity', 'OpportunityId', 'int', 'false', 'Opportunity', 'OpportunityId', 'FK to Opportunity'],
    ['SalesActivity', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    ['SalesActivity', 'ChannelCode', 'varchar(20)', 'false', 'Channel', 'Code', 'Interaction channel'],

    // Subscription
    ['Subscription', 'SubscriptionId', 'int', 'true', '', '', 'Primary key for Subscription'],
    ['Subscription', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'FK to Account'],
    ['Subscription', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    ['Subscription', 'PlanCode', 'varchar(50)', 'false', 'SubscriptionPlan', 'Code', 'FK to SubscriptionPlan'],
    ['Subscription', 'StartDate', 'datetime', 'false', '', '', 'Subscription start date'],
    ['Subscription', 'EndDate', 'datetime', 'false', '', '', 'Subscription end date'],

    // Invoice
    ['Invoice', 'InvoiceId', 'int', 'true', '', '', 'Primary key for Invoice'],
    ['Invoice', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'FK to Account'],
    ['Invoice', 'SubscriptionId', 'int', 'false', 'Subscription', 'SubscriptionId', 'FK to Subscription'],
    ['Invoice', 'OrderId', 'int', 'false', 'Order', 'OrderId', 'FK to Order'],
    ['Invoice', 'InvoiceDate', 'datetime', 'false', '', '', 'Invoice date'],
    ['Invoice', 'TotalAmount', 'decimal(18,2)', 'false', '', '', 'Invoice total'],

    // InvoiceLine
    ['InvoiceLine', 'InvoiceLineId', 'int', 'true', '', '', 'Primary key for InvoiceLine'],
    ['InvoiceLine', 'InvoiceId', 'int', 'false', 'Invoice', 'InvoiceId', 'FK to Invoice'],
    ['InvoiceLine', 'ProductId', 'int', 'false', 'Product', 'ProductId', 'FK to Product'],
    ['InvoiceLine', 'Quantity', 'int', 'false', '', '', 'Quantity billed'],
    ['InvoiceLine', 'UnitPrice', 'decimal(18,2)', 'false', '', '', 'Billed unit price'],

    // Payment
    ['Payment', 'PaymentId', 'int', 'true', '', '', 'Primary key for Payment'],
    ['Payment', 'InvoiceId', 'int', 'false', 'Invoice', 'InvoiceId', 'FK to Invoice'],
    ['Payment', 'PaymentMethodCode', 'varchar(20)', 'false', 'PaymentMethod', 'Code', 'FK to PaymentMethod'],
    ['Payment', 'Amount', 'decimal(18,2)', 'false', '', '', 'Amount paid'],
    ['Payment', 'PaymentDate', 'datetime', 'false', '', '', 'Payment date'],

    // Product (hub)
    ['Product', 'ProductId', 'int', 'true', '', '', 'Primary key for Product'],
    ['Product', 'Name', 'varchar(200)', 'false', '', '', 'Product name'],
    ['Product', 'SKU', 'varchar(50)', 'false', '', '', 'SKU identifier'],

    // PriceList
    ['PriceList', 'PriceListId', 'int', 'true', '', '', 'Primary key for PriceList'],
    ['PriceList', 'Name', 'varchar(200)', 'false', '', '', 'Price list name'],
    ['PriceList', 'CurrencyCode', 'varchar(3)', 'false', 'Currency', 'Code', 'Currency for this price list'],

    // PriceListItem
    ['PriceListItem', 'PriceListItemId', 'int', 'true', '', '', 'Primary key for PriceListItem'],
    ['PriceListItem', 'PriceListId', 'int', 'false', 'PriceList', 'PriceListId', 'FK to PriceList'],
    ['PriceListItem', 'ProductId', 'int', 'false', 'Product', 'ProductId', 'FK to Product'],
    ['PriceListItem', 'UnitPrice', 'decimal(18,2)', 'false', '', '', 'Price for product in this list'],

    // FeatureFlag
    ['FeatureFlag', 'FeatureFlagId', 'int', 'true', '', '', 'Primary key for FeatureFlag'],
    ['FeatureFlag', 'ProductId', 'int', 'false', 'Product', 'ProductId', 'FK to Product'],
    ['FeatureFlag', 'PlanCode', 'varchar(50)', 'false', 'SubscriptionPlan', 'Code', 'FK to SubscriptionPlan'],
    ['FeatureFlag', 'FlagKey', 'varchar(100)', 'false', '', '', 'Flag key'],

    // InventoryLocation
    ['InventoryLocation', 'InventoryLocationId', 'int', 'true', '', '', 'Primary key for InventoryLocation'],
    ['InventoryLocation', 'Name', 'varchar(200)', 'false', '', '', 'Location name'],
    ['InventoryLocation', 'CountryCode', 'varchar(3)', 'false', 'Country', 'Code', 'FK to Country'],

    // InventoryTransaction
    ['InventoryTransaction', 'InventoryTransactionId', 'int', 'true', '', '', 'Primary key for InventoryTransaction'],
    ['InventoryTransaction', 'ProductId', 'int', 'false', 'Product', 'ProductId', 'FK to Product'],
    ['InventoryTransaction', 'InventoryLocationId', 'int', 'false', 'InventoryLocation', 'InventoryLocationId', 'FK to InventoryLocation'],
    ['InventoryTransaction', 'QuantityDelta', 'int', 'false', '', '', 'Change in inventory quantity'],

    // Shipment
    ['Shipment', 'ShipmentId', 'int', 'true', '', '', 'Primary key for Shipment'],
    ['Shipment', 'OrderId', 'int', 'false', 'Order', 'OrderId', 'FK to Order'],
    ['Shipment', 'InventoryLocationId', 'int', 'false', 'InventoryLocation', 'InventoryLocationId', 'FK to InventoryLocation'],

    // ShipmentItem
    ['ShipmentItem', 'ShipmentItemId', 'int', 'true', '', '', 'Primary key for ShipmentItem'],
    ['ShipmentItem', 'ShipmentId', 'int', 'false', 'Shipment', 'ShipmentId', 'FK to Shipment'],
    ['ShipmentItem', 'OrderLineId', 'int', 'false', 'OrderLine', 'OrderLineId', 'FK to OrderLine'],

    // SupportTicket
    ['SupportTicket', 'SupportTicketId', 'int', 'true', '', '', 'Primary key for SupportTicket'],
    ['SupportTicket', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'FK to Account'],
    ['SupportTicket', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    ['SupportTicket', 'PriorityCode', 'varchar(20)', 'false', 'SupportPriority', 'Code', 'FK to SupportPriority'],

    // TicketComment
    ['TicketComment', 'TicketCommentId', 'int', 'true', '', '', 'Primary key for TicketComment'],
    ['TicketComment', 'SupportTicketId', 'int', 'false', 'SupportTicket', 'SupportTicketId', 'FK to SupportTicket'],
    ['TicketComment', 'AuthorCustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],

    // CustomerInteraction
    ['CustomerInteraction', 'CustomerInteractionId', 'int', 'true', '', '', 'Primary key for CustomerInteraction'],
    ['CustomerInteraction', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    ['CustomerInteraction', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'FK to Account'],
    ['CustomerInteraction', 'ChannelCode', 'varchar(20)', 'false', 'Channel', 'Code', 'FK to Channel'],

    // Campaign
    ['Campaign', 'CampaignId', 'int', 'true', '', '', 'Primary key for Campaign'],
    ['Campaign', 'Name', 'varchar(200)', 'false', '', '', 'Campaign name'],

    // CampaignTarget
    ['CampaignTarget', 'CampaignTargetId', 'int', 'true', '', '', 'Primary key for CampaignTarget'],
    ['CampaignTarget', 'CampaignId', 'int', 'false', 'Campaign', 'CampaignId', 'FK to Campaign'],
    ['CampaignTarget', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'FK to Account'],
    ['CampaignTarget', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],

    // CampaignResponse
    ['CampaignResponse', 'CampaignResponseId', 'int', 'true', '', '', 'Primary key for CampaignResponse'],
    ['CampaignResponse', 'CampaignId', 'int', 'false', 'Campaign', 'CampaignId', 'FK to Campaign'],
    ['CampaignResponse', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    ['CampaignResponse', 'OpportunityId', 'int', 'false', 'Opportunity', 'OpportunityId', 'FK to Opportunity'],

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
    ['PaymentMethod', 'Description', 'varchar(200)', 'false', '', '', 'Payment method description'],

    // SubscriptionPlan (lookup)
    ['SubscriptionPlan', 'Code', 'varchar(50)', 'true', '', '', 'Plan code'],
    ['SubscriptionPlan', 'Name', 'varchar(200)', 'false', '', '', 'Plan name'],

    // SupportPriority (lookup)
    ['SupportPriority', 'Code', 'varchar(20)', 'true', '', '', 'Priority code'],
    ['SupportPriority', 'Description', 'varchar(200)', 'false', '', '', 'Priority description'],

    // Channel (lookup)
    ['Channel', 'Code', 'varchar(20)', 'true', '', '', 'Channel code'],
    ['Channel', 'Description', 'varchar(200)', 'false', '', '', 'Channel description'],
  ];

  for (const row of attributeRows) {
    attributeSheet.addRow(row);
  }

  const outputPath = path.join(__dirname, '..', 'docs', 'Advanced_DataDictionary.xlsx');
  await workbook.xlsx.writeFile(outputPath);

  console.log(`✅ Advanced sample data dictionary written to: ${outputPath}`);
}

generateAdvancedDataDictionary().catch((err) => {
  console.error('❌ Failed to generate advanced data dictionary:', err);
  process.exit(1);
});






