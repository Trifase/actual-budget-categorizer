# Actual Budget Auto-Categorizer

Automatically categorize uncategorized transactions in [Actual Budget](https://actualbudget.org) using AI (OpenAI GPT-4o-mini).

## Setup

### Option A: Docker (Recommended)

Since Actual Budget uses native modules that can be tricky to build on Windows, Docker is the easiest approach.

**1. Create your config file:**

```bash
cp config.example.json config.json
```

Edit `config.json` with your details (see Configuration section below).

**2. Build and run:**

```bash
# Dry run (preview changes)
docker compose run --rm categorizer node src/index.js --dry-run

# Apply categorizations
docker compose run --rm categorizer

# With options
docker compose run --rm categorizer node src/index.js --limit 5 --dry-run
```

### Option B: Native Node.js (requires Node 18-22)

If you have Node.js 18-22 with build tools installed:

```bash
npm install
npm run dry-run
```

**Where to find the Sync ID:**
1. Open Actual Budget
2. Go to Settings → Show advanced settings
3. Copy the "Sync ID"

**If you have end-to-end encryption enabled**, also set `budgetPassword` to your encryption password.

## Usage

### Dry Run (safe - no changes)

```bash
npm run dry-run
# or
node src/index.js --dry-run
```

### Apply Categorizations

```bash
npm start
# or
node src/index.js
```

### Options

```
--dry-run, -d       Show what would be done without making changes
--limit N, -l N     Only process N transactions
--create-rules, -r  Create rules for future auto-categorization
--help, -h          Show help
```

### Examples

```bash
# Preview what would happen
node src/index.js --dry-run

# Process only 5 transactions as a test
node src/index.js --dry-run --limit 5

# Apply to 1 transaction only
node src/index.js --limit 1

# Apply all and create rules for future imports
node src/index.js --create-rules
```

## How It Works

1. Connects to your Actual Budget server via the official API
2. Fetches all uncategorized transactions from the last 2 years
3. Sends transaction details (payee, amount, notes) to OpenAI
4. OpenAI suggests a category from your existing categories
5. Updates transactions that have a confidence score above the threshold
6. Optionally creates rules to auto-categorize future transactions

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `actualServer` | URL of your Actual Budget server | - |
| `actualPassword` | Your Actual server password | - |
| `budgetSyncId` | Sync ID from Settings | - |
| `budgetPassword` | E2E encryption password (if enabled) | `null` |
| `openaiApiKey` | Your OpenAI API key | - |
| `openaiModel` | OpenAI model to use | `gpt-4o-mini` |
| `dryRun` | Default dry-run mode | `false` |
| `createRules` | Create rules for payees | `false` |
| `minConfidence` | Min confidence to apply category (0-1) | `0.85` |
| `limit` | Max transactions to process | `null` (all) |
