import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Load configuration from config.json
 */
export function loadConfig() {
    const configPath = path.join(__dirname, '..', 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error('❌ config.json not found!');
        console.error('   Copy config.example.json to config.json and fill in your details.');
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    // Validate required fields
    const required = ['actualServer', 'actualPassword', 'budgetSyncId', 'openaiApiKey'];
    for (const field of required) {
        if (!config[field] || config[field].includes('YOUR_')) {
            console.error(`❌ Please set "${field}" in config.json`);
            process.exit(1);
        }
    }
    return config;
}
/**
 * Parse command line arguments
 */
export function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        dryRun: false,
        limit: null,
        createRules: false,
    };
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--dry-run':
            case '-d':
                options.dryRun = true;
                break;
            case '--limit':
            case '-l':
                options.limit = parseInt(args[++i], 10);
                break;
            case '--create-rules':
            case '-r':
                options.createRules = true;
                break;
            case '--help':
            case '-h':
                console.log(`
Actual Budget Auto-Categorizer
Usage: node src/index.js [options]
Options:
  --dry-run, -d       Show what would be done without making changes
  --limit N, -l N     Only process N transactions
  --create-rules, -r  Create rules for future auto-categorization
  --help, -h          Show this help message
`);
                process.exit(0);
        }
    }
    return options;
}
/**
 * Format amount in euros
 */
export function formatAmount(cents) {
    const euros = cents / 100;
    return euros >= 0
        ? `+€${euros.toFixed(2)}`
        : `-€${Math.abs(euros).toFixed(2)}`;
}
/**
 * Format date for display (ISO format)
 */
export function formatDate(dateStr) {
    return dateStr; // Already in YYYY-MM-DD format from Actual
}
