"""
Load and use the trained classifier for predictions.
This module is called from Node.js via subprocess.
"""
import json
import sys
from pathlib import Path

from joblib import load


def predict(payee: str, notes: str, amount: float, model_path: Path, categories_path: Path) -> dict:
    """
    Predict category for a transaction.
    Returns dict with category_id, category_name, and confidence.
    """
    # Load model and categories
    pipeline = load(model_path)
    with open(categories_path, 'r', encoding='utf-8') as f:
        category_map = json.load(f)
    
    # Prepare input text (same format as training)
    amount_type = 'expense' if amount < 0 else 'income'
    text = f"{payee} {notes} {amount_type}".strip().lower()
    
    # Get prediction and probabilities
    category_id = pipeline.predict([text])[0]
    probabilities = pipeline.predict_proba([text])[0]
    confidence = float(max(probabilities))
    
    return {
        'category_id': category_id,
        'category_name': category_map.get(category_id, 'Unknown'),
        'confidence': confidence,
    }


def main():
    """
    CLI interface for predictions.
    Expects JSON input on stdin with transactions array.
    Outputs JSON predictions to stdout.
    """
    trainer_dir = Path(__file__).parent.parent
    model_path = trainer_dir / "model.joblib"
    categories_path = trainer_dir / "categories.json"
    
    if not model_path.exists():
        print(json.dumps({'error': 'Model not found. Run training first.'}))
        sys.exit(1)
    
    # Load model once
    pipeline = load(model_path)
    with open(categories_path, 'r', encoding='utf-8') as f:
        category_map = json.load(f)
    
    # Read transactions from stdin
    input_data = json.load(sys.stdin)
    transactions = input_data.get('transactions', [])
    
    results = []
    for tx in transactions:
        payee = tx.get('payee_name') or tx.get('imported_payee') or ''
        notes = tx.get('notes') or ''
        amount = tx.get('amount', 0)
        
        # Clean notes
        if '[AI:' in notes:
            notes = notes.split('[AI:')[0].strip()
        
        amount_type = 'expense' if amount < 0 else 'income'
        text = f"{payee} {notes} {amount_type}".strip().lower()
        
        if text:
            category_id = pipeline.predict([text])[0]
            probabilities = pipeline.predict_proba([text])[0]
            confidence = float(max(probabilities))
        else:
            category_id = None
            confidence = 0.0
        
        results.append({
            'index': tx.get('index', 0),
            'category_id': category_id,
            'category_name': category_map.get(category_id, None) if category_id else None,
            'confidence': confidence,
        })
    
    print(json.dumps(results))


if __name__ == "__main__":
    main()
