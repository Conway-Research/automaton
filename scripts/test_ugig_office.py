import copy
import base64
import io
import json
import tempfile
import unittest
import sys
import subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from openpyxl import Workbook, load_workbook
from docx import Document
from ugig_office import build, inspect_package


def fixture(kind):
    s = {'workKind': kind, 'privacy': 'public', 'customerApproved': True}
    if kind == 'document-cleanup':
        s.update(sourceBlocks=[{'id': 'a', 'text': 'Original Ä €'}, {'id': 'b', 'text': 'Zweiter Absatz'}],
                 sections=[{'heading': 'Übersicht', 'blockIds': ['b', 'a']}])
        r = {'paragraphs': ['Übersicht', 'Zweiter Absatz', 'Original Ä €']}
    elif kind == 'support-templates':
        s.update(voiceGuide='Sachlich und freundlich.', checklist=['Keine Zusage ohne Freigabe.'])
        s['templates'] = [{'id': 'refund', 'subject': 'Anfrage {name}', 'body': 'Wir prüfen den Fall.',
                           'short': 'Wir prüfen.', 'escalation': 'An Team A', 'placeholders': ['name']}]
        r = {'paragraphs': ['refund', 'Anfrage {name}', 'Wir prüfen den Fall.', 'Wir prüfen.', 'An Team A', 'Sachlich und freundlich.', 'Keine Zusage ohne Freigabe.'],
             'cases': [{'id': 'case-1', 'templateId': 'refund', 'required': ['prüfen'], 'forbidden': ['garantiert']}],
             'expectedCaseIds': ['case-1']}
    elif kind == 'research-report':
        s['summary'] = 'Ein Referenzeintrag; keine weitere Verifikation behauptet.'
        s.update(headers=['name', 'source_url', 'retrieved_at'], rows=[['A', 'https://example.org/a', '2026-10-20']])
        r = {'headers': s['headers'], 'rows': s['rows'], 'summary': s['summary']}
    else:
        w = Workbook(); w.active.append(['name', 'amount']); w.active.append([' A ', 12]); out = io.BytesIO(); w.save(out)
        s.update(workbooks=[{'name': 'input.xlsx', 'data': base64.b64encode(out.getvalue()).decode()}],
                 rules=[{'operation': 'trim', 'column': 'name'}])
        r = {'headers': ['name', 'amount'], 'rows': [['A', 12]]}
    return s, copy.deepcopy(r)


class OfficeTests(unittest.TestCase):
    def test_oversized_text_package_rejected_before_binary_generation(self):
        from unittest.mock import patch
        s, r = fixture('document-cleanup')
        s['sourceBlocks'] = [{'id': str(i), 'text': 'Ä😀"\\' * 3000} for i in range(3)]
        s['sections'] = [{'heading': 'Titel', 'blockIds': [str(i) for i in range(3)]}]
        r['paragraphs'] = ['Titel'] + [b['text'] for b in s['sourceBlocks']]
        with tempfile.TemporaryDirectory() as d, patch('ugig_office.Document', side_effect=AssertionError('binary generation started')):
            with self.assertRaisesRegex(ValueError, 'mixed text package limit'):
                build(s, r, Path(d))
            self.assertEqual(list(Path(d).iterdir()), [])

    def test_preflight_boundary_counts_report_and_rejects_next_byte(self):
        from unittest.mock import patch
        from ugig_office import preflight_text_package, planned
        s, r = fixture('document-cleanup'); args = planned(s, r)
        low, high = 0, 96000
        while low < high:
            middle = (low + high + 1) // 2
            with patch('ugig_office.text_package', return_value={'delivery.md': 'a' * middle}):
                try: preflight_text_package(s, r, *args); low = middle
                except ValueError: high = middle - 1
        self.assertLess(low, 96000)
        with patch('ugig_office.text_package', return_value={'delivery.md': 'a' * low}):
            self.assertEqual(len(preflight_text_package(s, r, *args)['delivery.md']), low)
        with patch('ugig_office.text_package', return_value={'delivery.md': 'a' * (low+1)}):
            with self.assertRaisesRegex(ValueError, 'mixed text package limit'):
                preflight_text_package(s, r, *args)

    def test_four_real_outputs_and_reference_checks(self):
        for kind in ['document-cleanup', 'support-templates', 'research-report', 'xlsx-automation']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as d:
                s, r = fixture(kind); result = build(s, r, Path(d))
                self.assertTrue(result['technicalPassed'])
                self.assertFalse(result['independentlyVerified'])
                self.assertTrue(result['pendingReviews'])
                self.assertTrue(inspect_package(s, r, Path(d))['technicalPassed'])
                if kind in ['document-cleanup', 'support-templates']:
                    self.assertEqual([p.text for p in Document(Path(d)/'delivery.docx').paragraphs], r['paragraphs'])
                else:
                    self.assertEqual(list(load_workbook(Path(d)/'delivery.xlsx').active.values)[1:], [tuple(x) for x in r['rows']])

    def test_privacy_and_consent_before_writes(self):
        for field, value in [('privacy', 'confidential'), ('customerApproved', False)]:
            with tempfile.TemporaryDirectory() as d:
                s, r = fixture('document-cleanup'); s[field] = value
                with self.assertRaises(ValueError): build(s, r, Path(d))
                self.assertEqual(list(Path(d).iterdir()), [])

    def test_confidential_nested_input_or_reference_blocked(self):
        for confidential_reference in [False, True]:
            with tempfile.TemporaryDirectory() as d:
                s, r = fixture('document-cleanup')
                if confidential_reference: r['privacy'] = 'confidential'
                else: s['sourceBlocks'][0]['privacy'] = 'confidential'
                with self.assertRaises(ValueError): build(s, r, Path(d))
                self.assertEqual(list(Path(d).iterdir()), [])

    def test_external_workbook_link_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            s, r = fixture('xlsx-automation')
            w = Workbook(); w.active.append(['name','amount']); w.active.append([' A ', 12]); w.active['A2'].hyperlink = 'https://example.org'
            b = io.BytesIO(); w.save(b); s['workbooks'][0]['data'] = base64.b64encode(b.getvalue()).decode()
            with self.assertRaisesRegex(ValueError, 'external'): build(s, r, Path(d))

    def test_missing_or_wrong_reference_fails(self):
        for r in [{}, {'paragraphs': ['erfunden']}]:
            with tempfile.TemporaryDirectory() as d:
                s, _ = fixture('document-cleanup')
                with self.assertRaises(ValueError): build(s, r, Path(d))

    def test_source_omission_or_duplication_fails(self):
        for ids in [['a'], ['a', 'a', 'b']]:
            with tempfile.TemporaryDirectory() as d:
                s, r = fixture('document-cleanup'); s['sections'][0]['blockIds'] = ids
                with self.assertRaises(ValueError): build(s, r, Path(d))

    def test_policy_case_failure_and_missing_case(self):
        for mutate in [lambda r: r['cases'][0].update(forbidden=['prüfen']), lambda r: r.update(expectedCaseIds=['missing'])]:
            with tempfile.TemporaryDirectory() as d:
                s, r = fixture('support-templates'); mutate(r)
                with self.assertRaises(ValueError): build(s, r, Path(d))

    def test_formula_injection_is_text(self):
        with tempfile.TemporaryDirectory() as d:
            s, r = fixture('research-report'); s['rows'][0][0] = '=HYPERLINK("bad")'; r['rows'] = copy.deepcopy(s['rows'])
            build(s, r, Path(d))
            self.assertEqual(load_workbook(Path(d)/'delivery.xlsx').active['A2'].data_type, 's')
            self.assertIn("'=HYPERLINK", (Path(d)/'delivery.csv').read_text(encoding='utf-8'))

    def test_mutated_binary_fails_reinspection(self):
        with tempfile.TemporaryDirectory() as d:
            s, r = fixture('research-report'); build(s, r, Path(d))
            w = load_workbook(Path(d)/'delivery.xlsx'); w.active['A2'] = 'changed'; w.save(Path(d)/'delivery.xlsx')
            with self.assertRaises(ValueError): inspect_package(s, r, Path(d))

    def test_heading_and_change_report_tampering_fail(self):
        for change in ['heading', 'report']:
            with tempfile.TemporaryDirectory() as d:
                s, r = fixture('document-cleanup'); build(s, r, Path(d))
                if change == 'heading':
                    doc = Document(Path(d)/'delivery.docx'); doc.paragraphs[0].style = 'Normal'; doc.save(Path(d)/'delivery.docx')
                else: (Path(d)/'changes.json').write_text('{}', encoding='utf-8')
                with self.assertRaises(ValueError): inspect_package(s, r, Path(d))

    def test_unknown_rule_and_invalid_workbook_fail(self):
        for mutate in [lambda s: s['rules'][0].update(operation='exec'), lambda s: s['workbooks'][0].update(data='YmFk')]:
            with tempfile.TemporaryDirectory() as d:
                s, r = fixture('xlsx-automation'); mutate(s)
                with self.assertRaises(ValueError): build(s, r, Path(d))

    def test_existing_output_not_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            s, r = fixture('document-cleanup'); p = Path(d)/'delivery.docx'; p.write_bytes(b'original')
            with self.assertRaises(ValueError): build(s, r, Path(d))
            self.assertEqual(p.read_bytes(), b'original')

    def test_required_support_voice_and_checklist(self):
        for field in ['voiceGuide', 'checklist']:
            with tempfile.TemporaryDirectory() as d:
                s, r = fixture('support-templates'); del s[field]
                with self.assertRaises(ValueError): build(s, r, Path(d))

    def test_twenty_support_cases(self):
        with tempfile.TemporaryDirectory() as d:
            s, r = fixture('support-templates')
            r['cases'] = [dict(r['cases'][0], id='case-'+str(i)) for i in range(20)]
            r['expectedCaseIds'] = [c['id'] for c in r['cases']]
            self.assertTrue(build(s, r, Path(d))['technicalPassed'])

    def test_excel_formulas_are_explicitly_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            s, r = fixture('xlsx-automation')
            w = Workbook(); w.active.append(['name','amount']); w.active.append([' A ', '=1+1']); b = io.BytesIO(); w.save(b)
            s['workbooks'][0]['data'] = base64.b64encode(b.getvalue()).decode()
            with self.assertRaisesRegex(ValueError, 'formula'): build(s, r, Path(d))

    def test_csv_tampering_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            s, r = fixture('research-report'); build(s, r, Path(d))
            (Path(d)/'delivery.csv').write_text('wrong', encoding='utf-8')
            with self.assertRaises(ValueError): inspect_package(s, r, Path(d))

    def test_delivered_automation_runs_and_preserves_original(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d); s, r = fixture('xlsx-automation'); build(s, r, out)
            (out/'inputs').mkdir(); (out/'result').mkdir()
            original = base64.b64decode(s['workbooks'][0]['data']); (out/'inputs/input.xlsx').write_bytes(original)
            run = subprocess.run([sys.executable, '-I', str(out/'automation.py'), '--transform', str(out/'recipe.json'), str(out/'reference.json'), str(out/'inputs'), str(out/'result')], capture_output=True, timeout=30)
            self.assertEqual(run.returncode, 0, run.stderr.decode())
            self.assertEqual((out/'inputs/input.xlsx').read_bytes(), original)
            self.assertEqual((out/'delivery.csv').read_bytes(), (out/'result/delivery.csv').read_bytes())

if __name__ == '__main__': unittest.main()
