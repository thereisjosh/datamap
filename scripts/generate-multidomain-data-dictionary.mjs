import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateMultiDomainDataDictionary() {
  const workbook = new ExcelJS.Workbook();

  // === TableMetadata sheet ===
  const tableSheet = workbook.addWorksheet('TableMetadata');

  tableSheet.addRow([
    'Logical Table Name',
    'Data Kind',
    'Description',
    'Domain'
  ]);

  // Design: three reasonably separated domains with limited cross-links:
  //
  // - CRM: Account, Customer, Order, OrderLine, SupportTicket
  // - Analytics: AnalyticsEvent, EventSession, EventProperty
  // - HR: Employee, Team, OrgUnit
  //
  // Only a *single* controlled edge from Analytics → CRM (AnalyticsEvent.CustomerId),
  // and a single edge from SupportTicket → Employee, so clusters are distinct but not trivial.
  const tableRows = [
    // CRM domain
    ['Account', 'entity', 'Customer organizations / tenants', 'CRM'],
    ['Customer', 'entity', 'Contacts belonging to an account', 'CRM'],
    ['Order', 'entity', 'Orders placed by customers', 'CRM'],
    ['OrderLine', 'entity', 'Line items for each order', 'CRM'],
    ['SupportTicket', 'entity', 'Support tickets opened by customers', 'CRM'],

    // Analytics domain
    ['EventSession', 'entity', 'User sessions grouping events', 'Analytics'],
    ['AnalyticsEvent', 'entity', 'Application tracking events', 'Analytics'],
    ['EventProperty', 'entity', 'Key-value properties per event', 'Analytics'],

    // HR domain
    ['OrgUnit', 'entity', 'Departments / business units', 'HR'],
    ['Team', 'entity', 'Teams / squads within org units', 'HR'],
    ['Employee', 'entity', 'Employees assigned to teams', 'HR'],
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
    // CRM domain
    ['Account', 'AccountId', 'int', 'true', '', '', 'PK for Account'],
    ['Account', 'Name', 'varchar(200)', 'false', '', '', 'Account name'],

    ['Customer', 'CustomerId', 'int', 'true', '', '', 'PK for Customer'],
    ['Customer', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'FK to Account'],
    ['Customer', 'Name', 'varchar(200)', 'false', '', '', 'Customer name'],

    ['Order', 'OrderId', 'int', 'true', '', '', 'PK for Order'],
    ['Order', 'AccountId', 'int', 'false', 'Account', 'AccountId', 'FK to Account'],
    ['Order', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    ['Order', 'OrderDate', 'datetime', 'false', '', '', 'Order date'],

    ['OrderLine', 'OrderLineId', 'int', 'true', '', '', 'PK for OrderLine'],
    ['OrderLine', 'OrderId', 'int', 'false', 'Order', 'OrderId', 'FK to Order'],
    ['OrderLine', 'Description', 'varchar(200)', 'false', '', '', 'Line description'],

    ['SupportTicket', 'SupportTicketId', 'int', 'true', '', '', 'PK for SupportTicket'],
    ['SupportTicket', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    // Controlled bridge from CRM to HR (one edge)
    ['SupportTicket', 'AssignedEmployeeId', 'int', 'false', 'Employee', 'EmployeeId', 'FK to Employee'],
    ['SupportTicket', 'Subject', 'varchar(200)', 'false', '', '', 'Ticket subject'],

    // Analytics domain
    ['EventSession', 'EventSessionId', 'int', 'true', '', '', 'PK for EventSession'],
    ['EventSession', 'SessionKey', 'varchar(100)', 'false', '', '', 'Session identifier'],

    ['AnalyticsEvent', 'AnalyticsEventId', 'int', 'true', '', '', 'PK for AnalyticsEvent'],
    ['AnalyticsEvent', 'EventSessionId', 'int', 'false', 'EventSession', 'EventSessionId', 'FK to EventSession'],
    // Single controlled link into CRM (one edge to help clustering but keep separation)
    ['AnalyticsEvent', 'CustomerId', 'int', 'false', 'Customer', 'CustomerId', 'FK to Customer'],
    ['AnalyticsEvent', 'EventType', 'varchar(100)', 'false', '', '', 'Event type'],

    ['EventProperty', 'EventPropertyId', 'int', 'true', '', '', 'PK for EventProperty'],
    ['EventProperty', 'AnalyticsEventId', 'int', 'false', 'AnalyticsEvent', 'AnalyticsEventId', 'FK to AnalyticsEvent'],
    ['EventProperty', 'Name', 'varchar(100)', 'false', '', '', 'Property name'],
    ['EventProperty', 'Value', 'varchar(200)', 'false', '', '', 'Property value'],

    // HR domain
    ['OrgUnit', 'OrgUnitId', 'int', 'true', '', '', 'PK for OrgUnit'],
    ['OrgUnit', 'Name', 'varchar(200)', 'false', '', '', 'Org unit name'],

    ['Team', 'TeamId', 'int', 'true', '', '', 'PK for Team'],
    ['Team', 'OrgUnitId', 'int', 'false', 'OrgUnit', 'OrgUnitId', 'FK to OrgUnit'],
    ['Team', 'Name', 'varchar(200)', 'false', '', '', 'Team name'],

    ['Employee', 'EmployeeId', 'int', 'true', '', '', 'PK for Employee'],
    ['Employee', 'TeamId', 'int', 'false', 'Team', 'TeamId', 'FK to Team'],
    ['Employee', 'FullName', 'varchar(200)', 'false', '', '', 'Employee full name'],
  ];

  for (const row of attributeRows) {
    attributeSheet.addRow(row);
  }

  const outputPath = path.join(__dirname, '..', 'docs', 'MultiDomain_DataDictionary.xlsx');
  await workbook.xlsx.writeFile(outputPath);

  console.log(`✅ Multi-domain sample data dictionary written to: ${outputPath}`);
}

generateMultiDomainDataDictionary().catch((err) => {
  console.error('❌ Failed to generate multi-domain data dictionary:', err);
  process.exit(1);
});






