#!/usr/bin/env node

/**
 * Export categorized transactions from Actual Budget for ML training.
 * Writes JSON directly to trainer/training_data.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ActualClient } from './actual-client.js';
import { loadConfig } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    const config = loadConfig();
    const client = new ActualClient(config);

    try {
        await client.connect();

        const categories = await client.getCategories();
        const accounts = await client.getAccounts();
        const payees = await client.getPayees();

        // Create payee lookup
        const payeeMap = new Map(payees.map(p => [p.id, p.name]));

        // Get all transactions from the last 3 years
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 1095 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];

        const allTransactions = [];

        for (const account of accounts) {
            if (account.closed) continue;

            const transactions = await client.getTransactions(
                account.id,
                startDate,
                endDate
            );

            for (const tx of transactions) {
                // Skip transfers and split parents
                if (tx.transfer_id || tx.is_parent) continue;

                allTransactions.push({
                    id: tx.id,
                    date: tx.date,
                    amount: tx.amount,
                    payee: tx.payee,
                    payee_name: payeeMap.get(tx.payee) || tx.imported_payee || null,
                    imported_payee: tx.imported_payee,
                    notes: tx.notes,
                    category: tx.category,
                    account: account.name,
                });
            }
        }

        const output = {
            exported_at: new Date().toISOString(),
            categories: categories.map(c => ({ id: c.id, name: c.name })),
            transactions: allTransactions,
        };

        // Write directly to file
        const outputPath = path.join(__dirname, '..', 'trainer', 'training_data.json');
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

        console.log(`✅ Exported ${allTransactions.length} transactions to ${outputPath}`);

    } finally {
        await client.disconnect();
    }
}

main().catch(err => {
    console.error('❌ Export failed:', err.message);
    process.exit(1);
});
