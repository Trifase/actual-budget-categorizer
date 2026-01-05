"""
Evaluate the classifier accuracy using even/odd transaction splits.

This script:
1. Loads all categorized transactions (excluding off-budget accounts)
2. Trains on even-indexed transactions, tests on odd-indexed
3. Trains on odd-indexed transactions, tests on even-indexed
4. Reports accuracy statistics for both splits
5. Shows detailed failure analysis
"""
import json
import sys
from pathlib import Path
from collections import Counter

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score
import numpy as np


def load_data(data_file: Path) -> tuple[list[dict], dict]:
    """Load training data from JSON file."""
    with open(data_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    category_map = {cat['id']: cat['name'] for cat in data['categories']}
    
    # Filter to only categorized transactions
    categorized = [tx for tx in data['transactions'] if tx.get('category')]
    
    return categorized, category_map


def prepare_features(tx: dict) -> str:
    """Convert a transaction to feature text."""
    payee = tx.get('payee_name') or tx.get('imported_payee') or ''
    notes = tx.get('notes') or ''
    amount = tx.get('amount', 0)
    amount_type = 'expense' if amount < 0 else 'income'
    
    # Clean notes - remove AI confidence markers
    if '[AI:' in notes:
        notes = notes.split('[AI:')[0].strip()
    
    return f"{payee} {notes} {amount_type}".strip().lower()


def create_pipeline() -> Pipeline:
    """Create a fresh classifier pipeline."""
    return Pipeline([
        ('tfidf', TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=5000,
            min_df=1,
            strip_accents='unicode',
            lowercase=True,
        )),
        ('clf', MultinomialNB(alpha=0.1)),
    ])


def evaluate_split(train_txs: list[dict], test_txs: list[dict], category_map: dict) -> dict:
    """Train on one split, evaluate on the other."""
    # Prepare data
    train_texts = [prepare_features(tx) for tx in train_txs]
    train_labels = [tx['category'] for tx in train_txs]
    
    test_texts = [prepare_features(tx) for tx in test_txs]
    test_labels = [tx['category'] for tx in test_txs]
    
    # Train
    pipeline = create_pipeline()
    pipeline.fit(train_texts, train_labels)
    
    # Predict
    predictions = pipeline.predict(test_texts)
    probabilities = pipeline.predict_proba(test_texts)
    confidences = [max(probs) for probs in probabilities]
    
    # Calculate metrics
    accuracy = accuracy_score(test_labels, predictions)
    
    # Per-category accuracy
    correct_by_category = Counter()
    total_by_category = Counter()
    
    for true_label, pred_label in zip(test_labels, predictions):
        total_by_category[true_label] += 1
        if true_label == pred_label:
            correct_by_category[true_label] += 1
    
    category_accuracy = {
        cat_id: correct_by_category[cat_id] / total_by_category[cat_id]
        for cat_id in total_by_category
    }
    
    # Confidence analysis
    correct_mask = [t == p for t, p in zip(test_labels, predictions)]
    correct_confidences = [c for c, m in zip(confidences, correct_mask) if m]
    wrong_confidences = [c for c, m in zip(confidences, correct_mask) if not m]
    
    # Collect failures with details
    failures = []
    for i, (tx, true_label, pred_label, conf) in enumerate(
        zip(test_txs, test_labels, predictions, confidences)
    ):
        if true_label != pred_label:
            failures.append({
                'payee': tx.get('payee_name') or tx.get('imported_payee') or 'Unknown',
                'notes': tx.get('notes') or '',
                'amount': tx.get('amount', 0),
                'expected': true_label,
                'predicted': pred_label,
                'confidence': conf,
            })
    
    return {
        'accuracy': accuracy,
        'total_test': len(test_labels),
        'correct': sum(correct_mask),
        'wrong': len(test_labels) - sum(correct_mask),
        'avg_confidence_correct': np.mean(correct_confidences) if correct_confidences else 0,
        'avg_confidence_wrong': np.mean(wrong_confidences) if wrong_confidences else 0,
        'category_accuracy': category_accuracy,
        'predictions': predictions,
        'test_labels': test_labels,
        'confidences': confidences,
        'failures': failures,
    }


def get_category_name(cat_id: str, category_map: dict) -> str:
    """Get category name, with fallback for unknown categories."""
    return category_map.get(cat_id, f"[Unknown: {cat_id[:8]}...]")


def print_results(results: dict, category_map: dict, split_name: str):
    """Print evaluation results."""
    print(f"\n{'='*70}")
    print(f"  {split_name}")
    print(f"{'='*70}")
    
    print(f"\n📊 Overall Accuracy: {results['accuracy']:.1%}")
    print(f"   Correct: {results['correct']} / {results['total_test']}")
    print(f"   Wrong: {results['wrong']}")
    
    print(f"\n📈 Confidence Analysis:")
    print(f"   Avg confidence (correct predictions): {results['avg_confidence_correct']:.1%}")
    print(f"   Avg confidence (wrong predictions): {results['avg_confidence_wrong']:.1%}")
    
    # Top 10 categories by count
    print(f"\n📁 Per-Category Accuracy (top 10 by frequency):")
    sorted_cats = sorted(
        results['category_accuracy'].items(),
        key=lambda x: -Counter(results['test_labels'])[x[0]]
    )[:10]
    
    for cat_id, acc in sorted_cats:
        cat_name = get_category_name(cat_id, category_map)[:25]
        count = Counter(results['test_labels'])[cat_id]
        print(f"   {cat_name:<25} {acc:>6.1%} ({count} samples)")
    
    # Show failure examples
    if results['failures']:
        print(f"\n❌ Failure Examples (showing up to 15):")
        print(f"   {'Payee':<25} {'Expected':<15} {'Predicted':<15} {'Conf':<6}")
        print(f"   {'-'*25} {'-'*15} {'-'*15} {'-'*6}")
        
        # Sort by confidence (highest first - most confident mistakes)
        sorted_failures = sorted(results['failures'], key=lambda x: -x['confidence'])[:15]
        
        for f in sorted_failures:
            payee = f['payee'][:25]
            expected = get_category_name(f['expected'], category_map)[:15]
            predicted = get_category_name(f['predicted'], category_map)[:15]
            conf = f"{f['confidence']:.0%}"
            print(f"   {payee:<25} {expected:<15} {predicted:<15} {conf:<6}")


def print_confusion_analysis(results: dict, category_map: dict):
    """Print analysis of common confusions."""
    confusion_pairs = Counter()
    
    for f in results['failures']:
        expected = get_category_name(f['expected'], category_map)
        predicted = get_category_name(f['predicted'], category_map)
        confusion_pairs[(expected, predicted)] += 1
    
    if confusion_pairs:
        print(f"\n🔄 Most Common Confusions:")
        for (expected, predicted), count in confusion_pairs.most_common(10):
            print(f"   {expected[:20]:<20} → {predicted[:20]:<20} ({count}x)")


def main():
    trainer_dir = Path(__file__).parent.parent
    data_file = trainer_dir / "training_data.json"
    
    if not data_file.exists():
        print("❌ Training data not found. Run export first:")
        print("   node src/export-training-data.js")
        sys.exit(1)
    
    print("📦 Loading transactions...")
    transactions, category_map = load_data(data_file)
    
    if len(transactions) < 20:
        print(f"❌ Not enough categorized transactions ({len(transactions)}). Need at least 20.")
        sys.exit(1)
    
    print(f"   Found {len(transactions)} categorized transactions")
    print(f"   Categories: {len(set(tx['category'] for tx in transactions))}")
    
    # Check for categories not in map
    unknown_cats = set()
    for tx in transactions:
        if tx['category'] not in category_map:
            unknown_cats.add(tx['category'])
    
    if unknown_cats:
        print(f"   ⚠️  {len(unknown_cats)} category IDs not found in category list")
    
    # Split into even/odd
    even_txs = [tx for i, tx in enumerate(transactions) if i % 2 == 0]
    odd_txs = [tx for i, tx in enumerate(transactions) if i % 2 == 1]
    
    print(f"\n🔀 Splitting data:")
    print(f"   Even indices: {len(even_txs)} transactions")
    print(f"   Odd indices: {len(odd_txs)} transactions")
    
    # Test 1: Train on even, test on odd
    print("\n🤖 Training on EVEN, testing on ODD...")
    results_even_train = evaluate_split(even_txs, odd_txs, category_map)
    print_results(results_even_train, category_map, "Train: EVEN → Test: ODD")
    print_confusion_analysis(results_even_train, category_map)
    
    # Test 2: Train on odd, test on even
    print("\n🤖 Training on ODD, testing on EVEN...")
    results_odd_train = evaluate_split(odd_txs, even_txs, category_map)
    print_results(results_odd_train, category_map, "Train: ODD → Test: EVEN")
    print_confusion_analysis(results_odd_train, category_map)
    
    # Combined summary
    combined_accuracy = (results_even_train['accuracy'] + results_odd_train['accuracy']) / 2
    
    print(f"\n{'='*70}")
    print(f"  COMBINED RESULTS")
    print(f"{'='*70}")
    print(f"\n🎯 Average Accuracy: {combined_accuracy:.1%}")
    print(f"   Train EVEN → Test ODD: {results_even_train['accuracy']:.1%}")
    print(f"   Train ODD → Test EVEN: {results_odd_train['accuracy']:.1%}")
    
    # Recommendation
    print(f"\n💡 Recommendation:")
    if combined_accuracy >= 0.85:
        print("   ✅ Model performs well! Ready for production use.")
    elif combined_accuracy >= 0.70:
        print("   ⚠️  Model is decent but could improve with more training data.")
    else:
        print("   ❌ Model accuracy is low. Consider:")
        print("      - Adding more categorized transactions")
        print("      - Checking for inconsistent categorization in your data")
        print("      - Using OpenAI for better results (--openai flag)")


if __name__ == "__main__":
    main()
