"""A trained multinomial Naive Bayes classifier with explicit abstention.

Model fitting uses training.json only. No holdout data is used for fitting.
"""
import collections
import json
import math
import re
from pathlib import Path


def tokens(text):
    return re.findall(r'[A-Z]{2,}', text.upper())


class Classifier:
    def __init__(self, training):
        self.vocabulary = set()
        self.counts, self.documents = {}, {}
        for label, texts in training.items():
            counter = collections.Counter(t for text in texts for t in tokens(text))
            self.counts[label], self.documents[label] = counter, len(texts)
            self.vocabulary.update(counter)

    @classmethod
    def load_default(cls):
        return cls(json.loads((Path(__file__).parent/'fixtures/training.json').read_text(encoding='utf-8')))

    def predict(self, text):
        words = tokens(text)
        known = [w for w in words if w in self.vocabulary]
        if len(known) < 2 or len(known)/max(1, len(words)) < .35:
            return {'label': None, 'confidence': 0.0, 'reason': 'insufficient-known-terms'}
        scores = {}
        for label, counts in self.counts.items():
            score = math.log(self.documents[label]/sum(self.documents.values()))
            size = sum(counts.values())+len(self.vocabulary)
            scores[label] = score + sum(math.log((counts[w]+1)/size) for w in known)
        best = max(scores, key=scores.get)
        confidence = 1/sum(math.exp(score-scores[best]) for score in scores.values())
        return {'label': best if confidence >= .78 else None, 'confidence': round(confidence, 6), 'reason': None if confidence >= .78 else 'uncertain-classification'}

    def to_json(self):
        return json.dumps({'schema': 1, 'counts': self.counts, 'documents': self.documents}, sort_keys=True)

    @classmethod
    def from_json(cls, raw):
        data = json.loads(raw)
        if data.get('schema') != 1 or set(data['counts']) != set(data['documents']):
            raise ValueError('model schema mismatch')
        instance = cls({})
        instance.counts = {k: collections.Counter(v) for k, v in data['counts'].items()}
        instance.documents = data['documents']
        if not instance.counts or any(not isinstance(n, int) or n <= 0 for n in instance.documents.values()) or any(not isinstance(n, int) or n < 0 for c in instance.counts.values() for n in c.values()):
            raise ValueError('invalid model counts')
        instance.vocabulary = set().union(*(set(c) for c in instance.counts.values()))
        return instance
