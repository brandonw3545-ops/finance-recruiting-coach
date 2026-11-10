"""A stand-in for the Firebase Realtime Database REST API, for the Live Room tests.

It keeps one JSON tree in memory and speaks the parts the Live Room uses: GET, PUT, PATCH and
DELETE on /path.json, POST with ?x-http-method-override=, streaming (Accept: text/event-stream)
with put and patch events, lists handed back as arrays when their keys are 0, 1, 2, and rules
that only allow /rooms/<code> and below.
"""
import http.server
import json
import queue
import threading
import urllib.parse


def _is_list_like(d):
    if not isinstance(d, dict) or not d:
        return False
    try:
        keys = sorted(int(k) for k in d if str(int(k)) == k and int(k) >= 0)
    except ValueError:
        return False
    return len(keys) == len(d) and keys[0] == 0 and len(keys) * 2 > keys[-1]


def _out(v):
    """What a client reads back: objects keyed 0..n become arrays, the way the real database does it."""
    if isinstance(v, dict):
        if _is_list_like(v):
            n = max(int(k) for k in v) + 1
            return [_out(v[str(i)]) if str(i) in v else None for i in range(n)]
        return {k: _out(x) for k, x in v.items()}
    return v


def _norm(v):
    """What gets stored: arrays become objects, nulls and empty objects disappear."""
    if isinstance(v, list):
        v = {str(i): x for i, x in enumerate(v)}
    if isinstance(v, dict):
        d = {k: _norm(x) for k, x in v.items()}
        d = {k: x for k, x in d.items() if x is not None}
        return d or None
    return v


class Database:
    def __init__(self, deny=False):
        self.root, self.lock, self.listeners, self.deny, self.log = {}, threading.Lock(), [], deny, []

    def get(self, keys):
        d = self.root
        for k in keys:
            if not isinstance(d, dict) or k not in d:
                return None
            d = d[k]
        return d

    def _set(self, keys, val):
        val = _norm(val)
        if not keys:
            self.root = val or {}
            return
        chain, d = [], self.root
        for k in keys[:-1]:
            if not isinstance(d.get(k), dict):
                d[k] = {}
            chain.append((d, k))
            d = d[k]
        if val is None:
            d.pop(keys[-1], None)
        else:
            d[keys[-1]] = val
        for parent, k in reversed(chain):      # prune emptied branches
            if parent[k] == {}:
                del parent[k]

    def write(self, method, keys, body):
        with self.lock:
            if method == 'PATCH':
                for k, v in (body or {}).items():
                    self._set(keys + [x for x in k.split('/') if x], v)
            else:
                self._set(keys, None if method == 'DELETE' else body)
            for lkeys, q in list(self.listeners):
                if keys[:len(lkeys)] == lkeys:                      # at or below the listener
                    rel = '/' + '/'.join(keys[len(lkeys):])
                    q.put(('patch' if method == 'PATCH' else 'put', {'path': rel, 'data': body if method != 'DELETE' else None}))
                elif lkeys[:len(keys)] == keys:                      # above it: resend the listener's whole value
                    q.put(('put', {'path': '/', 'data': _out(self.get(lkeys))}))


def serve(db):
    class H(http.server.BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *a):
            pass

        def _cors(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, PUT, POST, PATCH, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Accept, Cache-Control')

        def _json(self, code, val):
            raw = json.dumps(val).encode()
            self.send_response(code)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def _keys(self):
            u = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(u.query)
            if not u.path.endswith('.json'):
                return None, qs
            return [urllib.parse.unquote(k) for k in u.path[:-5].split('/') if k], qs

        def _allowed(self, keys):
            return not db.deny and keys is not None and len(keys) >= 2 and keys[0] == 'rooms'

        def do_OPTIONS(self):
            self.send_response(200)
            self._cors()
            self.send_header('Content-Length', '0')
            self.end_headers()

        def do_GET(self):
            keys, _ = self._keys()
            if not self._allowed(keys):
                return self._json(401, {'error': 'Permission denied'})
            if 'text/event-stream' not in self.headers.get('Accept', ''):
                db.log.append(('GET', '/'.join(keys)))
                return self._json(200, _out(db.get(keys)))
            q = queue.Queue()
            with db.lock:
                first = _out(db.get(keys))
                db.listeners.append((keys, q))
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'close')
            self.end_headers()
            try:
                self.wfile.write(('event: put\ndata: ' + json.dumps({'path': '/', 'data': first}) + '\n\n').encode())
                self.wfile.flush()
                while True:
                    try:
                        ev, data = q.get(timeout=2)
                    except queue.Empty:
                        ev, data = 'keep-alive', None
                    self.wfile.write(('event: ' + ev + '\ndata: ' + json.dumps(data) + '\n\n').encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                with db.lock:
                    db.listeners[:] = [x for x in db.listeners if x[1] is not q]
                self.close_connection = True

        def _write(self, method):
            keys, qs = self._keys()
            method = (qs.get('x-http-method-override') or [method])[0].upper()
            n = int(self.headers.get('Content-Length') or 0)
            raw = self.rfile.read(n) if n else b''
            if not self._allowed(keys):
                return self._json(401, {'error': 'Permission denied'})
            try:
                body = json.loads(raw) if raw else None
            except ValueError:
                return self._json(400, {'error': 'Invalid data; couldn\'t parse JSON object.'})
            db.log.append((method, '/'.join(keys)))
            db.write(method, keys, body)
            self._json(200, body)

        def do_PUT(self):
            self._write('PUT')

        def do_PATCH(self):
            self._write('PATCH')

        def do_DELETE(self):
            self._write('DELETE')

        def do_POST(self):
            self._write('POST')

    class Server(http.server.ThreadingHTTPServer):
        daemon_threads = True

    httpd = Server(('127.0.0.1', 0), H)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, 'http://127.0.0.1:%d' % httpd.server_address[1]
