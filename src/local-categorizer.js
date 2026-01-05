import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Local ML-based transaction categorizer using trained scikit-learn model.
 */
export class LocalCategorizer {
    constructor(config, categories) {
        this.config = config;
        this.categories = categories;
        this.categoryMap = new Map(categories.map(c => [c.id, c]));
        this.categoryNameMap = new Map(categories.map(c => [c.name.toLowerCase(), c]));
        // Path to Python predictor
        this.trainerDir = path.join(__dirname, '..', 'trainer');
        this.predictScript = path.join(this.trainerDir, 'trainer', 'predict.py');
        this.modelPath = path.join(this.trainerDir, 'model.joblib');
    }
    /**
     * Check if the trained model exists
     */
    isModelAvailable() {
        return fs.existsSync(this.modelPath);
    }
    /**
     * Categorize a batch of transactions using the local ML model
     * @param {Array} transactions - Array of transaction objects
     * @returns {Array} - Array of { transaction, suggestedCategory, confidence }
     */
    async categorizeBatch(transactions) {
        if (!this.isModelAvailable()) {
            console.error('❌ Local model not found. Train it first:');
            console.error('   cd trainer && uv run train');
            return transactions.map(tx => ({
                transaction: tx,
                suggestedCategory: null,
                confidence: 0,
            }));
        }
        // Prepare input for Python script
        const input = {
            transactions: transactions.map((tx, idx) => ({
                index: idx + 1,
                payee_name: tx.payee_name,
                imported_payee: tx.imported_payee,
                notes: tx.notes,
                amount: tx.amount,
            })),
        };
        try {
            const predictions = await this.runPythonPredictor(input);
            return transactions.map((tx, idx) => {
                const prediction = predictions.find(p => p.index === idx + 1);
                let category = null;
                let confidence = 0;
                if (prediction && prediction.category_id) {
                    category = this.categoryMap.get(prediction.category_id);
                    confidence = prediction.confidence || 0;
                }
                return {
                    transaction: tx,
                    suggestedCategory: category,
                    confidence,
                };
            });
        } catch (error) {
            console.error('❌ Local prediction error:', error.message);
            return transactions.map(tx => ({
                transaction: tx,
                suggestedCategory: null,
                confidence: 0,
            }));
        }
    }
    /**
     * Run the Python prediction script
     */
    runPythonPredictor(input) {
        return new Promise((resolve, reject) => {
            // Use 'uv run' to execute Python with the virtual environment
            const python = spawn('uv', ['run', 'python', '-m', 'trainer.predict'], {
                cwd: this.trainerDir,
            });
            let stdout = '';
            let stderr = '';
            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            python.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            python.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python exited with code ${code}: ${stderr}`));
                    return;
                }
                try {
                    const result = JSON.parse(stdout);
                    if (result.error) {
                        reject(new Error(result.error));
                    } else {
                        resolve(result);
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Python output: ${stdout}`));
                }
            });
            // Send input to Python stdin
            python.stdin.write(JSON.stringify(input));
            python.stdin.end();
        });
    }
}