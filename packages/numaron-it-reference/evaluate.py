"""Independent task oracle: consumes public results, never fixes predictions.

Expected labels/fields stay here, outside application code. Mutation tests must
detect a changed total or class. Metrics describe only the fixed synthetic set.
"""
import argparse
import base64
import hashlib
import json
import tempfile
from pathlib import Path
from app import DocumentApp


def distance(a, b):
    row = list(range(len(b)+1))
    for i, x in enumerate(a, 1):
        new = [i]
        for j, y in enumerate(b, 1):
            new.append(min(new[-1]+1, row[j]+1, row[j-1]+(x != y)))
        row = new
    return row[-1]


def score(cases, results):
    if len(cases) != len(results) or not cases:
        raise ValueError('complete evaluation rows required')
    chars, errors, fields, correct_fields = 0, 0, 0, 0
    labels = sorted({case['label'] for case in cases})
    confusion = {label: {predicted: 0 for predicted in labels+['abstained']} for label in labels}
    exact = 0
    for case, result in zip(cases, results):
        if result.get('caseId') != case['id']:
            raise ValueError('exact evaluation case binding required')
        actual = result['ocr']['text']
        chars += len(case['text'])
        errors += distance(case['text'], actual)
        predicted = result['prediction']['label']
        confusion[case['label']][predicted if predicted in labels else 'abstained'] += 1
        exact += result['fields'] == case['fields']
        for key, value in case['fields'].items():
            fields += 1
            correct_fields += result['fields'].get(key) == value
    metrics = {}
    for label in labels:
        true = confusion[label][label]
        predicted_count = sum(confusion[other][label] for other in labels)
        actual_count = sum(confusion[label].values())
        metrics[label] = {'precision': true/predicted_count if predicted_count else 0, 'recall': true/actual_count if actual_count else 0}
    passed = errors == 0 and correct_fields == fields and exact == len(cases) and all(v['precision'] == 1 and v['recall'] == 1 for v in metrics.values()) and all(r['ocr']['accepted'] for r in results)
    return {'passed': passed, 'cases': len(cases), 'characters': chars, 'characterErrors': errors, 'characterErrorRate': errors/chars, 'correctFields': correct_fields, 'totalFields': fields, 'exactDocuments': exact, 'confusionMatrix': confusion, 'perClass': metrics, 'scope': 'synthetic printed uppercase Aileron grayscale PNG forms; no customer generalization claim'}


def evaluate(fixture_file, output):
    cases = json.loads(Path(fixture_file).read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory() as directory:
        app = DocumentApp(Path(directory)/'evaluation.db', 'evaluation-token-offline')
        results = []
        try:
            for case in cases:
                status, job = app.request('POST', '/api/jobs', {'key': case['id'], 'image': case['image']}, app.token)
                if status != 201: raise ValueError('evaluation import failed')
                status, result = app.request('POST', '/api/jobs/'+job['id']+'/process', {}, app.token)
                if status != 200: raise ValueError('evaluation execution failed')
                results.append({'caseId': case['id'], 'inputSha256': hashlib.sha256(base64.b64decode(case['image'])).hexdigest(), 'ocr': result['ocr'], 'prediction': result['prediction'], 'fields': result['fields']})
        finally:
            app.close()
    report = score(cases, results)
    # A verifier which accepts these corruptions is not an effective oracle.
    mutated = json.loads(json.dumps(results))
    mutated[0]['fields']['documentId'] = 'CORRUPTED'
    report['fieldMutationDetected'] = not score(cases, mutated)['passed']
    mutated = json.loads(json.dumps(results))
    mutated[0]['prediction']['label'] = None
    report['classMutationDetected'] = not score(cases, mutated)['passed']
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    (output/'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    (output/'metrics.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('fixtures')
    parser.add_argument('output')
    args = parser.parse_args()
    report = evaluate(args.fixtures, args.output)
    print(json.dumps(report))
    raise SystemExit(0 if report['passed'] and report['fieldMutationDetected'] and report['classMutationDetected'] else 1)
