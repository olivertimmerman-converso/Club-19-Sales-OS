#!/usr/bin/env node
/**
 * Script to replace console.log/error/warn statements with structured logging
 * Uses lib/logger.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const filesToProcess = process.argv.slice(2);

if (filesToProcess.length === 0) {
  console.log('Usage: node replace-console-logs.mjs <file1> <file2> ...');
  process.exit(1);
}

// Regex patterns for different console methods
const patterns = {
  // Match console.log('[SUBSYSTEM] message', data)
  withSubsystem: /console\.(log|error|warn|info|debug)\(\s*['"`]\[([^\]]+)\][^'"`]*['"`]\s*,?\s*([^)]*)\)/g,

  // Match console.error('[SUBSYSTEM] message', error)
  withError: /console\.(error|warn)\(\s*['"`][^'"`]*['"`]\s*,\s*([^)]+)\)/g,

  // Match simple console.log('message')
  simple: /console\.(log|error|warn|info|debug)\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
};

function extractSubsystem(message) {
  const match = message.match(/\[([^\]]+)\]/);
  if (match) {
    return match[1];
  }

  // Try to infer from context (e.g., "XERO SYNC", "ALLOCATE INVOICE")
  const upperWords = message.match(/[A-Z_]+/g);
  if (upperWords && upperWords.length > 0) {
    return upperWords.join('_');
  }

  return 'API';
}

function cleanMessage(message) {
  // Remove brackets like [SUBSYSTEM]
  let clean = message.replace(/\[[^\]]+\]\s*/, '');

  // Remove emoji and special chars
  clean = clean.replace(/[❌✓]/g, '').trim();

  // Remove "===" decorations
  clean = clean.replace(/===\s*/g, '').trim();

  return clean;
}

function determineLogLevel(originalLevel, message) {
  if (originalLevel === 'error') return 'error';
  if (originalLevel === 'warn') return 'warn';

  // Check message content for error indicators
  if (message.includes('❌') || message.includes('Error') || message.includes('Failed')) {
    return 'error';
  }

  if (message.includes('✓') || message.includes('Success')) {
    return 'info';
  }

  return 'info';
}

function processFile(filePath) {
  console.log(`\n📝 Processing: ${filePath}`);

  let content = readFileSync(filePath, 'utf-8');
  let modified = false;
  let replacements = 0;

  // Check if logger is already imported
  const hasLoggerImport = content.includes("import * as logger from '@/lib/logger'");

  // Add logger import if not present
  if (!hasLoggerImport && content.includes('console.')) {
    // Find the last import statement
    const importRegex = /^import .+ from .+;$/gm;
    const imports = content.match(importRegex);

    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      content = content.replace(
        lastImport,
        `${lastImport}\nimport * as logger from '@/lib/logger';`
      );
      modified = true;
      console.log('  ✓ Added logger import');
    }
  }

  // Replace console statements
  // This is a simplified approach - manual review still recommended
  content = content.replace(/console\.(log|error|warn)/g, (match, level) => {
    replacements++;
    return `logger.${level === 'log' ? 'info' : level}`;
  });

  if (modified || replacements > 0) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`  ✓ Replaced ${replacements} console statements`);
    return replacements;
  }

  console.log('  ℹ No changes needed');
  return 0;
}

// Process all files
let totalReplacements = 0;
for (const file of filesToProcess) {
  const fullPath = resolve(file);
  try {
    const count = processFile(fullPath);
    totalReplacements += count;
  } catch (error) {
    console.error(`  ❌ Error processing ${file}:`, error.message);
  }
}

console.log(`\n✅ Complete! Replaced ${totalReplacements} console statements across ${filesToProcess.length} files`);
console.log('⚠️  Note: This is a basic replacement. Manual review recommended for complex cases.');
