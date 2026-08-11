/**
 * ══════════════════════════════════════════════════════════════
 *  سيرفر استبيان زالنجي الأكاديمي
 *  Academic Survey REST API
 *  حوكمة الموارد الرعوية وفض النزاعات — محلية زالنجي
 *
 *  Deploy: Railway (railway.com)
 *  Repo:   github.com/jadenadm2-afk/server
 * ══════════════════════════════════════════════════════════════
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Storage ──────────────────────────────────────────────────────────────────
// Railway: /tmp is writable. For persistence use Railway Volumes or external DB.
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'responses.json');

if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');

function readDB()  {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
    catch { return []; }
}
function writeDB(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
function genId() {
    return `resp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// ─── Statistics Engine ────────────────────────────────────────────────────────
function computeStats(responses) {
    if (!responses.length) {
        return {
            total: 0,
            demographics: { profession:{}, age:{}, education:{}, admin_unit:{} },
            governance:{}, conflict:{}, native_admin:{}, state_role:{},
            axis_rates: { governance_approval:0, conflict_agree:0, native_admin_high:0, state_satisfaction:0 },
            timeline:[]
        };
    }

    const countField = field => {
        const map = {};
        responses.forEach(r => { const v = r[field]||'غير محدد'; map[v]=(map[v]||0)+1; });
        return map;
    };

    const likertTally = (prefix, n) => {
        const res = {};
        for (let i = 1; i <= n; i++) {
            const key = `${prefix}_${i}`, counts = {};
            responses.forEach(r => { const v=r[key]; if(v) counts[v]=(counts[v]||0)+1; });
            res[key] = counts;
        }
        return res;
    };

    const positiveRate = (tally, posVals) => {
        let tot=0, pos=0;
        Object.values(tally).forEach(c =>
            Object.entries(c).forEach(([v,n]) => { tot+=n; if(posVals.includes(v)) pos+=n; })
        );
        return tot===0 ? 0 : Math.round(pos/tot*1000)/10;
    };

    const governance   = likertTally('gov',   4);
    const conflict     = likertTally('conf',  4);
    const native_admin = likertTally('ahli',  4);
    const state_role   = likertTally('state', 4);

    const daily = {};
    responses.forEach(r => {
        const d = (r.submitted_at||'').slice(0,10);
        if(d) daily[d]=(daily[d]||0)+1;
    });
    const timeline = Object.entries(daily)
        .sort((a,b)=>a[0].localeCompare(b[0])).slice(-30)
        .map(([date,count])=>({date,count}));

    return {
        total: responses.length,
        demographics: {
            profession: countField('profession'),
            age:        countField('age'),
            education:  countField('education'),
            admin_unit: countField('admin_unit'),
        },
        governance, conflict, native_admin, state_role,
        axis_rates: {
            governance_approval: positiveRate(governance,   ['موافق جداً','موافق']),
            conflict_agree:      positiveRate(conflict,     ['موافق بشدة','موافق']),
            native_admin_high:   positiveRate(native_admin, ['بدرجة كبيرة']),
            state_satisfaction:  positiveRate(state_role,   ['راضٍ تماماً','راضٍ جزئياً']),
        },
        timeline,
    };
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin:'*', methods:['GET','POST','DELETE','OPTIONS'], allowedHeaders:['Content-Type','X-Admin-Key'] }));
app.use(express.json({ limit:'1mb' }));

app.use((req,_,next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Root
app.get('/', (req,res) => res.json({
    status:  'online 🟢',
    service: 'Zalingei Academic Survey API',
    version: '1.0.0',
    routes: {
        'GET  /api/health':          'Health + total count',
        'GET  /api/responses':       'All responses (filter: ?profession=&age=&limit=)',
        'GET  /api/responses/:id':   'Single response',
        'POST /api/responses':       'Submit survey response',
        'DELETE /api/responses/:id': 'Delete single response',
        'DELETE /api/responses/all': 'Clear all (requires X-Admin-Key header)',
        'GET  /api/stats':           'Full statistics & charts data',
        'GET  /api/export':          'Download full data as JSON',
    },
    timestamp: new Date().toISOString(),
}));

// Health
app.get('/api/health', (req,res) => {
    const responses = readDB();
    res.json({ status:'healthy', total:responses.length, timestamp:new Date().toISOString() });
});

// GET all responses
app.get('/api/responses', (req,res) => {
    let list = readDB();
    const { profession, age, education, limit } = req.query;
    if (profession) list = list.filter(r => r.profession === profession);
    if (age)        list = list.filter(r => r.age === age);
    if (education)  list = list.filter(r => r.education === education);
    if (limit)      list = list.slice(-Math.abs(parseInt(limit)||50));
    res.json(list);
});

// GET single response
app.get('/api/responses/:id', (req,res) => {
    const found = readDB().find(r => r.id === req.params.id);
    if (!found) return res.status(404).json({ error:'الاستجابة غير موجودة' });
    res.json(found);
});

// POST — submit response
app.post('/api/responses', (req,res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || (!body.profession && !body.age)) {
        return res.status(400).json({ error:'بيانات ناقصة أو غير صالحة' });
    }

    const responses = readDB();
    const record = { id: genId(), submitted_at: new Date().toISOString(), ...body };
    responses.push(record);
    writeDB(responses);

    console.log(`✅ New response: ${record.id} | ${record.profession||'?'} | ${record.admin_unit||'?'}`);
    res.status(201).json({ success:true, id:record.id, message:'تم حفظ الاستجابة بنجاح' });
});

// DELETE — single
app.delete('/api/responses/all', (req,res) => {
    const adminKey = process.env.ADMIN_KEY;
    if (adminKey && req.headers['x-admin-key'] !== adminKey) {
        return res.status(403).json({ error:'غير مصرح — يجب تمرير X-Admin-Key صحيح' });
    }
    writeDB([]);
    res.json({ success:true, message:'تم مسح جميع الاستجابات' });
});

app.delete('/api/responses/:id', (req,res) => {
    const responses = readDB();
    const idx = responses.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error:'الاستجابة غير موجودة' });
    const deleted = responses.splice(idx,1)[0];
    writeDB(responses);
    res.json({ success:true, deleted });
});

// GET statistics
app.get('/api/stats', (req,res) => {
    res.json(computeStats(readDB()));
});

// GET export
app.get('/api/export', (req,res) => {
    const responses = readDB();
    const payload   = { exported_at: new Date().toISOString(), total: responses.length, stats: computeStats(responses), responses };
    res.setHeader('Content-Disposition', 'attachment; filename="zalingei_survey_export.json"');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(payload);
});

// 404
app.use((req,res) => res.status(404).json({ error:'المسار غير موجود', path:req.path }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '═'.repeat(52));
    console.log('  🌾  سيرفر استبيان زالنجي الأكاديمي  🌾');
    console.log('═'.repeat(52));
    console.log(`  🚀  PORT       : ${PORT}`);
    console.log(`  🗄️   DATA FILE  : ${DATA_FILE}`);
    console.log(`  📊  Stats      : /api/stats`);
    console.log(`  📝  Responses  : /api/responses`);
    console.log('═'.repeat(52) + '\n');
});

module.exports = app;
