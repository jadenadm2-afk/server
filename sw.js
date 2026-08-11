// ═══════════════════════════════════════════════════════════════
//  Service Worker — نظام الزاجل الأكاديمي
//  يعمل كـ "Backend في المتصفح":
//  يستقبل طلبات الـ API ويخزن البيانات في IndexedDB
//  لا يحتاج Node.js أو Python أو أي تثبيت
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'zalingei-survey-v1';
const DB_NAME    = 'zalingei_db';
const DB_VERSION = 1;
const STORE_NAME = 'responses';

// ─── IndexedDB Helpers ───────────────────────────────────────────────────────
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

function dbGetAll(db) {
    return new Promise((resolve, reject) => {
        const tx   = db.transaction(STORE_NAME, 'readonly');
        const req  = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

function dbPut(db, record) {
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(record);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

function dbDelete(db, id) {
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).delete(id);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

// ─── Stats Engine ─────────────────────────────────────────────────────────────
function computeStats(responses) {
    if (!responses.length) {
        return {
            total: 0,
            demographics: { profession:{}, age:{}, education:{}, admin_unit:{} },
            governance: {}, conflict: {}, native_admin: {}, state_role: {},
            axis_rates: { governance_approval:0, conflict_agree:0, native_admin_high:0, state_satisfaction:0 },
            timeline: []
        };
    }

    // Demographics
    const countField = (field) => {
        const map = {};
        responses.forEach(r => {
            const v = r[field] || 'غير محدد';
            map[v] = (map[v] || 0) + 1;
        });
        return map;
    };

    // Likert tally
    const likertTally = (prefix, n) => {
        const res = {};
        for (let i = 1; i <= n; i++) {
            const key = `${prefix}_${i}`;
            const counts = {};
            responses.forEach(r => {
                const val = r[key];
                if (val) counts[val] = (counts[val] || 0) + 1;
            });
            res[key] = counts;
        }
        return res;
    };

    // Positive rate
    const positiveRate = (tally, positiveVals) => {
        let tot = 0, pos = 0;
        Object.values(tally).forEach(counts => {
            Object.entries(counts).forEach(([val, cnt]) => {
                tot += cnt;
                if (positiveVals.includes(val)) pos += cnt;
            });
        });
        return tot === 0 ? 0 : Math.round(pos / tot * 100 * 10) / 10;
    };

    const governance   = likertTally('gov',   4);
    const conflict     = likertTally('conf',  4);
    const native_admin = likertTally('ahli',  4);
    const state_role   = likertTally('state', 4);

    // Timeline
    const daily = {};
    responses.forEach(r => {
        const day = (r.submitted_at || '').slice(0, 10);
        if (day) daily[day] = (daily[day] || 0) + 1;
    });
    const timeline = Object.entries(daily)
        .sort((a,b) => a[0].localeCompare(b[0]))
        .slice(-30)
        .map(([date, count]) => ({ date, count }));

    return {
        total: responses.length,
        demographics: {
            profession: countField('profession'),
            age:        countField('age'),
            education:  countField('education'),
            admin_unit: countField('admin_unit'),
        },
        governance,
        conflict,
        native_admin,
        state_role,
        axis_rates: {
            governance_approval:  positiveRate(governance,   ['موافق جداً', 'موافق']),
            conflict_agree:       positiveRate(conflict,     ['موافق بشدة', 'موافق']),
            native_admin_high:    positiveRate(native_admin, ['بدرجة كبيرة']),
            state_satisfaction:   positiveRate(state_role,   ['راضٍ تماماً', 'راضٍ جزئياً']),
        },
        timeline,
    };
}

// ─── Route Handler ────────────────────────────────────────────────────────────
async function handleAPI(request) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method.toUpperCase();

    const json = (data, status = 200) =>
        new Response(JSON.stringify(data, null, 2), {
            status,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
            }
        });

    const db = await openDB();

    // GET /api/responses
    if (method === 'GET' && path === '/api/responses') {
        const all = await dbGetAll(db);
        return json(all.sort((a,b) => (a.submitted_at||'').localeCompare(b.submitted_at||'')));
    }

    // GET /api/stats
    if (method === 'GET' && path === '/api/stats') {
        const all = await dbGetAll(db);
        return json(computeStats(all));
    }

    // POST /api/responses
    if (method === 'POST' && path === '/api/responses') {
        const body = await request.json();
        const id   = `resp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        const record = {
            id,
            submitted_at: new Date().toISOString(),
            ...body
        };
        await dbPut(db, record);
        return json({ success: true, id }, 201);
    }

    // DELETE /api/responses/:id
    const delMatch = path.match(/^\/api\/responses\/(.+)$/);
    if (method === 'DELETE' && delMatch) {
        await dbDelete(db, delMatch[1]);
        return json({ deleted: delMatch[1] });
    }

    // OPTIONS (CORS preflight)
    if (method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            }
        });
    }

    return json({ error: 'Not found' }, 404);
}

// ─── Service Worker Events ────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    // Intercept only /api/* paths
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleAPI(event.request));
    }
    // All other requests: normal network fetch
});
