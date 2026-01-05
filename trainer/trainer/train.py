"""
Train a text classifier on categorized transactions.
Uses payee name + notes + amount as features.
"""
import json
import sys
from pathlib import Path

from joblib import dump
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score
import numpy as np


def load_training_data(data_file: Path) -> tuple[list[str], list[str], dict]:
    """
    Load training data from JSON file.
    Returns (texts, labels, category_map).
    """
    with open(data_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    texts = []
    labels = []
    category_map = {cat['id']: cat['name'] for cat in data['categories']}
    
    for tx in data['transactions']:
        if not tx.get('category'):
            continue  # Skip uncategorized
            
        # Combine payee + notes + amount info as features
        payee = tx.get('payee_name') or tx.get('imported_payee') or ''
        notes = tx.get('notes') or ''
        amount = tx.get('amount', 0)
        amount_type = 'expense' if amount < 0 else 'income'
        
        # Clean notes - remove any AI confidence markers from previous runs
        if '[AI:' in notes:
            notes = notes.split('[AI:')[0].strip()
        
        # Create feature text
        text = f"{payee} {notes} {amount_type}".strip().lower()
        
        if text and tx['category'] in category_map:
            texts.append(text)
            labels.append(tx['category'])
    
    return texts, labels, category_map


def train_model(texts: list[str], labels: list[str]) -> Pipeline:
    """
    Train a text classification pipeline.
    Uses TF-IDF vectorization + Multinomial Naive Bayes.
    """
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(
            ngram_range=(1, 2),  # Use unigrams and bigrams
            max_features=5000,
            min_df=1,
            strip_accents='unicode',
            lowercase=True,
        )),
        ('clf', MultinomialNB(alpha=0.1)),
    ])
    
    pipeline.fit(texts, labels)
    return pipeline


def evaluate_model(pipeline: Pipeline, texts: list[str], labels: list[str]) -> float:
    """
    Evaluate model using cross-validation.
    Returns mean accuracy.
    """
    scores = cross_val_score(pipeline, texts, labels, cv=min(5, len(set(labels))), scoring='accuracy')
    return float(np.mean(scores))


def main():
    """CLI entry point for training."""
    trainer_dir = Path(__file__).parent.parent
    data_file = trainer_dir / "training_data.json"
    model_file = trainer_dir / "model.joblib"
    categories_file = trainer_dir / "categories.json"
    
    if not data_file.exists():
        print("❌ Training data not found. Run export first:")
        print("   uv run export")
        sys.exit(1)
    
    print("📊 Loading training data...")
    texts, labels, category_map = load_training_data(data_file)
    
    if len(texts) < 10:
        print(f"❌ Not enough training data. Found {len(texts)} categorized transactions.")
        print("   Need at least 10 transactions to train a useful model.")
        sys.exit(1)
    
    print(f"   Found {len(texts)} categorized transactions")
    print(f"   Categories: {len(set(labels))}")
    
    print("\n🤖 Training classifier...")
    pipeline = train_model(texts, labels)
    
    print("📈 Evaluating model...")
    accuracy = evaluate_model(pipeline, texts, labels)
    print(f"   Cross-validation accuracy: {accuracy:.1%}")
    
    print(f"\n💾 Saving model to {model_file}")
    dump(pipeline, model_file)
    
    # Save category mapping
    with open(categories_file, 'w', encoding='utf-8') as f:
        json.dump(category_map, f, ensure_ascii=False, indent=2)
    
    print("✅ Training complete!")
    print(f"\n📁 Files created:")
    print(f"   - {model_file}")
    print(f"   - {categories_file}")


if __name__ == "__main__":
    main()
