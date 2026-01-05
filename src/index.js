#!/usr/bin/env node
import { ActualClient } from './actual-client.js';
import { Categorizer } from './categorizer.js';
import { loadConfig, parseArgs, formatAmount, formatDate } from './utils.js';
async function main() {
    const cliOptions = parseArgs();
    const config = loadConfig();
    // Merge config with CLI options (CLI takes precedence)
    // For dryRun: CLI --dry-run forces dry run, otherwise use config value
    const options = {
        dryRun: cliOptions.dryRun ? true : (config.dryRun ?? false),
        limit: cliOptions.limit || config.limit,
        createRules: cliOptions.createRules || config.createRules,
        minConfidence: config.minConfidence || 0.85,
    };
    if (options.dryRun) {
        console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }
    const client = new ActualClient(config);
    try {
        // Connect to Actual Budget
        await client.connect();
        // Get categories for the categorizer
        const categories = await client.getCategories();
        console.log(`📁 Found ${categories.length} categories\n`);
        // Get uncategorized transactions
        console.log('🔎 Looking for uncategorized transactions...');
        const transactions = await client.getUncategorizedTransactions(options.limit);
        if (transactions.length === 0) {
            console.log('✨ All transactions are already categorized!');
            return;
        }
        console.log(`📝 Found ${transactions.length} uncategorized transaction(s)\n`);
        // Initialize categorizer
        const categorizer = new Categorizer(config, categories);
        // Categorize transactions
        console.log('🤖 Analyzing transactions with AI...\n');
        const results = await categorizer.categorizeBatch(transactions);
        // Process results
        let categorized = 0;
        let skipped = 0;
        const rulesCreated = new Set();
        for (const result of results) {
            const { transaction, suggestedCategory, confidence } = result;
            const payee = transaction.payee_name || transaction.imported_payee || 'Unknown';
            const amount = formatAmount(transaction.amount);
            const date = formatDate(transaction.date);
            if (!suggestedCategory || confidence < options.minConfidence) {
                console.log(`⏭️  Skip: "${payee}" (${amount}) - Low confidence: ${(confidence * 100).toFixed(0)}%`);
                skipped++;
                continue;
            }
            console.log(`✅ "${payee}" (${amount}, ${date}) → ${suggestedCategory.name} (${(confidence * 100).toFixed(0)}% confident)`);
            if (!options.dryRun) {
                await client.updateTransactionCategory(
                    transaction.id,
                    suggestedCategory.id,
                    transaction.notes || '',
                    confidence
                );
                // Optionally create rules
                if (options.createRules && payee !== 'Unknown' && !rulesCreated.has(payee)) {
                    try {
                        await client.createRule(payee, suggestedCategory.id);
                        console.log(`   📋 Created rule for "${payee}"`);
                        rulesCreated.add(payee);
                    } catch (e) {
                        // Rule might already exist
                    }
                }
            }
            categorized++;
        }
        // Summary
        console.log('\n' + '─'.repeat(50));
        console.log('📊 Summary:');
        console.log(`   Categorized: ${categorized}`);
        console.log(`   Skipped (low confidence): ${skipped}`);
        if (options.createRules && !options.dryRun) {
            console.log(`   Rules created: ${rulesCreated.size}`);
        }
        if (options.dryRun) {
            console.log('\n💡 Run without --dry-run to apply changes');
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.message.includes('password')) {
            console.error('   Check your actualPassword in config.json');
        }
        if (error.message.includes('budget')) {
            console.error('   Check your budgetSyncId in config.json');
            console.error('   (Find it in Actual: Settings → Show advanced settings → Sync ID)');
        }
        process.exit(1);
    } finally {
        await client.disconnect();
    }
}
main();
