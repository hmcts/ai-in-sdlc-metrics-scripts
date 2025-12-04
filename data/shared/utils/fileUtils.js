// File I/O utilities
const fs = require('fs');
const path = require('path');

function findFiles(dir, extension) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFiles(fullPath, extension));
    } else if (entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

function readJSONL(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  return lines
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (err) {
        console.warn(`Warning: Could not parse line in ${filePath}`);
        return null;
      }
    })
    .filter(entry => entry !== null);
}

function readCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length === 0) return [];

  const headers = lines[0].split(',');
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(',');
    const row = {};

    headers.forEach((header, index) => {
      row[header.trim()] = cols[index] ? cols[index].trim() : '';
    });

    rows.push(row);
  }

  return rows;
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
  findFiles,
  readJSONL,
  readCSV,
  writeJSON
};
