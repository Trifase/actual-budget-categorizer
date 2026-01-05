import api from '@actual-app/api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Actual Budget API wrapper
 */
export class ActualClient {
    constructor(config) {
        this.config = config;
        this.connected = false;
    }
    /**
     * Connect to Actual Budget server and download the budget
     */
    async connect() {
        const cacheDir = path.join(__dirname, '..', '.actual-cache');
        // Create cache directory if it doesn't exist
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        await api.init({
            dataDir: cacheDir,
            serverURL: this.config.actualServer,
            password: this.config.actualPassword,
        });
        // Download budget (with optional encryption password)
        if (this.config.budgetPassword) {
            await api.downloadBudget(this.config.budgetSyncId, {
                password: this.config.budgetPassword,
            });
        } else {
            await api.downloadBudget(this.config.budgetSyncId);
        }
        this.connected = true;
        console.log('✅ Connected to Actual Budget');
    }
    /**
     * Disconnect from Actual Budget
     */
    async disconnect() {
        if (this.connected) {
            await api.shutdown();
            this.connected = false;
            console.log('👋 Disconnected from Actual Budget');
        }
    }
    /**
     * Get all accounts
     */
    async getAccounts() {
        return await api.getAccounts();
    }
    /**
     * Get all categories (excluding income categories)
     */
    async getCategories() {
        const categories = await api.getCategories();
        // Filter out internal/hidden categories
        return categories.filter(c => !c.is_income && c.name);
    }
    /**
     * Get all payees
     */
    async getPayees() {
        return await api.getPayees();
    }
    /**
     * Get transactions from an account within a date range
     */
    async getTransactions(accountId, startDate, endDate) {
        return await api.getTransactions(accountId, startDate, endDate);
    }
    /**
     * Get all uncategorized transactions across all accounts
     * @param {number} limit - Optional limit on number of transactions
     */
    async getUncategorizedTransactions(limit = null) {
        const accounts = await this.getAccounts();
        const uncategorized = [];
        // Get transactions from the last 2 years
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
        for (const account of accounts) {
            if (account.closed) continue;
            const transactions = await this.getTransactions(
                account.id,
                startDate,
                endDate
            );
            for (const tx of transactions) {
                // Skip if already has category, is a transfer, or is a split parent
                if (tx.category || tx.transfer_id || tx.is_parent) continue;
                uncategorized.push({
                    ...tx,
                    accountName: account.name,
                });
                if (limit && uncategorized.length >= limit) {
                    return uncategorized;
                }
            }
        }
        return uncategorized;
    }
    /**
     * Update a transaction's category and append confidence to notes
     */
    async updateTransactionCategory(transactionId, categoryId, existingNotes, confidence) {
        const confidenceNote = `(Confidence: ${(confidence * 100).toFixed(0)}%)`;
        const newNotes = existingNotes
            ? `${existingNotes} ${confidenceNote}`
            : confidenceNote;
        await api.updateTransaction(transactionId, {
            category: categoryId,
            notes: newNotes
        });
    }
    /**
     * Create a rule to auto-categorize future transactions
     */
    async createRule(payeeName, categoryId) {
        const rule = {
            stage: 'pre',
            conditionsOp: 'and',
            conditions: [
                {
                    field: 'payee',
                    op: 'is',
                    value: payeeName,
                },
            ],
            actions: [
                {
                    op: 'set',
                    field: 'category',
                    value: categoryId,
                },
            ],
        };
        return await api.createRule(rule);
    }
}
