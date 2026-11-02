"""Trusted, bounded Office formatter. No network, macros, user code or review grants.

CLI: python -I ugig_office.py SPEC.json REFERENCE.json EMPTY_OUTPUT_DIRECTORY
Only explicit public inputs with customer permission are accepted. Caller must
enforce current contract/funding authority; this module cannot grant it.
"""
import base64
import csv
import hashlib
import io
import json
import math
import re
import sys
import zipfile
from importlib.metadata import version as installed_version
from datetime import date
from pathlib import Path
from urllib.parse import urlparse
try:
    from docx import Document
    from docx.shared import Inches, Pt
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Font
except ImportError as exc:
    raise SystemExit('Laufzeit fehlt: python-docx==1.2.0 und openpyxl==3.1.5 erforderlich. Keine automatische Installation.') from exc

KINDS = {'document-cleanup', 'support-templates', 'research-report', 'xlsx-automation'}
PENDING = {
    'document-cleanup': ['source-preservation', 'structure', 'change-report', 'visual-layout'],
    'support-templates': ['policy-compliance', 'placeholders', 'escalation', 'no-invented-promises', 'visual-layout'],
    'research-report': ['source-quality', 'claim-meaning', 'coverage', 'reuse-rights'],
    'xlsx-automation': ['reference-workbooks', 'formulas-and-types', 'invalid-rows', 'original-preservation'],
}


def require(ok, message):
    if not ok: raise ValueError(message)


def text(value):
    require(isinstance(value, str) and 0 < len(value) <= 20000 and
            not re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', value), 'invalid text')
    return value


def sha(data): return hashlib.sha256(data).hexdigest()


def canonical(value): return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def public_tree(value):
    if isinstance(value, dict):
        if 'privacy' in value: require(value['privacy'] == 'public', 'confidential or unknown nested input')
        for child in value.values(): public_tree(child)
    elif isinstance(value, list):
        for child in value: public_tree(child)


def check_office(data):
    require(0 < len(data) <= 10*1024*1024, 'Office byte limit')
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            entries = z.infolist()
            require(len(entries) <= 200 and sum(e.file_size for e in entries) <= 32*1024*1024, 'Office expanded limit')
            require(len({e.filename.lower() for e in entries}) == len(entries), 'duplicate ZIP paths')
            for e in entries:
                require(not e.flag_bits & 1 and e.file_size <= 10*1024*1024 and
                        e.file_size <= max(1, e.compress_size)*100, 'Office compression limit')
                require(not e.filename.startswith(('/', '\\')) and '..' not in e.filename.split('/') and
                        not re.search(r'vba|activex|embeddings|\.bin$', e.filename, re.I), 'active Office content')
                if e.filename.endswith(('.xml', '.rels')):
                    xml = z.read(e).decode('utf-8')
                    require(not re.search(r'<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*[\"\x27]\s*External', xml, re.I), 'external Office content')
    except (zipfile.BadZipFile, UnicodeError, RuntimeError) as exc:
        raise ValueError('invalid Office archive') from exc


def table(headers, rows):
    require(isinstance(headers, list) and 1 <= len(headers) <= 32 and len(set(headers)) == len(headers), 'headers')
    for h in headers: text(h)
    require(isinstance(rows, list) and 1 <= len(rows) <= 150000, 'rows')
    for row in rows:
        require(isinstance(row, list) and len(row) == len(headers), 'invalid row width')
        for v in row:
            require(v is None or type(v) in (str, int, float, bool), 'invalid cell type')
            if isinstance(v, str):
                require(len(v) <= 20000 and not re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', v), 'invalid cell string')
            if isinstance(v, (int, float)) and not isinstance(v, bool): require(math.isfinite(v) and abs(v) <= 1e15, 'numeric precision limit')
    return headers, rows


def transform(workbooks, rules):
    require(isinstance(workbooks, list) and 1 <= len(workbooks) <= 3, 'workbooks')
    require(isinstance(rules, list) and 1 <= len(rules) <= 2, 'rules')
    names = set(); headers = None; rows = []; originals = []
    for item in workbooks:
        name = item['name']; require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*\.xlsx', name) and name.lower() not in names, 'workbook name')
        names.add(name.lower())
        try: data = base64.b64decode(item['data'], validate=True)
        except Exception as exc: raise ValueError('workbook encoding') from exc
        check_office(data); originals.append({'name': name, 'sha256': sha(data)})
        w = load_workbook(io.BytesIO(data), data_only=False, read_only=True, keep_links=False)
        try:
            require(len(w.worksheets) == 1, 'exactly one sheet required')
            sheet = w.active; require(sheet.max_row <= 50001 and sheet.max_column <= 32, 'workbook dimensions')
            values = []
            for row in sheet.iter_rows():
                require(all(c.data_type != 'f' for c in row), 'formula evaluation unsupported; no silent loss')
                values.append([c.value for c in row])
            require(len(values) > 1, 'empty workbook')
            if headers is None: headers = values[0]
            require(headers == values[0], 'workbook headers differ')
            table(headers, values[1:]); rows.extend(values[1:])
        finally: w.close()
    for rule in rules:
        require(set(rule) == {'operation', 'column'} and rule['operation'] in ('trim', 'lowercase') and rule['column'] in headers, 'unsupported rule')
        index = headers.index(rule['column'])
        for row in rows:
            require(isinstance(row[index], str), 'rule requires text cell; no implicit coercion')
            row[index] = row[index].strip() if rule['operation'] == 'trim' else row[index].lower()
    return headers, rows, originals


def runtime_check():
    require(sys.version_info[:2] in ((3, 11), (3, 12), (3, 13)), 'Python 3.11 bis 3.13 erforderlich')
    versions = {name: installed_version(name) for name in ('python-docx', 'openpyxl')}
    require(versions == {'python-docx': '1.2.0', 'openpyxl': '3.1.5'},
            'Laufzeit unpassend: python-docx==1.2.0 und openpyxl==3.1.5 erforderlich')
    return {'ok': True, 'versions': versions}


def reusable_reference(spec, reference, consent):
    require(spec.get('workKind') == 'xlsx-automation' and spec.get('privacy') == 'public'
            and spec.get('customerApproved') is True, 'public customer permission required')
    public_tree(spec); public_tree(reference); public_tree(consent)
    require(consent.get('privacy') == 'public' and consent.get('customerApproved') is True,
            'explicit public permission for this run required')
    headers, rows, originals = transform(spec['workbooks'], spec['rules'])
    require(consent.get('inputs') == originals, 'consent must bind exact input names and SHA256')
    require(headers == reference.get('headers'), 'reusable schema headers differ')
    table(reference['headers'], reference['rows'])
    for i in range(len(headers)):
        types = {type(row[i]) for row in reference['rows']}
        require(all(type(row[i]) in types for row in rows), 'reusable cell type differs')
    return {'headers': headers, 'rows': rows, 'validationMode': 'schema-and-rules'}



def planned(spec, reference):
    require(spec.get('privacy') == 'public' and spec.get('customerApproved') is True, 'public customer permission required')
    public_tree(spec); public_tree(reference)
    kind = spec.get('workKind'); require(kind in KINDS, 'unsupported work kind')
    require(len(canonical(spec)) <= 42*1024*1024 and len(canonical(reference)) <= 16*1024*1024, 'input bounds')
    paragraphs = []; headers = []; rows = []; originals = []
    if kind == 'document-cleanup':
        blocks = spec['sourceBlocks']; sections = spec['sections']
        require(1 <= len(blocks) <= 200 and 1 <= len(sections) <= 100, 'document bounds')
        mapping = {text(b['id']): text(b['text']) for b in blocks}
        require(len(mapping) == len(blocks), 'duplicate source id')
        ids = [i for section in sections for i in section['blockIds']]
        require(len(ids) == len(set(ids)) and set(ids) == set(mapping), 'all source blocks exactly once')
        for section in sections: paragraphs.extend([text(section['heading']), *[mapping[i] for i in section['blockIds']]])
    elif kind == 'support-templates':
        templates = spec['templates']; require(1 <= len(templates) <= 10, 'template bounds')
        mapping = {text(t['id']): t for t in templates}; require(len(mapping) == len(templates), 'duplicate template id')
        for t in templates:
            values = [text(t[k]) for k in ('id', 'subject', 'body', 'short', 'escalation')]
            found = set(re.findall(r'\{([A-Za-z_][A-Za-z_0-9]*)\}', '\n'.join(values)))
            require(found == set(t['placeholders']) and len(found) == len(t['placeholders']), 'placeholder mismatch')
            paragraphs.extend(values)
        require(isinstance(spec.get('checklist'), list) and 1 <= len(spec['checklist']) <= 30, 'support checklist required')
        paragraphs.append(text(spec.get('voiceGuide')))
        paragraphs.extend(text(v) for v in spec['checklist'])
        cases = reference.get('cases', []); expected = reference.get('expectedCaseIds', [])
        require(1 <= len(cases) <= 100 and len({c['id'] for c in cases}) == len(cases) and
                set(c['id'] for c in cases) == set(expected), 'all agreed reference cases required')
        require(set(c['templateId'] for c in cases) == set(mapping), 'every template needs reference coverage')
        for c in cases:
            body = '\n'.join(mapping[c['templateId']][k] for k in ('subject', 'body', 'short', 'escalation'))
            require(c.get('required') and isinstance(c.get('forbidden'), list), 'policy reference missing')
            require(all(text(v).casefold() in body.casefold() for v in c['required']) and
                    all(text(v).casefold() not in body.casefold() for v in c['forbidden']), 'policy reference failed')
    elif kind == 'research-report':
        require(text(spec.get('summary')) == reference.get('summary'), 'summary reference mismatch')
        headers, rows = table(spec['headers'], spec['rows'])
        require(len(rows) <= 20 and len(headers) <= 10 and {'source_url', 'retrieved_at'} <= set(headers), 'research scope')
        for row in rows:
            u = urlparse(row[headers.index('source_url')]); require(u.scheme in ('https', 'http') and u.hostname and not u.username and not u.password, 'source URL')
            try: date.fromisoformat(row[headers.index('retrieved_at')])
            except (ValueError, TypeError) as exc: raise ValueError('source date') from exc
    else: headers, rows, originals = transform(spec['workbooks'], spec['rules'])
    if paragraphs: require(reference.get('paragraphs') == paragraphs, 'document reference mismatch')
    else:
        require(canonical(reference.get('headers')) == canonical(headers) and canonical(reference.get('rows')) == canonical(rows), 'typed workbook reference mismatch')
    return paragraphs, headers, rows, originals


def csv_text(headers, rows):
    stream = io.StringIO(newline=''); writer = csv.writer(stream, lineterminator='\n')
    def safe(v):
        return "'"+v if isinstance(v, str) and v.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else v
    writer.writerow([safe(v) for v in headers]); writer.writerows([[safe(v) for v in row] for row in rows])
    return stream.getvalue()


def document_styles(spec):
    if spec['workKind'] == 'document-cleanup':
        return [style for section in spec['sections'] for style in ['Heading 1', *['Normal']*len(section['blockIds'])]]
    return [style for _ in spec['templates'] for style in ['Heading 1', 'Normal', 'Normal', 'Normal', 'Normal']] + ['Normal']*(1+len(spec['checklist']))


def changes(spec):
    return {'sourceBlocks': spec.get('sourceBlocks', []), 'sections': spec.get('sections', []), 'textRewritten': False}


def text_package(spec, reference, paragraphs, headers, rows):
    files = {}
    if paragraphs:
        files['delivery.md'] = '\n\n'.join(paragraphs)+'\n'
        files['changes.json'] = json.dumps(changes(spec), ensure_ascii=False, indent=2)
    else:
        files['delivery.csv'] = csv_text(headers, rows)
    if spec['workKind'] == 'xlsx-automation':
        files['automation.py'] = Path(__file__).read_text(encoding='utf-8')
        recipe = {k: v for k, v in spec.items() if k != 'workbooks'}
        recipe['inputNames'] = [w['name'] for w in spec['workbooks']]
        files['recipe.json'] = canonical(recipe).decode('utf-8')
        files['reference.json'] = canonical(reference).decode('utf-8')
        files['run.bat'] = '@echo off\r\ncd /d "%~dp0"\r\npython -I automation.py --transform recipe.json reference.json inputs result\r\nexit /b %errorlevel%\r\n'
    if spec['workKind'] == 'research-report':
        files['summary.md'] = spec['summary']+'\n'
    kind = spec['workKind']
    common = ('# Lokales uGig-Paket: '+kind+'\n\n'
        'Nur fuer den vereinbarten Auftrag und nach Kundenfreigabe. Keine Uploadfunktion.\n'
        'Vertrauliche Dateien bleiben gesperrt. Oeffentliche Lieferung braucht die separate Freigabe des fertigen Pakets.\n'
        'technical-report.json dokumentiert technische Referenzpruefungen, keine unabhaengige Fachabnahme.\n')
    if kind in ('document-cleanup', 'support-templates'):
        detail = ('delivery.docx in einem DOCX-Leseprogramm oeffnen; delivery.md ist die Textansicht.\n'
            'changes.json enthaelt die Quellblock-/Abschnittszuordnung, soweit im Profil vorhanden.\n'
            'Vor Abnahme Inhalt, Umlaute, Ueberschriften und Seitenumbrueche pruefen.\n')
        detail += ('Dokumentbereinigung: Originalinhalte, Reihenfolge und Aenderungszuordnung vergleichen.\n' if kind == 'document-cleanup'
            else 'Supportvorlagen: Richtlinien, Platzhalter, Eskalationen und unerlaubte Zusagen fachlich pruefen.\n')
    else:
        detail = ('delivery.xlsx mit einem XLSX-Leseprogramm oeffnen; delivery.csv ist der Tabellenexport.\n'
            'CSV schuetzt formelaehnliche Zeichenfolgen mit einem fuehrenden Apostroph; XLSX speichert sie als Text.\n')
        if kind == 'research-report':
            detail += ('summary.md enthaelt die Zusammenfassung. Quellenlinks sind Textwerte, keine verifizierten Belege.\n'
                'Aussagen, Stichtag, Abdeckung und Nutzungsrechte unabhaengig pruefen.\n')
    if kind == 'xlsx-automation':
        detail += (
        'Laufzeit: Python 3.11-3.13; python-docx==1.2.0, openpyxl==3.1.5. Keine automatische Installation.\n'
        'Pruefen: python -I automation.py --check-runtime. Referenztest: run.bat.\n'
        'Neue Daten: python -I automation.py --process recipe.json reference.json inputs result consent.json\n'
        'consent.json: privacy=public, customerApproved=true, inputs=[{name,sha256}] fuer aktuelle Originaldateien.\n'
        'Neue Daten werden nach Schema/Regeln geprueft; keine unabhaengige Fachabnahme.\n'
        'leeres Verzeichnis result erstellen, dann run.bat ausfuehren. Nur trim/lowercase; keine Formelauswertung.\n')
    files['README.md'] = common + detail
    return files


def technical_report(spec, reference, files):
    return {'schema': 'numaron-office-technical-v1', 'technicalPassed': True, 'independentlyVerified': False,
            'validationMode': 'schema-and-rules' if reference.get('validationMode') == 'schema-and-rules' else 'fixed-reference',
            'workKind': spec['workKind'], 'inputDigest': sha(canonical(spec)), 'referenceDigest': sha(canonical(reference)),
            'pendingReviews': PENDING[spec['workKind']] + ['binary-content-and-privacy', 'binary-provenance'],
            'files': files}


def mixed_text_bytes(files):
    # Same UTF-8 JSON representation counted by validMixedTextFiles in Node.
    return len(canonical([{'path': name, 'content': content} for name, content in sorted(files.items())]))


def preflight_text_package(spec, reference, paragraphs, headers, rows, originals):
    files = text_package(spec, reference, paragraphs, headers, rows)
    entries = [{'name': name, 'sha256': sha(content.encode('utf-8')), 'size': len(content.encode('utf-8'))}
               for name, content in sorted(files.items())]
    # Upper bound for the one binary file; the Node adapter still enforces it.
    entries.append({'name': 'delivery.docx' if paragraphs else 'delivery.xlsx', 'sha256': '0'*64, 'size': 10*1024*1024})
    report = technical_report(spec, reference, sorted(entries, key=lambda f: f['name']))
    report['originals'] = originals
    reserved = {**files, 'technical-report.json': canonical(report).decode('utf-8')}
    require(mixed_text_bytes(reserved) <= 96000, 'mixed text package limit')
    return files


def build(spec, reference, output):
    runtime_check()
    paragraphs, headers, rows, originals = planned(spec, reference)
    output = Path(output); require(output.is_dir() and not output.is_symlink() and not any(output.iterdir()), 'empty output directory required')
    texts = preflight_text_package(spec, reference, paragraphs, headers, rows, originals)
    if paragraphs:
        doc = Document(); style = doc.styles['Normal']; style.font.name = 'Calibri'; style.font.size = Pt(11)
        doc.sections[0].left_margin = Inches(.8); doc.sections[0].right_margin = Inches(.8)
        for p, style_name in zip(paragraphs, document_styles(spec)):
            doc.add_paragraph(p, style=style_name)
        doc.core_properties.author = ''; doc.core_properties.last_modified_by = ''
        doc.save(output/'delivery.docx')
    else:
        book = Workbook(); sheet = book.active; sheet.title = 'Ergebnis'
        for row in [headers, *rows]:
            sheet.append(row)
            for c in sheet[sheet.max_row]:
                if isinstance(c.value, str): c.data_type = 's'
        for c in sheet[1]: c.font = Font(bold=True)
        sheet.freeze_panes = 'A2'; sheet.auto_filter.ref = sheet.dimensions
        book.save(output/'delivery.xlsx')
    for name, content in texts.items():
        (output/name).write_bytes(content.encode('utf-8'))
    report = inspect_package(spec, reference, output)
    report['originals'] = originals
    (output/'technical-report.json').write_bytes(canonical(report))
    return report


def inspect_package(spec, reference, output):
    paragraphs, headers, rows, originals = planned(spec, reference); output = Path(output)
    if paragraphs:
        data = (output/'delivery.docx').read_bytes(); check_office(data)
        doc = Document(io.BytesIO(data))
        require([p.text for p in doc.paragraphs] == paragraphs, 'DOCX readback mismatch')
        require([p.style.name for p in doc.paragraphs] == document_styles(spec), 'DOCX heading mismatch')
        require(json.loads((output/'changes.json').read_text(encoding='utf-8')) == changes(spec), 'change report mismatch')
        require((output/'delivery.md').read_text(encoding='utf-8') == '\n\n'.join(paragraphs)+'\n', 'Markdown mismatch')
    else:
        data = (output/'delivery.xlsx').read_bytes(); check_office(data)
        w = load_workbook(io.BytesIO(data), data_only=False)
        try:
            require(len(w.worksheets) == 1 and all(c.data_type != 'f' for row in w.active for c in row), 'unexpected formula/sheet')
            actual = [list(row) for row in w.active.values]
            require(canonical(actual) == canonical([headers, *rows]), 'XLSX typed readback mismatch')
        finally: w.close()
        require((output/'delivery.csv').read_text(encoding='utf-8') == csv_text(headers, rows), 'CSV reference mismatch')
        if spec['workKind'] == 'research-report':
            require((output/'summary.md').read_text(encoding='utf-8') == reference['summary']+'\n', 'summary readback mismatch')
    return technical_report(spec, reference, [{'name': p.name, 'sha256': sha(p.read_bytes()), 'size': p.stat().st_size}
                      for p in sorted(output.iterdir()) if p.name != 'technical-report.json'])


def main():
    args = sys.argv[1:]
    runtime_check()
    if args == ['--check-runtime']:
        print(json.dumps(runtime_check())); return
    process = bool(args and args[0] == '--process')
    if args and args[0] in ('--transform', '--process'):
        require(len(args) == (6 if process else 5), 'ungueltige Argumente')
        _, recipe_path, reference_path, inputs, output = args[:5]
        require(Path(recipe_path).stat().st_size <= 96000, 'recipe size')
        spec = json.loads(Path(recipe_path).read_text(encoding='utf-8'))
        spec['workbooks'] = []
        names = spec.pop('inputNames', None)
        require(isinstance(names, list) and 1 <= len(names) <= 3 and
                all(isinstance(name, str) for name in names) and len({name.lower() for name in names}) == len(names), 'input names')
        for name in names:
            require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*\.xlsx', name), 'input filename')
            p = Path(inputs)/name; require(not p.is_symlink() and p.stat().st_size <= 10*1024*1024, 'input file')
            spec['workbooks'].append({'name': name, 'data': base64.b64encode(p.read_bytes()).decode()})
    else:
        spec_path, reference_path, output = args
        require(Path(spec_path).stat().st_size <= 42*1024*1024, 'spec size')
        spec = json.loads(Path(spec_path).read_text(encoding='utf-8'))
    require(Path(reference_path).stat().st_size <= 16*1024*1024, 'reference size')
    reference = json.loads(Path(reference_path).read_text(encoding='utf-8'))
    if process:
        require(Path(args[5]).stat().st_size <= 96000, 'consent size')
        reference = reusable_reference(spec, reference, json.loads(Path(args[5]).read_text(encoding='utf-8')))
    report = build(spec, reference, Path(output))
    print(json.dumps({'technicalPassed': report['technicalPassed'], 'independentlyVerified': False}))


if __name__ == '__main__': main()
