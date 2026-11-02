import copy
import json
import tempfile
import unittest
from pathlib import Path
from evaluate import evaluate, score

ROOT = Path(__file__).resolve().parents[1]


class IndependentEvaluation(unittest.TestCase):
    def test_sealed_postimplementation_set_meets_exact_task_criteria(self):
        with tempfile.TemporaryDirectory() as directory:
            report = evaluate(ROOT/'fixtures/evaluation.json', directory)
            self.assertTrue(report['passed'])
            self.assertEqual(report['cases'], 12)
            self.assertEqual(report['characterErrors'], 0)
            self.assertTrue(report['fieldMutationDetected'])
            self.assertTrue(report['classMutationDetected'])

    def test_evaluator_rejects_corrupted_fields_and_wrong_case_binding(self):
        cases = [{'id': 'sealed', 'label': 'invoice', 'text': 'INVOICE', 'fields': {'totalMinor': 123}}]
        results = [{'caseId': 'sealed', 'ocr': {'text': 'INVOICE', 'accepted': True}, 'prediction': {'label': 'invoice'}, 'fields': {'totalMinor': 123}}]
        self.assertTrue(score(cases, results)['passed'])
        corrupt = copy.deepcopy(results)
        corrupt[0]['fields']['totalMinor'] = 124
        self.assertFalse(score(cases, corrupt)['passed'])
        corrupt[0]['caseId'] = 'different'
        with self.assertRaises(ValueError): score(cases, corrupt)

    def test_training_and_evaluation_texts_are_distinct(self):
        training = json.loads((ROOT/'fixtures/training.json').read_text())
        evaluation = json.loads((ROOT/'fixtures/evaluation.json').read_text())
        train_texts = {text for texts in training.values() for text in texts}
        self.assertTrue(all(case['text'] not in train_texts and case['text'].split('\n')[0] not in train_texts for case in evaluation))


if __name__ == '__main__': unittest.main()
