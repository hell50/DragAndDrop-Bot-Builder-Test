from flask import Flask, render_template, request, send_file, jsonify
from io import BytesIO
import json
import webapp.nodes as nodes_mod

app = Flask(__name__, static_folder='static', template_folder='templates')

@app.route('/')
def index():
    # Provide node definitions to the template
    return render_template('index.html', node_types=json.dumps(nodes_mod.NODE_TYPES))

@app.route('/export', methods=['POST'])
def export():
    payload = request.get_json()
    if not payload:
        return jsonify({'error': 'missing payload'}), 400
    nodes = {n['id']: n for n in payload.get('nodes', [])}
    connections = payload.get('connections', [])
    code = nodes_mod.export_code(nodes, connections)
    # Return as file
    buf = BytesIO()
    buf.write(code.encode('utf-8'))
    buf.seek(0)
    return send_file(buf, as_attachment=True, download_name='exported_bot.py', mimetype='text/x-python')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
