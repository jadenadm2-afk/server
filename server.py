"""
=================================================
  نظام الزاجل الأكاديمي - سيرفر الاستبيان
  Backend for: Survey of Pastoral Resource
  Governance - Zalingei Locality
  Python 3 stdlib ONLY - no pip needed
=================================================
"""
import http.server
import socketserver
import json
import os
import re
import random
import string
from urllib.parse import urlparse
from datetime import datetime

PORT = 3001
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_FILE  = os.path.join(BASE_DIR, 'responses.json')
STATIC_DIR = BASE_DIR   # serve survey.html and dashboard.html from same dir

# ─── DB Helpers ──────────────────────────────────────────────────────────────
def read_db():
    if not os.path.isfile(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return []

def write_db(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def gen_id():
    ts  = int(datetime.utcnow().timestamp() * 1000)
    rnd = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"resp_{ts}_{rnd}"

# ─── Stats Engine ─────────────────────────────────────────────────────────────
def compute_stats(responses):
    if not responses:
        return {
            'total': 0,
            'demographics': {},
            'governance': {},
            'conflict': {},
            'native_admin': {},
            'state_role': {},
            'timeline': []
        }

    # ── Demographics ──────────────────────────────────────────────────────────
    profession_counts = {}
    age_counts        = {}
    education_counts  = {}
    admin_units       = {}

    for r in responses:
        for key, counter in [
            ('profession',  profession_counts),
            ('age',         age_counts),
            ('education',   education_counts),
            ('admin_unit',  admin_units),
        ]:
            val = r.get(key, 'غير محدد') or 'غير محدد'
            counter[val] = counter.get(val, 0) + 1

    # ── Likert aggregation helper ─────────────────────────────────────────────
    def likert_tally(prefix, n, responses):
        results = {}
        for i in range(1, n + 1):
            name = f"{prefix}_{i}"
            counts = {}
            for r in responses:
                val = r.get(name)
                if val:
                    counts[val] = counts.get(val, 0) + 1
            results[name] = counts
        return results

    # ── Governance (gov_1..10) ────────────────────────────────────────────────
    governance    = likert_tally('gov',   10, responses)
    conflict      = likert_tally('conf',  5,  responses)
    native_admin  = likert_tally('ahli',  5,  responses)
    state_role    = likert_tally('state', 10, responses)

    # ── Positive-response rates per axis ─────────────────────────────────────
    def positive_rate(tally, positive_values):
        total_answered = 0
        total_positive = 0
        for q, counts in tally.items():
            for val, cnt in counts.items():
                total_answered += cnt
                if val in positive_values:
                    total_positive += cnt
        if total_answered == 0:
            return 0.0
        return round(total_positive / total_answered * 100, 1)

    # ── Daily timeline ────────────────────────────────────────────────────────
    daily = {}
    for r in responses:
        day = (r.get('submitted_at') or '')[:10]
        if day:
            daily[day] = daily.get(day, 0) + 1
    timeline = [{'date': d, 'count': c} for d, c in sorted(daily.items())][-30:]

    return {
        'total': len(responses),
        'demographics': {
            'profession': profession_counts,
            'age':        age_counts,
            'education':  education_counts,
            'admin_unit': admin_units,
        },
        'governance':   governance,
        'conflict':     conflict,
        'native_admin': native_admin,
        'state_role':   state_role,
        'axis_rates': {
            'governance_approval':   positive_rate(governance,   ['موافق جداً', 'موافق']),
            'conflict_agree':        positive_rate(conflict,     ['موافق بشدة', 'موافق']),
            'native_admin_high':     positive_rate(native_admin, ['بدرجة كبيرة']),
            'state_satisfaction':    positive_rate(state_role,   ['راضٍ تماماً', 'راضٍ جزئياً']),
        },
        'timeline': timeline,
    }

# ─── HTTP Handler ─────────────────────────────────────────────────────────────
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {fmt % args}")

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_static(self, rel_path):
        full = os.path.normpath(os.path.join(STATIC_DIR, rel_path.lstrip('/')))
        # security: must stay within STATIC_DIR
        if not full.startswith(STATIC_DIR):
            self.send_error(403); return
        if not os.path.isfile(full):
            self.send_error(404); return
        ext  = os.path.splitext(full)[1].lower()
        mime = {'.html':'text/html;charset=utf-8', '.css':'text/css',
                '.js':'application/javascript', '.json':'application/json',
                '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png'}
        with open(full, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', mime.get(ext, 'application/octet-stream'))
        self.send_header('Content-Length', str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode('utf-8')
        return json.loads(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    # ── GET ──────────────────────────────────────────────────────────────────
    def do_GET(self):
        path = urlparse(self.path).path

        if path == '/api/responses':
            self.send_json(read_db())

        elif path == '/api/stats':
            self.send_json(compute_stats(read_db()))

        elif path in ('/', '/index.html'):
            self.send_static('index.html')

        elif path == '/survey.html':
            self.send_static('survey.html')

        elif path == '/dashboard.html':
            self.send_static('dashboard.html')

        else:
            self.send_static(path)

    # ── POST ─────────────────────────────────────────────────────────────────
    def do_POST(self):
        path = urlparse(self.path).path

        if path == '/api/responses':
            body = self.read_body()
            if not isinstance(body, dict):
                self.send_json({'error': 'يجب إرسال كائن JSON'}, 400)
                return
            responses = read_db()
            new_resp  = {
                'id':           gen_id(),
                'submitted_at': datetime.utcnow().isoformat() + 'Z',
                **body
            }
            responses.append(new_resp)
            write_db(responses)
            self.send_json({'success': True, 'id': new_resp['id']}, 201)

        else:
            self.send_error(404)

    # ── DELETE ────────────────────────────────────────────────────────────────
    def do_DELETE(self):
        m = re.match(r'^/api/responses/(.+)$', urlparse(self.path).path)
        if not m:
            self.send_error(404); return
        rid = m.group(1)
        responses = read_db()
        idx = next((i for i, r in enumerate(responses) if r.get('id') == rid), -1)
        if idx == -1:
            self.send_json({'error': 'الاستجابة غير موجودة'}, 404); return
        deleted = responses.pop(idx)
        write_db(responses)
        self.send_json(deleted)

# ─── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == '__main__':
    if not os.path.isfile(DATA_FILE):
        write_db([])

    print(f"\n{'='*58}")
    print(f"  ✅  سيرفر استبيان زالنجي الأكاديمي — المنفذ {PORT}")
    print(f"{'='*58}")
    print(f"  📋  الاستبيان : http://localhost:{PORT}/survey.html")
    print(f"  📊  الداشبورد : http://localhost:{PORT}/dashboard.html")
    print(f"  🗄️   البيانات  : {DATA_FILE}")
    print(f"{'='*58}")
    print("  اضغط Ctrl+C لإيقاف السيرفر\n")

    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        httpd.allow_reuse_address = True
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n⛔ تم إيقاف السيرفر.")
