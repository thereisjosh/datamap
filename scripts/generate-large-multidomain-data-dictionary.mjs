import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateLargeMultiDomainDataDictionary() {
  const workbook = new ExcelJS.Workbook();

  // Helper to add row arrays
  const addRows = (sheet, rows) => {
    rows.forEach(row => sheet.addRow(row));
  };

  // === TableMetadata sheet ===
  const tableSheet = workbook.addWorksheet('TableMetadata');
  tableSheet.addRow(['Logical Table Name', 'Data Kind', 'Description', 'Domain']);

  // Domain design:
  // CRM (Customer hub), Billing (Account hub), Analytics (Event hub), HR (Employee hub), Inventory (Warehouse hub)
  // ~30 tables total with limited cross-links.
  const tableRows = [
    // CRM
    ['Account', 'entity', 'Customer organizations / tenants', 'CRM'],
    ['Customer', 'entity', 'Contacts under an account', 'CRM'],
    ['CustomerSegment', 'entity', 'Segments customers belong to', 'CRM'],
    ['Lead', 'entity', 'Pre-customer leads', 'CRM'],
    ['Opportunity', 'entity', 'Sales opportunities', 'CRM'],
    ['OpportunityStageHistory', 'entity', 'Stage history for opportunities', 'CRM'],
    ['SalesActivity', 'entity', 'Activities tied to opportunities', 'CRM'],
    ['Order', 'entity', 'Customer orders', 'CRM'],
    ['OrderLine', 'entity', 'Line items for orders', 'CRM'],
    ['SupportTicket', 'entity', 'Support requests tied to customers', 'CRM'],

    // Billing
    ['Subscription', 'entity', 'Customer subscriptions', 'Billing'],
    ['SubscriptionPlan', 'staticentity', 'Available plans', 'Billing'],
    ['Invoice', 'entity', 'Invoices from orders/subscriptions', 'Billing'],
    ['InvoiceLine', 'entity', 'Invoice line items', 'Billing'],
    ['Payment', 'entity', 'Payments received', 'Billing'],
    ['PaymentMethod', 'staticentity', 'Allowed payment methods', 'Billing'],

    // Analytics
    ['EventSession', 'entity', 'User sessions grouping events', 'Analytics'],
    ['AnalyticsEvent', 'entity', 'Tracking events', 'Analytics'],
    ['EventProperty', 'entity', 'Event properties', 'Analytics'],
    ['Funnel', 'entity', 'Defined funnels', 'Analytics'],
    ['FunnelStep', 'entity', 'Steps within funnels', 'Analytics'],
    ['Experiment', 'entity', 'A/B experiments', 'Analytics'],
    ['ExperimentVariant', 'entity', 'Variants for experiments', 'Analytics'],

    // HR
    ['OrgUnit', 'entity', 'Departments / org units', 'HR'],
    ['Team', 'entity', 'Teams inside org units', 'HR'],
    ['Employee', 'entity', 'Employees assigned to teams', 'HR'],
    ['EmployeeRole', 'entity', 'Roles held by employees', 'HR'],
    ['PerformanceReview', 'entity', 'Employee performance reviews', 'HR'],

    // Inventory / Supply
    ['Warehouse', 'entity', 'Physical warehouses', 'Inventory'],
    ['InventoryItem', 'entity', 'Stock-keeping units', 'Inventory'],
    ['InventoryBalance', 'entity', 'On-hand/available balances', 'Inventory'],
    ['InventoryTransaction', 'entity', 'Inventory movements', 'Inventory'],
    ['Shipment', 'entity', 'Shipments of orders', 'Inventory'],
    ['ShipmentItem', 'entity', 'Items within shipments', 'Inventory'],
  ];
  addRows(tableSheet, tableRows);

  // === AttributeMetadata sheet ===
  const attrSheet = workbook.addWorksheet('AttributeMetadata');
  attrSheet.addRow([
    'Logical Table Name',
    'Attribute Name',
    'Type',
    'Is Autonumber',
    'Reference Table',
    'Column Table',
    'Description'
  ]);

  const attrRows = [
    // CRM domain
    ['Account', 'AccountId', 'int', 'true', '', '', 'PK'],
    ['Account', 'Name', 'varchar(200)', 'false', '', '', 'Account name'],

    ['Customer', 'CustomerId', 'int', 'true', '', '', 'PK'],
    ['Customer', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'Account owner'],
    ['Customer', 'SegmentId', 'int', 'false', 'CustomerSegment', 'CustomerSegmentId', 'Optional segment'],
    ['Customer', 'Name', 'varchar(200)', 'false', '', '', 'Customer name'],

    ['CustomerSegment', 'CustomerSegmentId', 'int', 'true', '', '', 'PK'],
    ['CustomerSegment', 'Name', 'varchar(200)', 'false', '', '', 'Segment name'],

    ['Lead', 'LeadId', 'int', 'true', '', '', 'PK'],
    ['Lead', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'Account converted to'],
    ['Lead', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'Converted customer (optional)'],

    ['Opportunity', 'OpportunityId', 'int', 'true', '', '', 'PK'],
    ['Opportunity', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'Account owner'],
    ['Opportunity', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'Primary contact'],

    ['OpportunityStageHistory', 'OpportunityStageHistoryId', 'int', 'true', '', '', 'PK'],
    ['OpportunityStageHistory', 'OpportunityId', 'int', 'false', 'Opportunity', 'OpportunityId', 'FK to opportunity'],

    ['SalesActivity', 'SalesActivityId', 'int', 'true', '', '', 'PK'],
    ['SalesActivity', 'OpportunityId', 'int', 'false', 'Opportunity', 'OpportunityId', 'Related opportunity'],
    ['SalesActivity', 'EmployeeId', 'int', 'false', 'Employee', 'EmployeeId', 'Assigned sales rep'],

    ['Order', 'OrderId', 'int', 'true', '', '', 'PK'],
    ['Order', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'Ordering account'],
    ['Order', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'Ordering contact'],

    ['OrderLine', 'OrderLineId', 'int', 'true', '', '', 'PK'],
    ['OrderLine', 'OrderId', 'int', 'false', 'Order', 'OrderId', 'Parent order'],

    ['SupportTicket', 'SupportTicketId', 'int', 'true', '', '', 'PK'],
    ['SupportTicket', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'Customer who opened ticket'],
    ['SupportTicket', 'AssignedEmployeeId', 'int', 'false', 'Employee', 'EmployeeId', 'Support agent'],

    // Billing domain
    ['SubscriptionPlan', 'SubscriptionPlanId', 'int', 'true', '', '', 'PK'],
    ['SubscriptionPlan', 'PlanCode', 'varchar(50)', 'false', '', '', 'Plan code'],

    ['Subscription', 'SubscriptionId', 'int', 'true', '', '', 'PK'],
    ['Subscription', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'Owning account'],
    ['Subscription', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'Primary contact'],
    ['Subscription', 'SubscriptionPlanId', 'int', 'false', 'SubscriptionPlan', 'SubscriptionPlanId', 'Selected plan'],

    ['Invoice', 'InvoiceId', 'int', 'true', '', '', 'PK'],
    ['Invoice', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'Billed account'],
    ['Invoice', 'SubscriptionId', 'int', 'false', 'Subscription', 'SubscriptionId', 'Related subscription'],
    ['Invoice', 'OrderId', 'int', 'false', 'Order', 'OrderId', 'Related order'],

    ['InvoiceLine', 'InvoiceLineId', 'int', 'true', '', '', 'PK'],
    ['InvoiceLine', 'InvoiceId', 'int', 'false', 'Invoice', 'InvoiceId', 'Parent invoice'],

    ['PaymentMethod', 'PaymentMethodId', 'int', 'true', '', '', 'PK'],
    ['PaymentMethod', 'MethodCode', 'varchar(20)', 'false', '', '', 'Method code'],

    ['Payment', 'PaymentId', 'int', 'true', '', '', 'PK'],
    ['Payment', 'InvoiceId', 'int', 'false', 'Invoice', 'InvoiceId', 'Paid invoice'],
    ['Payment', 'PaymentMethodId', 'int', 'false', 'PaymentMethod', 'PaymentMethodId', 'Method used'],

    // Analytics domain
    ['EventSession', 'EventSessionId', 'int', 'true', '', '', 'PK'],

    ['AnalyticsEvent', 'AnalyticsEventId', 'int', 'true', '', '', 'PK'],
    ['AnalyticsEvent', 'EventSessionId', 'int', 'false', 'EventSession', 'EventSessionId', 'Parent session'],
    ['AnalyticsEvent', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'Optional CRM link'],

    ['EventProperty', 'EventPropertyId', 'int', 'true', '', '', 'PK'],
    ['EventProperty', 'AnalyticsEventId', 'int', 'false', 'AnalyticsEvent', 'AnalyticsEventId', 'Parent event'],

    ['Funnel', 'FunnelId', 'int', 'true', '', '', 'PK'],
    ['Funnel', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'Optional CRM link'],

    ['FunnelStep', 'FunnelStepId', 'int', 'true', '', '', 'PK'],
    ['FunnelStep', 'FunnelId', 'int', 'false', 'Funnel', 'FunnelId', 'Parent funnel'],

    ['Experiment', 'ExperimentId', 'int', 'true', '', '', 'PK'],
    ['Experiment', 'OwnerEmployeeId', 'int', 'false', 'Employee', 'EmployeeId', 'Experiment owner'],

    ['ExperimentVariant', 'ExperimentVariantId', 'int', 'true', '', '', 'PK'],
    ['ExperimentVariant', 'ExperimentId', 'int', 'false', 'Experiment', 'ExperimentId', 'Parent experiment'],

    // HR domain
    ['OrgUnit', 'OrgUnitId', 'int', 'true', '', '', 'PK'],
    ['OrgUnit', 'Name', 'varchar(200)', 'false', '', '', 'Org unit name'],

    ['Team', 'TeamId', 'int', 'true', '', '', 'PK'],
    ['Team', 'OrgUnitId', 'int', 'false', 'OrgUnit', 'OrgUnitId', 'Parent org unit'],

    ['Employee', 'EmployeeId', 'int', 'true', '', '', 'PK'],
    ['Employee', 'TeamId', 'int', 'false', 'Team', 'TeamId', 'Team assignment'],

    ['EmployeeRole', 'EmployeeRoleId', 'int', 'true', '', '', 'PK'],
    ['EmployeeRole', 'EmployeeId', 'int', 'false', 'Employee', 'EmployeeId', 'Employee'],

    ['PerformanceReview', 'PerformanceReviewId', 'int', 'true', '', '', 'PK'],
    ['PerformanceReview', 'EmployeeId', 'int', 'false', 'Employee', 'EmployeeId', 'Reviewed employee'],
    ['PerformanceReview', 'ReviewerEmployeeId', 'int', 'false', 'Employee', 'EmployeeId', 'Reviewer (self or manager)'],

    // Inventory domain
    ['Warehouse', 'WarehouseId', 'int', 'true', '', '', 'PK'],
    ['Warehouse', 'Name', 'varchar(200)', 'false', '', '', 'Warehouse name'],

    ['InventoryItem', 'InventoryItemId', 'int', 'true', '', '', 'PK'],
    ['InventoryItem', 'SKU', 'varchar(50)', 'false', '', '', 'SKU code'],

    ['InventoryBalance', 'InventoryBalanceId', 'int', 'true', '', '', 'PK'],
    ['InventoryBalance', 'InventoryItemId', 'int', 'false', 'InventoryItem', 'InventoryItemId', 'Item'],
    ['InventoryBalance', 'WarehouseId', 'int', 'false', 'Warehouse', 'WarehouseId', 'Warehouse'],

    ['InventoryTransaction', 'InventoryTransactionId', 'int', 'true', '', '', 'PK'],
    ['InventoryTransaction', 'InventoryItemId', 'int', 'false', 'InventoryItem', 'InventoryItemId', 'Item'],
    ['InventoryTransaction', 'WarehouseId', 'int', 'false', 'Warehouse', 'WarehouseId', 'Warehouse'],
    ['InventoryTransaction', 'OrderLineId', 'int', 'false', 'OrderLine', 'OrderLineId', 'Optional CRM link'],

    ['Shipment', 'ShipmentId', 'int', 'true', '', '', 'PK'],
    ['Shipment', 'WarehouseId', 'int', 'false', 'Warehouse', 'WarehouseId', 'Ship-from warehouse'],
    ['Shipment', 'OrderId', 'int', 'false', 'Order', 'OrderId', 'Order fulfilled'],

    ['ShipmentItem', 'ShipmentItemId', 'int', 'true', '', '', 'PK'],
    ['ShipmentItem', 'ShipmentId', 'int', 'false', 'Shipment', 'ShipmentId', 'Parent shipment'],
    ['ShipmentItem', 'OrderLineId', 'int', 'false', 'OrderLine', 'OrderLineId', 'Order line fulfilled'],
  ];

  addRows(attrSheet, attrRows);

  const outputPath = path.join(__dirname, '..', 'docs', 'LargeMultiDomain_DataDictionary.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ Large multi-domain data dictionary written to: ${outputPath}`);
}

generateLargeMultiDomainDataDictionary().catch((err) => {
  console.error('❌ Failed to generate large multi-domain data dictionary:', err);
  process.exit(1);
});






