"""
Export categorized transactions from Actual Budget for training.
This module connects to Actual Budget and exports transactions to JSON.
"""
import json
import subprocess
import sys
from pathlib import Path


def export_transactions():
    """
    Run the Node.js export script to get training data from Actual Budget.
    Returns the path to the exported JSON file.
    """
    script_dir = Path(__file__).parent.parent
    export_script = script_dir / "src" / "export-training-data.js"
    output_file = script_dir / "trainer" / "training_data.json"
    
    if not export_script.exists():
        print(f"❌ Export script not found: {export_script}")
        sys.exit(1)
    
    print("📦 Exporting transactions from Actual Budget...")
    result = subprocess.run(
        ["node", str(export_script)],
        cwd=str(script_dir),
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"❌ Export failed: {result.stderr}")
        sys.exit(1)
    
    # The Node script outputs JSON to stdout
    try:
        data = json.loads(result.stdout)
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"✅ Exported {len(data['transactions'])} transactions to {output_file}")
        return output_file
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse export output: {e}")
        print(f"Output was: {result.stdout[:500]}")
        sys.exit(1)


def main():
    """CLI entry point for exporting training data."""
    export_transactions()


if __name__ == "__main__":
    main()
