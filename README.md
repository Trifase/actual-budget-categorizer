# Actual Budget Auto-Categorizer

Automatically categorize uncategorized transactions in [Actual Budget](https://actualbudget.org) using a **local ML classifier** (trained on your own data) or optionally OpenAI.

## Features

- 🤖 **Local ML Classifier** - Train on your own transactions, no API costs
- 🌐 **OpenAI Fallback** - Use GPT-4o-mini when needed with `--openai` flag
- 🔒 **Dry-run Mode** - Preview changes before applying
- 📝 **Confidence Tracking** - Adds `[AI: XX%]` to transaction notes
- 📋 **Auto-rules** - Optionally create rules for future transactions

## Quick Start

### 1. Configure

Create `config.json` with your Actual Budget details:

```json
{
  "actualServer": "http://your-server:5006",
  "actualPassword": "your-password",
  "budgetSyncId": "your-sync-id",
  "budgetPassword": null,
  "openaiApiKey": "sk-...",
  "dryRun": false,
  "minConfidence": 0.85
}
```

**Find your Sync ID:** Actual Budget → Settings → Show advanced settings → Sync ID

### 2. Train the Local Classifier

```bash
# Export your categorized transactions
docker compose run --rm categorizer node src/export-training-data.js > trainer/training_data.json

# Train the model (requires UV)
cd trainer
uv run python -m trainer.train
```

### 3. Run

```bash
# Preview changes (dry-run)
docker compose run --rm categorizer node src/index.js --dry-run

# Apply categorizations
docker compose run --rm categorizer node src/index.js

# Use OpenAI instead of local classifier
docker compose run --rm categorizer node src/index.js --openai
```

## Command Line Options

| Option | Description |
|--------|-------------|
| `--dry-run`, `-d` | Preview changes without applying |
| `--limit N`, `-l N` | Only process N transactions |
| `--openai`, `-o` | Use OpenAI instead of local classifier |
| `--create-rules`, `-r` | Create rules for future auto-categorization |
| `--help`, `-h` | Show help |

## How It Works

1. Connects to your Actual Budget server via the official API
2. Fetches all uncategorized transactions
3. Analyzes using local ML classifier (or OpenAI with `--openai`)
4. Updates transactions above the confidence threshold
5. Appends `[AI: XX%]` to transaction notes

## Training the Local Classifier

The local classifier uses scikit-learn (TF-IDF + Naive Bayes) trained on your existing categorized transactions.

**Features used for classification:**
- Payee name
- Transaction notes
- Amount type (expense/income)

**Retrain periodically** as you categorize more transactions:

```bash
docker compose run --rm categorizer node src/export-training-data.js > trainer/training_data.json
cd trainer && uv run python -m trainer.train
```

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `actualServer` | URL of your Actual Budget server | Required |
| `actualPassword` | Your Actual server password | Required |
| `budgetSyncId` | Sync ID from Settings | Required |
| `budgetPassword` | E2E encryption password | `null` |
| `openaiApiKey` | OpenAI API key (for `--openai` flag) | Optional |
| `openaiModel` | OpenAI model to use | `gpt-4o-mini` |
| `dryRun` | Default dry-run mode | `false` |
| `minConfidence` | Min confidence to apply (0-1) | `0.85` |
| `createRules` | Create rules for payees | `false` |
| `limit` | Max transactions to process | `null` |

## Project Structure

```
├── src/
│   ├── index.js              # Main entry point
│   ├── actual-client.js      # Actual Budget API wrapper
│   ├── categorizer.js        # OpenAI categorizer
│   ├── local-categorizer.js  # Local ML categorizer
│   └── export-training-data.js
├── trainer/
│   ├── pyproject.toml        # UV/Python config
│   ├── trainer/
│   │   ├── train.py          # Training script
│   │   ├── predict.py        # Prediction module
│   │   └── export.py
│   ├── model.joblib          # Trained model (generated)
│   └── training_data.json    # Exported transactions (generated)
├── Dockerfile
├── docker-compose.yml
└── config.json               # Your configuration (gitignored)
```
