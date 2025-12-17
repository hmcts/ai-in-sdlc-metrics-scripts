#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse a single CSV file and extract date-based entries
function parseCostCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    console.log(`Warning: ${filePath} is empty or invalid`);
    return { headers: null, rows: [] };
  }

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, ''));
  const rows = [];

  // Skip header and service total rows
  for (let i = 2; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.replace(/^"|"$/g, ''));

    const dateStr = values[0];

    // Only include valid date rows
    if (dateStr && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

// Merge all CSV files
function mergeCostFiles() {
  const costsDir = __dirname;
  const files = [
    'bedrock-costs.csv',
    'costs(1).csv',
    'costs(2).csv',
    'costs(3).csv',
    'costs(4).csv',
    'costs(5).csv',
    'costs(7).csv'
  ];

  const allHeaders = new Set();
  const allRows = [];

  // Parse all files
  files.forEach(file => {
    const filePath = path.join(costsDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping ${file} (not found)`);
      return;
    }

    console.log(`Processing ${file}...`);
    const { headers, rows } = parseCostCSV(filePath);

    if (headers) {
      headers.forEach(h => allHeaders.add(h));
      allRows.push(...rows);
    }
  });

  // Remove duplicates by date (keep the last occurrence)
  const rowsByDate = new Map();
  allRows.forEach(row => {
    rowsByDate.set(row['Service'], row);
  });

  const uniqueRows = Array.from(rowsByDate.values());

  // Sort by date
  uniqueRows.sort((a, b) => {
    const dateA = new Date(a['Service']);
    const dateB = new Date(b['Service']);
    return dateA - dateB;
  });

  // Create merged headers list
  const mergedHeaders = Array.from(allHeaders);

  // Ensure "Service" is first
  const serviceIndex = mergedHeaders.indexOf('Service');
  if (serviceIndex > 0) {
    mergedHeaders.splice(serviceIndex, 1);
    mergedHeaders.unshift('Service');
  }

  // Calculate totals row
  const totalsRow = { 'Service': 'Service total' };
  mergedHeaders.forEach(header => {
    if (header === 'Service') return;

    let total = 0;
    uniqueRows.forEach(row => {
      const value = parseFloat(row[header]);
      if (!isNaN(value)) {
        total += value;
      }
    });

    totalsRow[header] = total > 0 ? total.toFixed(8) : '0';
  });

  // Build output CSV
  const outputLines = [];

  // Header
  outputLines.push(mergedHeaders.map(h => `"${h}"`).join(','));

  // Totals row
  outputLines.push(mergedHeaders.map(h => `"${totalsRow[h] || ''}"`).join(','));

  // Data rows
  uniqueRows.forEach(row => {
    const values = mergedHeaders.map(h => `"${row[h] || ''}"`);
    outputLines.push(values.join(','));
  });

  // Write merged file
  const outputPath = path.join(costsDir, 'merged-bedrock-costs.csv');
  fs.writeFileSync(outputPath, outputLines.join('\n'));

  console.log(`\nMerged ${uniqueRows.length} rows`);
  console.log(`Date range: ${uniqueRows[0]['Service']} to ${uniqueRows[uniqueRows.length - 1]['Service']}`);
  console.log(`Output: ${outputPath}`);
}

mergeCostFiles();
