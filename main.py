#to test the model's performance
import requests
import json
from rouge_score import rouge_scorer
import matplotlib.pyplot as plt

with open('test.json') as f:
    test_cases = json.load(f)

scorer = rouge_scorer.RougeScorer(['rouge1', 'rouge2', 'rougeL'], use_stemmer=True)

scores_rouge1 = []
scores_rouge2 = []
scores_rougeL = []
outputs = []

for idx, case in enumerate(test_cases):

    res = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": "anjanafinetune:latest", "prompt": case['input']}
    )
    response_text = res.json().get("response", "").strip()
    outputs.append(response_text)
    
    scores = scorer.score(case["expected"], response_text)
    scores_rouge1.append(scores['rouge1'].fmeasure)
    scores_rouge2.append(scores['rouge2'].fmeasure)
    scores_rougeL.append(scores['rougeL'].fmeasure)
    
    print(f"Prompt: {case['input']}\nExpected: {case['expected']}\nGenerated: {response_text}\n"
          f"ROUGE-1: {scores['rouge1'].fmeasure:.3f}, "
          f"ROUGE-2: {scores['rouge2'].fmeasure:.3f}, "
          f"ROUGE-L: {scores['rougeL'].fmeasure:.3f}\n{'='*40}")

plt.figure(figsize=(10, 6))
plt.plot(scores_rouge1, label="ROUGE-1", marker='o')
plt.plot(scores_rouge2, label="ROUGE-2", marker='o')
plt.plot(scores_rougeL, label="ROUGE-L", marker='o')
plt.xlabel("Test Sample Index")
plt.ylabel("ROUGE F1 Score")
plt.title("ROUGE Scores: anjanafinetune:latest")
plt.ylim(0, 1)
plt.legend()
plt.grid(True)
plt.tight_layout()
plt.show()

print(f"Average ROUGE-1: {sum(scores_rouge1)/len(scores_rouge1):.3f}")
print(f"Average ROUGE-2: {sum(scores_rouge2)/len(scores_rouge2):.3f}")
print(f"Average ROUGE-L: {sum(scores_rougeL)/len(scores_rougeL):.3f}")
