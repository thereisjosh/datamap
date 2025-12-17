import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateLargeMultiDomainCustomHeaders() {
  const workbook = new ExcelJS.Workbook();

  const addRows = (sheet, rows) => {
    rows.forEach((row) => sheet.addRow(row));
  };

  // IMPORTANT: This file intentionally does NOT use the hardcoded sheet names
  // "TableMetadata" / "AttributeMetadata" to validate that the UI-driven
  // flexible parser works via user-selected mappings.

  // === Entities sheet (tables) ===
  const entitiesSheet = workbook.addWorksheet('EntitiesCatalog');
  entitiesSheet.addRow([
    'EntityName',     // tableNameColumn
    'EntityKind',     // tableTypeColumn (optional)
    'DomainArea',     // informational
    'EntityNotes'     // informational
  ]);

  const tableRows = [
    // CRM
    ['Account', 'entity', 'CRM', 'Customer organizations / tenants'],
    ['Customer', 'entity', 'CRM', 'Contacts under an account'],
    ['CustomerSegment', 'entity', 'CRM', 'Segments customers belong to'],
    ['Lead', 'entity', 'CRM', 'Pre-customer leads'],
    ['Opportunity', 'entity', 'CRM', 'Sales opportunities'],
    ['OpportunityStageHistory', 'entity', 'CRM', 'Stage history for opportunities'],
    ['SalesActivity', 'entity', 'CRM', 'Activities tied to opportunities'],
    ['Order', 'entity', 'CRM', 'Customer orders'],
    ['OrderLine', 'entity', 'CRM', 'Line items for orders'],
    ['SupportTicket', 'entity', 'CRM', 'Support requests tied to customers'],

    // Billing
    ['Subscription', 'entity', 'Billing', 'Customer subscriptions'],
    ['SubscriptionPlan', 'staticentity', 'Billing', 'Available plans'],
    ['Invoice', 'entity', 'Billing', 'Invoices from orders/subscriptions'],
    ['InvoiceLine', 'entity', 'Billing', 'Invoice line items'],
    ['Payment', 'entity', 'Billing', 'Payments received'],
    ['PaymentMethod', 'staticentity', 'Billing', 'Allowed payment methods'],

    // Analytics
    ['EventSession', 'entity', 'Analytics', 'User sessions grouping events'],
    ['AnalyticsEvent', 'entity', 'Analytics', 'Tracking events'],
    ['EventProperty', 'entity', 'Analytics', 'Event properties'],
    ['Funnel', 'entity', 'Analytics', 'Defined funnels'],
    ['FunnelStep', 'entity', 'Analytics', 'Steps within funnels'],
    ['Experiment', 'entity', 'Analytics', 'A/B experiments'],
    ['ExperimentVariant', 'entity', 'Analytics', 'Variants for experiments'],

    // HR
    ['OrgUnit', 'entity', 'HR', 'Departments / org units'],
    ['Team', 'entity', 'HR', 'Teams inside org units'],
    ['Employee', 'entity', 'HR', 'Employees assigned to teams'],
    ['EmployeeRole', 'entity', 'HR', 'Roles held by employees'],
    ['PerformanceReview', 'entity', 'HR', 'Employee performance reviews'],

    // Inventory
    ['Warehouse', 'entity', 'Inventory', 'Physical warehouses'],
    ['InventoryItem', 'entity', 'Inventory', 'Stock-keeping units'],
    ['InventoryBalance', 'entity', 'Inventory', 'On-hand/available balances'],
    ['InventoryTransaction', 'entity', 'Inventory', 'Inventory movements'],
    ['Shipment', 'entity', 'Inventory', 'Shipments of orders'],
    ['ShipmentItem', 'entity', 'Inventory', 'Items within shipments'],
  ];

  addRows(entitiesSheet, tableRows);

  // === Fields sheet (columns) ===
  const fieldsSheet = workbook.addWorksheet('FieldsCatalog');

  fieldsSheet.addRow([
    'EntityName',      // columnTableNameColumn
    'FieldName',       // columnNameColumn
    'FieldType',       // columnTypeColumn
    'IsPK',            // primaryKeyColumn (optional)
    'FKEntity',        // foreignKeyTableColumn (optional)
    'FKField',         // foreignKeyColumnColumn (optional)
    // Extra column to avoid an existing backend warning:
    // flexible parser validateMappings currently checks optional columns against the column sheet only,
    // including tableTypeColumn; having EntityKind present here prevents a confusing warning.
    'EntityKind',
    'FieldNotes'
  ]);

  const pk = (entity) => `${entity.toLowerCase()}_id`;

  const fieldRows = [
    // CRM
    ['Account', pk('account'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Account', 'name', 'varchar(200)', 'false', '', '', 'entity', 'Account name'],

    ['CustomerSegment', pk('customersegment'), 'int', 'true', '', '', 'entity', 'PK'],
    ['CustomerSegment', 'segment_name', 'varchar(200)', 'false', '', '', 'entity', 'Segment name'],

    ['Customer', pk('customer'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Customer', pk('account'), 'int', 'false', 'Account', pk('account'), 'entity', 'Account owner'],
    ['Customer', pk('customersegment'), 'int', 'false', 'CustomerSegment', pk('customersegment'), 'entity', 'Optional segment'],
    ['Customer', 'full_name', 'varchar(200)', 'false', '', '', 'entity', 'Customer name'],

    ['Lead', pk('lead'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Lead', pk('account'), 'int', 'false', 'Account', pk('account'), 'entity', 'Account converted to'],
    ['Lead', pk('customer'), 'int', 'false', 'Customer', pk('customer'), 'entity', 'Converted customer (optional)'],

    ['Opportunity', pk('opportunity'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Opportunity', pk('account'), 'int', 'false', 'Account', pk('account'), 'entity', 'Account owner'],
    ['Opportunity', pk('customer'), 'int', 'false', 'Customer', pk('customer'), 'entity', 'Primary contact'],

    ['OpportunityStageHistory', pk('opportunitystagehistory'), 'int', 'true', '', '', 'entity', 'PK'],
    ['OpportunityStageHistory', pk('opportunity'), 'int', 'false', 'Opportunity', pk('opportunity'), 'entity', 'FK to opportunity'],

    ['SalesActivity', pk('salesactivity'), 'int', 'true', '', '', 'entity', 'PK'],
    ['SalesActivity', pk('opportunity'), 'int', 'false', 'Opportunity', pk('opportunity'), 'entity', 'Related opportunity'],
    ['SalesActivity', pk('employee'), 'int', 'false', 'Employee', pk('employee'), 'entity', 'Assigned sales rep'],

    ['Order', pk('order'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Order', pk('account'), 'int', 'false', 'Account', pk('account'), 'entity', 'Ordering account'],
    ['Order', pk('customer'), 'int', 'false', 'Customer', pk('customer'), 'entity', 'Ordering contact'],

    ['OrderLine', pk('orderline'), 'int', 'true', '', '', 'entity', 'PK'],
    ['OrderLine', pk('order'), 'int', 'false', 'Order', pk('order'), 'entity', 'Parent order'],

    ['SupportTicket', pk('supportticket'), 'int', 'true', '', '', 'entity', 'PK'],
    ['SupportTicket', pk('customer'), 'int', 'false', 'Customer', pk('customer'), 'entity', 'Customer who opened ticket'],
    ['SupportTicket', 'assigned_employee_id', 'int', 'false', 'Employee', pk('employee'), 'entity', 'Support agent'],

    // Billing
    ['SubscriptionPlan', pk('subscriptionplan'), 'int', 'true', '', '', 'staticentity', 'PK'],
    ['SubscriptionPlan', 'plan_code', 'varchar(50)', 'false', '', '', 'staticentity', 'Plan code'],

    ['Subscription', pk('subscription'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Subscription', pk('account'), 'int', 'false', 'Account', pk('account'), 'entity', 'Owning account'],
    ['Subscription', pk('customer'), 'int', 'false', 'Customer', pk('customer'), 'entity', 'Primary contact'],
    ['Subscription', pk('subscriptionplan'), 'int', 'false', 'SubscriptionPlan', pk('subscriptionplan'), 'entity', 'Selected plan'],

    ['Invoice', pk('invoice'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Invoice', pk('account'), 'int', 'false', 'Account', pk('account'), 'entity', 'Billed account'],
    ['Invoice', pk('subscription'), 'int', 'false', 'Subscription', pk('subscription'), 'entity', 'Related subscription'],
    ['Invoice', pk('order'), 'int', 'false', 'Order', pk('order'), 'entity', 'Related order'],

    ['InvoiceLine', pk('invoiceline'), 'int', 'true', '', '', 'entity', 'PK'],
    ['InvoiceLine', pk('invoice'), 'int', 'false', 'Invoice', pk('invoice'), 'entity', 'Parent invoice'],

    ['PaymentMethod', pk('paymentmethod'), 'int', 'true', '', '', 'staticentity', 'PK'],
    ['PaymentMethod', 'method_code', 'varchar(20)', 'false', '', '', 'staticentity', 'Method code'],

    ['Payment', pk('payment'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Payment', pk('invoice'), 'int', 'false', 'Invoice', pk('invoice'), 'entity', 'Paid invoice'],
    ['Payment', pk('paymentmethod'), 'int', 'false', 'PaymentMethod', pk('paymentmethod'), 'entity', 'Method used'],

    // Analytics
    ['EventSession', pk('eventsession'), 'int', 'true', '', '', 'entity', 'PK'],

    ['AnalyticsEvent', pk('analyticsevent'), 'int', 'true', '', '', 'entity', 'PK'],
    ['AnalyticsEvent', pk('eventsession'), 'int', 'false', 'EventSession', pk('eventsession'), 'entity', 'Parent session'],
    ['AnalyticsEvent', pk('customer'), 'int', 'false', 'Customer', pk('customer'), 'entity', 'Optional CRM link'],

    ['EventProperty', pk('eventproperty'), 'int', 'true', '', '', 'entity', 'PK'],
    ['EventProperty', pk('analyticsevent'), 'int', 'false', 'AnalyticsEvent', pk('analyticsevent'), 'entity', 'Parent event'],

    ['Funnel', pk('funnel'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Funnel', pk('account'), 'int', 'false', 'Account', pk('account'), 'entity', 'Optional CRM link'],

    ['FunnelStep', pk('funnelstep'), 'int', 'true', '', '', 'entity', 'PK'],
    ['FunnelStep', pk('funnel'), 'int', 'false', 'Funnel', pk('funnel'), 'entity', 'Parent funnel'],

    ['Experiment', pk('experiment'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Experiment', 'owner_employee_id', 'int', 'false', 'Employee', pk('employee'), 'entity', 'Experiment owner'],

    ['ExperimentVariant', pk('experimentvariant'), 'int', 'true', '', '', 'entity', 'PK'],
    ['ExperimentVariant', pk('experiment'), 'int', 'false', 'Experiment', pk('experiment'), 'entity', 'Parent experiment'],

    // HR
    ['OrgUnit', pk('orgunit'), 'int', 'true', '', '', 'entity', 'PK'],
    ['OrgUnit', 'orgunit_name', 'varchar(200)', 'false', '', '', 'entity', 'Org unit name'],

    ['Team', pk('team'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Team', pk('orgunit'), 'int', 'false', 'OrgUnit', pk('orgunit'), 'entity', 'Parent org unit'],

    ['Employee', pk('employee'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Employee', pk('team'), 'int', 'false', 'Team', pk('team'), 'entity', 'Team assignment'],

    ['EmployeeRole', pk('employeerole'), 'int', 'true', '', '', 'entity', 'PK'],
    ['EmployeeRole', pk('employee'), 'int', 'false', 'Employee', pk('employee'), 'entity', 'Employee'],

    ['PerformanceReview', pk('performancereview'), 'int', 'true', '', '', 'entity', 'PK'],
    ['PerformanceReview', pk('employee'), 'int', 'false', 'Employee', pk('employee'), 'entity', 'Reviewed employee'],
    ['PerformanceReview', 'reviewer_employee_id', 'int', 'false', 'Employee', pk('employee'), 'entity', 'Reviewer'],

    // Inventory
    ['Warehouse', pk('warehouse'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Warehouse', 'warehouse_name', 'varchar(200)', 'false', '', '', 'entity', 'Warehouse name'],

    ['InventoryItem', pk('inventoryitem'), 'int', 'true', '', '', 'entity', 'PK'],
    ['InventoryItem', 'sku_code', 'varchar(50)', 'false', '', '', 'entity', 'SKU code'],

    ['InventoryBalance', pk('inventorybalance'), 'int', 'true', '', '', 'entity', 'PK'],
    ['InventoryBalance', pk('inventoryitem'), 'int', 'false', 'InventoryItem', pk('inventoryitem'), 'entity', 'Item'],
    ['InventoryBalance', pk('warehouse'), 'int', 'false', 'Warehouse', pk('warehouse'), 'entity', 'Warehouse'],

    ['InventoryTransaction', pk('inventorytransaction'), 'int', 'true', '', '', 'entity', 'PK'],
    ['InventoryTransaction', pk('inventoryitem'), 'int', 'false', 'InventoryItem', pk('inventoryitem'), 'entity', 'Item'],
    ['InventoryTransaction', pk('warehouse'), 'int', 'false', 'Warehouse', pk('warehouse'), 'entity', 'Warehouse'],
    ['InventoryTransaction', pk('orderline'), 'int', 'false', 'OrderLine', pk('orderline'), 'entity', 'Optional CRM link'],

    ['Shipment', pk('shipment'), 'int', 'true', '', '', 'entity', 'PK'],
    ['Shipment', pk('warehouse'), 'int', 'false', 'Warehouse', pk('warehouse'), 'entity', 'Ship-from warehouse'],
    ['Shipment', pk('order'), 'int', 'false', 'Order', pk('order'), 'entity', 'Order fulfilled'],

    ['ShipmentItem', pk('shipmentitem'), 'int', 'true', '', '', 'entity', 'PK'],
    ['ShipmentItem', pk('shipment'), 'int', 'false', 'Shipment', pk('shipment'), 'entity', 'Parent shipment'],
    ['ShipmentItem', pk('orderline'), 'int', 'false', 'OrderLine', pk('orderline'), 'entity', 'Order line fulfilled'],
  ];

  addRows(fieldsSheet, fieldRows);

  const outputPath = path.join(__dirname, '..', 'docs', 'LargeMultiDomain_DataDictionary_CustomHeaders.xlsx');
  await workbook.xlsx.writeFile(outputPath);

  console.log(`✅ Large multi-domain (custom headers) data dictionary written to: ${outputPath}`);
}

generateLargeMultiDomainCustomHeaders().catch((err) => {
  console.error('❌ Failed to generate large multi-domain custom-headers dictionary:', err);
  process.exit(1);
});



