from flask import Flask, request, jsonify, Response
import csv, io, re

app = Flask(__name__)

# simple demo: free endpoint + paid placeholder (x402 integration not implemented yet)

def parse_receipt(text: str):
    items = []
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    for line in lines:
        m = re.match(r"^(.*?)(\s+)(\d+(?:\.\d{1,2})?)$", line)
        if m:
            name = m.group(1)
            price = m.group(3)
            items.append({"name": name, "price": price})
    return items

@app.post('/free/sample')
def free_sample():
    data = request.get_json(force=True)
    text = data.get('text','')
    items = parse_receipt(text)
    return jsonify({"items": items})

@app.post('/convert/csv')
def convert_csv():
    data = request.get_json(force=True)
    text = data.get('text','')
    items = parse_receipt(text)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=['name','price'])
    writer.writeheader()
    for it in items:
        writer.writerow(it)
    return Response(output.getvalue(), mimetype='text/csv')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
