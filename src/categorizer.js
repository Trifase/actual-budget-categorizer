import OpenAI from 'openai';

/**
 * AI-powered transaction categorizer using OpenAI
 */
export class Categorizer {
    constructor(config, categories) {
        this.config = config;
        this.categories = categories;
        this.categoryMap = new Map(categories.map(c => [c.id, c]));
        this.categoryNameMap = new Map(categories.map(c => [c.name.toLowerCase(), c]));

        this.openai = new OpenAI({
            apiKey: config.openaiApiKey,
        });
    }

    /**
     * Build a prompt-friendly list of categories
     */
    getCategoryList() {
        return this.categories.map(c => c.name).join(', ');
    }

    /**
     * Categorize a batch of transactions using OpenAI
     * @param {Array} transactions - Array of transaction objects
     * @returns {Array} - Array of { transaction, suggestedCategory, confidence }
     */
    async categorizeBatch(transactions) {
        const results = [];

        // Process in batches of 20 for efficiency
        const batchSize = 20;
        for (let i = 0; i < transactions.length; i += batchSize) {
            const batch = transactions.slice(i, i + batchSize);
            const batchResults = await this.processBatch(batch);
            results.push(...batchResults);

            // Small delay to avoid rate limits
            if (i + batchSize < transactions.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        return results;
    }

    /**
     * Process a single batch of transactions
     */
    async processBatch(transactions) {
        const transactionDescriptions = transactions.map((tx, idx) => {
            const payee = tx.payee_name || tx.imported_payee || 'Unknown';
            const notes = tx.notes || '';
            const amount = (tx.amount / 100).toFixed(2);
            return `${idx + 1}. Payee: "${payee}" | Amount: ${amount} | Notes: "${notes}"`;
        }).join('\n');

        const prompt = `You are a financial transaction categorizer. Categorize each transaction into one of these categories:

Available categories: ${this.getCategoryList()}

Transactions to categorize:
${transactionDescriptions}

For each transaction, respond with a JSON array where each element has:
- "index": the transaction number (1-based)
- "category": the exact category name from the list above (or null if uncertain)
- "confidence": a number from 0 to 1 indicating confidence

Respond ONLY with the JSON array, no other text.`;

        try {
            const response = await this.openai.chat.completions.create({
                model: this.config.openaiModel || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a precise financial transaction categorizer. Always respond with valid JSON only.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' },
            });

            const content = response.choices[0].message.content;
            let parsed;

            try {
                parsed = JSON.parse(content);
                // Handle both { results: [...] } and direct array format
                if (parsed.results) {
                    parsed = parsed.results;
                } else if (!Array.isArray(parsed)) {
                    // Try to extract array from object
                    const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
                    if (arrayKey) {
                        parsed = parsed[arrayKey];
                    } else {
                        parsed = [];
                    }
                }
            } catch {
                console.error('Failed to parse OpenAI response:', content);
                parsed = [];
            }

            return transactions.map((tx, idx) => {
                const suggestion = parsed.find(s => s.index === idx + 1);
                let category = null;
                let confidence = 0;

                if (suggestion && suggestion.category) {
                    category = this.categoryNameMap.get(suggestion.category.toLowerCase());
                    confidence = suggestion.confidence || 0;
                }

                return {
                    transaction: tx,
                    suggestedCategory: category,
                    confidence,
                };
            });
        } catch (error) {
            console.error('OpenAI API error:', error.message);
            return transactions.map(tx => ({
                transaction: tx,
                suggestedCategory: null,
                confidence: 0,
            }));
        }
    }
}
