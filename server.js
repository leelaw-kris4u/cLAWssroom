const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabase } = require('./database.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Initialize database
let db;
try {
    db = getDatabase();
    console.log('Connected to Indian Legal Practice SQLite database.');
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS otp_verifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id INTEGER NOT NULL,
                phone TEXT NOT NULL,
                otp_code TEXT NOT NULL,
                channel TEXT NOT NULL,
                status TEXT DEFAULT 'Pending',
                expires_at TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
            );
        `);
    } catch (_) {}
} catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
}

// MIME types for static assets
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 10 * 1024 * 1024) { // 10MB limit
                reject(new Error('Body too large'));
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

function getOrCreateClientByPhone(db, digits, inputPhone, requestedName) {
    const clients = db.prepare('SELECT * FROM clients').all();
    let matchedClient = clients.find(cl => {
        const clDigits = (cl.phone || '').replace(/\D/g, '').slice(-10);
        return clDigits === digits;
    });

    if (!matchedClient) {
        const formattedPhone = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
        const clientName = (requestedName && requestedName.trim()) || `Client (+91 ${digits.slice(0, 5)} ${digits.slice(5)})`;
        const result = db.prepare(`
            INSERT INTO clients (name, phone, client_type, bci_conflict_check)
            VALUES (?, ?, 'Individual', 1)
        `).run(clientName, formattedPhone);
        matchedClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
    }
    return matchedClient;
}

const server = http.createServer(async (req, res) => {
    // Enable CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    // API Routes
    if (pathname.startsWith('/api/')) {
        try {
            // Stats
            if (pathname === '/api/stats' && req.method === 'GET') {
                const totalCases = db.prepare('SELECT COUNT(*) as c FROM cases').get().c;
                const activeCases = db.prepare("SELECT COUNT(*) as c FROM cases WHERE status NOT IN ('Disposed', 'Disposed / Decreed', 'Dismissed', 'Transferred')").get().c;
                const urgentCases = db.prepare("SELECT COUNT(*) as c FROM cases WHERE priority = 'Urgent'").get().c;
                const upcomingHearings = db.prepare("SELECT COUNT(*) as c FROM hearings WHERE hearing_date >= DATE('now')").get().c;
                const pendingTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status != 'Completed'").get().c;
                const totalClients = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
                
                const billingTotals = db.prepare(`
                    SELECT 
                        COALESCE(SUM(amount), 0) as total_billed,
                        COALESCE(SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE 0 END), 0) as pending_recovery
                    FROM fee_ledger
                `).get();

                const practiceAreas = db.prepare(`
                    SELECT practice_area, COUNT(*) as count 
                    FROM cases 
                    GROUP BY practice_area 
                    ORDER BY count DESC
                `).all();

                const caseTypes = db.prepare(`
                    SELECT case_type, COUNT(*) as count 
                    FROM cases 
                    GROUP BY case_type 
                    ORDER BY count DESC 
                    LIMIT 8
                `).all();

                return sendJson(res, 200, {
                    totalCases,
                    activeCases,
                    urgentCases,
                    upcomingHearings,
                    pendingTasks,
                    totalClients,
                    totalBilled: billingTotals.total_billed,
                    pendingRecovery: billingTotals.pending_recovery,
                    practiceAreas,
                    caseTypes
                });
            }

            // Cases list & create
            if (pathname === '/api/cases' && req.method === 'GET') {
                let sql = `
                    SELECT c.*, cl.name as client_name, cl.email as client_email, cl.phone as client_phone,
                           (SELECT COUNT(*) FROM hearings WHERE case_id = c.id AND hearing_date >= DATE('now')) as upcoming_hearings_count,
                           (SELECT COUNT(*) FROM tasks WHERE case_id = c.id AND status != 'Completed') as pending_tasks_count,
                           (SELECT COUNT(*) FROM pleadings_documents WHERE case_id = c.id) as documents_count
                    FROM cases c
                    LEFT JOIN clients cl ON c.client_id = cl.id
                    WHERE 1=1
                `;
                const params = [];

                if (query.status && query.status !== 'All') {
                    if (query.status === 'Active') {
                        sql += " AND c.status NOT IN ('Disposed', 'Disposed / Decreed', 'Dismissed', 'Transferred', 'Draft', 'Draft / Intake in Progress')";
                    } else if (query.status === 'Disposed') {
                        sql += " AND c.status IN ('Disposed', 'Disposed / Decreed', 'Dismissed', 'Transferred')";
                    } else if (query.status === 'Draft') {
                        sql += " AND (c.status = 'Draft' OR c.status LIKE 'Draft%')";
                    } else {
                        sql += ' AND c.status = ?';
                        params.push(query.status);
                    }
                }
                if (query.practice_area && query.practice_area !== 'All') {
                    sql += ' AND c.practice_area = ?';
                    params.push(query.practice_area);
                }
                if (query.case_type && query.case_type !== 'All') {
                    sql += ' AND c.case_type = ?';
                    params.push(query.case_type);
                }
                if (query.priority && query.priority !== 'All') {
                    sql += ' AND c.priority = ?';
                    params.push(query.priority);
                }
                if (query.q) {
                    sql += ` AND (
                        c.title LIKE ? OR 
                        c.cino LIKE ? OR 
                        c.case_number LIKE ? OR 
                        c.petitioner LIKE ? OR 
                        c.respondent LIKE ? OR 
                        c.court_name LIKE ? OR 
                        c.bench_designation LIKE ? OR 
                        c.advocate_brief LIKE ? OR 
                        cl.name LIKE ?
                    )`;
                    const p = `%${query.q}%`;
                    params.push(p, p, p, p, p, p, p, p, p);
                }

                sql += " ORDER BY CASE c.priority WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2 WHEN 'Regular' THEN 3 ELSE 4 END, c.id DESC";

                // Optional pagination limit
                if (query.limit) {
                    sql += ' LIMIT ?';
                    params.push(Number(query.limit));
                }

                const cases = db.prepare(sql).all(...params);
                return sendJson(res, 200, cases);
            }

            if (pathname === '/api/cases' && req.method === 'POST') {
                const b = await parseJsonBody(req);
                if (!b.case_number || !b.title) {
                    return sendJson(res, 400, { error: 'Case Number and Title are required' });
                }

                const stmt = db.prepare(`
                    INSERT INTO cases (
                        cino, case_type, case_number, title, petitioner, respondent, client_id,
                        practice_area, status, stage_purpose, priority, court_name, bench_designation,
                        court_item_no, state_name, district_name, advocate_brief, opposite_advocate,
                        vakalatnama_status, fee_type, fee_due, appearance_fee, fee_received, limitation_date,
                        date_next_list, date_last_list, disposition_name, summary, advocate_notes
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                const result = stmt.run(
                    b.cino || `TSIN${Date.now().toString().slice(-12)}`,
                    b.case_type || 'OS',
                    b.case_number,
                    b.title,
                    b.petitioner || b.title.split('v.')[0] || 'Petitioner',
                    b.respondent || b.title.split('v.')[1] || 'Respondent',
                    b.client_id ? Number(b.client_id) : null,
                    b.practice_area || 'General Litigation Practice',
                    b.status || 'Active Matter',
                    b.stage_purpose || 'Notice & Summons Stage',
                    b.priority || 'Regular',
                    b.court_name || 'City Civil Court',
                    b.bench_designation || 'Hon\'ble Presiding Judge',
                    b.court_item_no || '',
                    b.state_name || 'Telangana',
                    b.district_name || 'Rangareddy',
                    b.advocate_brief || 'A. LEELA KRISHNA (BA. LLB.) Advocate',
                    b.opposite_advocate || '',
                    b.vakalatnama_status || 'Vakalatnama Filed',
                    b.fee_type || 'Per Appearance / Stage-wise',
                    (b.fee_due === 'Yes' || b.fee_due === 'yes' || b.fee_due === true) ? 'Yes' : 'No',
                    Number(b.appearance_fee) || 15000,
                    Number(b.fee_received) || 0,
                    b.limitation_date || null,
                    b.date_next_list || null,
                    b.date_last_list || null,
                    b.disposition_name || null,
                    b.summary || '',
                    b.advocate_notes || ''
                );

                const newCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(result.lastInsertRowid);
                return sendJson(res, 201, newCase);
            }

            // Single Case Details (with associated clients, hearings, tasks, pleadings, ledger, diary)
            const caseIdMatch = pathname.match(/^\/api\/cases\/(\d+)$/);
            if (caseIdMatch) {
                const caseId = Number(caseIdMatch[1]);

                if (req.method === 'GET') {
                    const c = db.prepare(`
                        SELECT c.*, cl.name as client_name, cl.email as client_email, cl.phone as client_phone, cl.client_type, cl.address as client_address
                        FROM cases c
                        LEFT JOIN clients cl ON c.client_id = cl.id
                        WHERE c.id = ?
                    `).get(caseId);

                    if (!c) {
                        return sendJson(res, 404, { error: 'Case not found' });
                    }

                    const hearings = db.prepare('SELECT * FROM hearings WHERE case_id = ? ORDER BY hearing_date ASC').all(caseId);
                    const tasks = db.prepare('SELECT * FROM tasks WHERE case_id = ? ORDER BY due_date ASC').all(caseId);
                    const documents = db.prepare('SELECT * FROM pleadings_documents WHERE case_id = ? ORDER BY id DESC').all(caseId);
                    const billing = db.prepare('SELECT * FROM fee_ledger WHERE case_id = ? ORDER BY date DESC').all(caseId);
                    const notes = db.prepare('SELECT * FROM case_diary WHERE case_id = ? ORDER BY id DESC').all(caseId);

                    return sendJson(res, 200, {
                        ...c,
                        hearings,
                        tasks,
                        documents,
                        billing,
                        notes
                    });
                }

                if (req.method === 'PUT') {
                    const b = await parseJsonBody(req);
                    const stmt = db.prepare(`
                        UPDATE cases SET
                            cino = ?,
                            case_type = ?,
                            case_number = ?,
                            title = ?,
                            petitioner = ?,
                            respondent = ?,
                            client_id = ?,
                            practice_area = ?,
                            status = ?,
                            stage_purpose = ?,
                            priority = ?,
                            court_name = ?,
                            bench_designation = ?,
                            court_item_no = ?,
                            state_name = ?,
                            district_name = ?,
                            advocate_brief = ?,
                            opposite_advocate = ?,
                            vakalatnama_status = ?,
                            fee_type = ?,
                            fee_due = ?,
                            appearance_fee = ?,
                            fee_received = ?,
                            limitation_date = ?,
                            date_next_list = ?,
                            summary = ?,
                            advocate_notes = ?
                        WHERE id = ?
                    `);

                    stmt.run(
                        b.cino,
                        b.case_type,
                        b.case_number,
                        b.title,
                        b.petitioner,
                        b.respondent,
                        b.client_id ? Number(b.client_id) : null,
                        b.practice_area,
                        b.status,
                        b.stage_purpose,
                        b.priority,
                        b.court_name,
                        b.bench_designation,
                        b.court_item_no,
                        b.state_name,
                        b.district_name,
                        b.advocate_brief,
                        b.opposite_advocate,
                        b.vakalatnama_status,
                        b.fee_type,
                        (b.fee_due === 'Yes' || b.fee_due === 'yes' || b.fee_due === true) ? 'Yes' : 'No',
                        Number(b.appearance_fee) || 0,
                        Number(b.fee_received) || 0,
                        b.limitation_date,
                        b.date_next_list,
                        b.summary,
                        b.advocate_notes,
                        caseId
                    );

                    const updatedCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
                    return sendJson(res, 200, updatedCase);
                }

                if (req.method === 'DELETE') {
                    db.prepare('DELETE FROM cases WHERE id = ?').run(caseId);
                    return sendJson(res, 200, { success: true, message: 'Case removed from chambers docket' });
                }
            }

            // Quick Toggle Fee Due Status for Case
            const feeDueMatch = pathname.match(/^\/api\/cases\/(\d+)\/fee-due$/);
            if (feeDueMatch && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
                const caseId = Number(feeDueMatch[1]);
                const b = await parseJsonBody(req);
                const nextVal = (b.fee_due === 'Yes' || b.fee_due === true) ? 'Yes' : 'No';
                db.prepare('UPDATE cases SET fee_due = ? WHERE id = ?').run(nextVal, caseId);
                const updatedCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
                return sendJson(res, 200, updatedCase);
            }

            // Update Business of the Day & Trigger Instant WhatsApp Push
            const updateBusinessMatch = pathname.match(/^\/api\/cases\/(\d+)\/update-business$/);
            if (updateBusinessMatch && req.method === 'POST') {
                const caseId = Number(updateBusinessMatch[1]);
                const b = await parseJsonBody(req);

                const c = db.prepare(`
                    SELECT c.*, cl.name as client_name, cl.phone as client_phone
                    FROM cases c
                    LEFT JOIN clients cl ON c.client_id = cl.id
                    WHERE c.id = ?
                `).get(caseId);

                if (!c) {
                    return sendJson(res, 404, { error: 'Case not found' });
                }

                const businessText = (b.business_of_the_day || '').trim();
                const ndoh = b.date_next_list || c.date_next_list;
                const nextStage = b.stage_purpose || c.stage_purpose;
                const itemNo = b.court_item_no || c.court_item_no;
                const updateTimestamp = new Date().toISOString();

                // Update case
                db.prepare(`
                    UPDATE cases SET
                        business_of_the_day = ?,
                        last_business_update = ?,
                        date_next_list = ?,
                        stage_purpose = ?,
                        court_item_no = ?
                    WHERE id = ?
                `).run(businessText, updateTimestamp, ndoh, nextStage, itemNo, caseId);

                // Add to case_diary for permanent court order tracking
                if (businessText) {
                    db.prepare(`
                        INSERT INTO case_diary (case_id, author, diary_category, entry)
                        VALUES (?, ?, ?, ?)
                    `).run(caseId, c.advocate_brief || 'A. LEELA KRISHNA (BA. LLB.) Advocate', 'Court Proceeding / Daily Order', `[Business of Day]: ${businessText} | NDOH: ${ndoh || 'TBD'}`);
                }

                // If NDOH updated, insert or update hearing entry
                if (ndoh) {
                    db.prepare(`
                        INSERT INTO hearings (case_id, hearing_title, hearing_type, hearing_date, hearing_time, court_room, item_no, bench, advocate, board_stage, daily_orders, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        caseId,
                        `${c.case_number} - ${nextStage || 'Hearing'}`,
                        nextStage || 'Hearing on Board',
                        ndoh,
                        '10:30 AM',
                        c.court_name || 'Court Hall',
                        itemNo || 'Item TBD',
                        c.bench_designation || 'Hon\'ble Presiding Judge',
                        c.advocate_brief || 'A. LEELA KRISHNA (BA. LLB.) Advocate',
                        'Daily Cause List',
                        businessText,
                        'Scheduled'
                    );
                }

                // Push WhatsApp Alert
                let whatsappPayload = null;
                const clientPhone = c.client_phone;
                const clientName = c.client_name || 'Client';

                if (b.send_whatsapp !== false && clientPhone) {
                    const cleanPhone = clientPhone.replace(/\D/g, '');
                    const fullIndianPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

                    const waMsg = `⚖️ *OFFICE OF THE cLAWssroom*\n*A. LEELA KRISHNA (BA. LLB.) Advocate*\n*Telangana State High Court and Supreme Court of India*\n*DAILY COURT ORDER & CASE UPDATE*\n\nDear *${clientName}*,\nYour case was taken up before the Hon'ble Court today.\n\n📁 *Case:* ${c.case_number}\n🏛️ *Court:* ${c.court_name || 'City Civil Court'}\n📋 *CNR:* ${c.cino || 'Registered'}\n\n📌 *Business of the Day:*\n${businessText || 'Proceedings conducted on board.'}\n\n📅 *Next Hearing (NDOH):* ${ndoh || 'Date to be notified'}\n⚖️ *Next Stage / Purpose:* ${nextStage || 'Regular Hearing'}\n\n_Chambers: Plot No. 94/95, AVR Signature, Toroor, Hayathnagar, Ranga Reddy Dist-501505_\n_WhatsApp: +91-9493489498 | Cell: +91-8121578785 | Email: leela.kris4u@gmail.com_`;
                    
                    const waLink = `https://wa.me/${fullIndianPhone}?text=${encodeURIComponent(waMsg)}`;
                    const waUrl = `https://api.whatsapp.com/send?phone=${fullIndianPhone}&text=${encodeURIComponent(waMsg)}`;

                    // Save to whatsapp_logs table
                    db.prepare(`
                        INSERT INTO whatsapp_logs (case_id, client_id, client_name, phone, message_text, status, whatsapp_url, sent_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(caseId, c.client_id, clientName, clientPhone, waMsg, 'Delivered', waLink, updateTimestamp);

                    whatsappPayload = {
                        sent: true,
                        phone: clientPhone,
                        client_name: clientName,
                        message: waMsg,
                        wa_link: waLink,
                        whatsapp_url: waUrl,
                        sent_at: updateTimestamp
                    };
                }

                const updatedCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
                return sendJson(res, 200, {
                    success: true,
                    message: 'Business of the day updated and WhatsApp alert dispatched instantly!',
                    case: updatedCase,
                    whatsapp: whatsappPayload
                });
            }

            // Client Portal: Request OTP (WhatsApp or SMS)
            if (pathname === '/api/client/request-otp' && req.method === 'POST') {
                const b = await parseJsonBody(req);
                const inputPhone = (b.phone || '').trim();
                const channel = (b.channel || 'WhatsApp').toLowerCase() === 'sms' ? 'SMS' : 'WhatsApp';
                const digits = inputPhone.replace(/\D/g, '').slice(-10);

                if (!digits || digits.length < 10) {
                    return sendJson(res, 400, { error: 'Please enter a valid 10-digit registered Indian mobile number.' });
                }

                // Match in clients table or auto-register new mobile number
                const matchedClient = getOrCreateClientByPhone(db, digits, inputPhone, b.name);

                // Generate 6-digit OTP code
                const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
                const now = new Date();
                const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
                const createdAt = now.toISOString();

                // Invalidate existing pending OTPs for this client
                db.prepare(`
                    UPDATE otp_verifications SET status = 'Expired'
                    WHERE client_id = ? AND status = 'Pending'
                `).run(matchedClient.id);

                // Insert new OTP
                db.prepare(`
                    INSERT INTO otp_verifications (client_id, phone, otp_code, channel, status, expires_at, created_at)
                    VALUES (?, ?, ?, ?, 'Pending', ?, ?)
                `).run(matchedClient.id, matchedClient.phone, otpCode, channel, expiresAt, createdAt);

                let waLink = null;
                const fullIndianPhone = `91${digits}`;

                if (channel === 'WhatsApp') {
                    const waMsg = `⚖️ *OFFICE OF THE cLAWssroom*\n*A. LEELA KRISHNA (BA. LLB.) Advocate*\n*Telangana State High Court and Supreme Court of India*\n🔐 *CLIENT CASE ACCESS OTP*\n\nDear *${matchedClient.name}*,\nYour One-Time Password (OTP) to login and access your court matters is:\n\n👉 *${otpCode}*\n\n⏱️ _Valid for 5 minutes._ Do not share this OTP with anyone.\n\n_Chambers of A. LEELA KRISHNA Advocate (BCI: TS/3581/2018)_\n_WhatsApp: +91-9493489498 | Cell: +91-8121578785_`;
                    waLink = `https://wa.me/${fullIndianPhone}?text=${encodeURIComponent(waMsg)}`;

                    // Find any case for this client to link in logs
                    const c = db.prepare('SELECT id FROM cases WHERE client_id = ? LIMIT 1').get(matchedClient.id);
                    const caseId = c ? c.id : null;

                    try {
                        db.prepare(`
                            INSERT INTO whatsapp_logs (case_id, client_id, client_name, phone, message_text, status, whatsapp_url, sent_at)
                            VALUES (?, ?, ?, ?, ?, 'Delivered', ?, ?)
                        `).run(caseId, matchedClient.id, matchedClient.name, matchedClient.phone, waMsg, waLink, createdAt);
                    } catch (logErr) {
                        console.warn('[WhatsApp Log] Non-fatal log insert:', logErr.message);
                    }
                } else {
                    console.log(`[SMS Gateway] Dispatched DLT OTP ${otpCode} to ${matchedClient.phone}`);
                }

                return sendJson(res, 200, {
                    success: true,
                    channel,
                    phone: matchedClient.phone,
                    client_name: matchedClient.name,
                    otp_preview: otpCode,
                    expires_in_seconds: 300,
                    wa_link: waLink,
                    message: `OTP has been generated and dispatched via ${channel} to ${matchedClient.phone}.`
                });
            }

            // Client Portal: Verify OTP
            if (pathname === '/api/client/verify-otp' && req.method === 'POST') {
                const b = await parseJsonBody(req);
                const inputPhone = (b.phone || '').trim();
                const inputOtp = (b.otp || '').trim();
                const digits = inputPhone.replace(/\D/g, '').slice(-10);

                if (!digits || digits.length < 10) {
                    return sendJson(res, 400, { error: 'Please enter a valid 10-digit registered Indian mobile number.' });
                }

                if (!inputOtp || inputOtp.length !== 6) {
                    return sendJson(res, 400, { error: 'Please enter the complete 6-digit OTP code.' });
                }

                // Match or auto-register client
                const matchedClient = getOrCreateClientByPhone(db, digits, inputPhone, b.name);

                // Find active pending OTP
                const pendingOtp = db.prepare(`
                    SELECT * FROM otp_verifications
                    WHERE client_id = ? AND status = 'Pending'
                    ORDER BY id DESC LIMIT 1
                `).get(matchedClient.id);

                if (!pendingOtp) {
                    return sendJson(res, 400, { error: 'No active OTP verification found. Please request an OTP.' });
                }

                const now = new Date();
                if (new Date(pendingOtp.expires_at) < now) {
                    db.prepare(`UPDATE otp_verifications SET status = 'Expired' WHERE id = ?`).run(pendingOtp.id);
                    return sendJson(res, 400, { error: 'The OTP has expired (5-minute validity). Please request a fresh OTP.' });
                }

                if (pendingOtp.otp_code !== inputOtp) {
                    return sendJson(res, 400, { error: 'Incorrect OTP entered. Please check and try again.' });
                }

                // Mark verified
                db.prepare(`UPDATE otp_verifications SET status = 'Verified' WHERE id = ?`).run(pendingOtp.id);

                const casesCount = db.prepare('SELECT COUNT(*) as cnt FROM cases WHERE client_id = ?').get(matchedClient.id).cnt;

                return sendJson(res, 200, {
                    success: true,
                    client: matchedClient,
                    casesCount,
                    cases_count: casesCount
                });
            }

            // Client Portal Authentication by Phone Number (Direct fallback)
            if (pathname === '/api/client/login' && req.method === 'POST') {
                const b = await parseJsonBody(req);
                const inputPhone = (b.phone || '').trim();
                const digits = inputPhone.replace(/\D/g, '').slice(-10);

                if (!digits || digits.length < 10) {
                    return sendJson(res, 400, { error: 'Please enter a valid 10-digit registered Indian mobile number.' });
                }

                // Search in clients table or auto-register new mobile number
                const matchedClient = getOrCreateClientByPhone(db, digits, inputPhone, b.name);

                const casesCount = db.prepare('SELECT COUNT(*) as cnt FROM cases WHERE client_id = ?').get(matchedClient.id).cnt;

                return sendJson(res, 200, {
                    success: true,
                    client: matchedClient,
                    casesCount,
                    cases_count: casesCount
                });
            }

            // Client Portal Data (Scoped strictly to authenticated client's cases)
            if (pathname === '/api/client/portal-data' && req.method === 'GET') {
                const clientId = Number(query.client_id);
                if (!clientId) {
                    return sendJson(res, 400, { error: 'client_id is required' });
                }

                const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
                if (!client) {
                    return sendJson(res, 404, { error: 'Client not found' });
                }

                // Only cases belonging to this client
                const clientCases = db.prepare(`
                    SELECT c.*,
                           (SELECT COUNT(*) FROM hearings WHERE case_id = c.id) as hearings_count,
                           (SELECT COUNT(*) FROM pleadings_documents WHERE case_id = c.id) as docs_count
                    FROM cases c
                    WHERE c.client_id = ?
                    ORDER BY c.id DESC
                `).all(clientId);

                const caseIds = clientCases.map(c => c.id);

                let hearings = [];
                let documents = [];
                let feeLedger = [];

                if (caseIds.length > 0) {
                    const placeholders = caseIds.map(() => '?').join(',');
                    hearings = db.prepare(`
                        SELECT h.*, c.case_number, c.title as case_title, c.cino
                        FROM hearings h
                        JOIN cases c ON h.case_id = c.id
                        WHERE h.case_id IN (${placeholders})
                        ORDER BY h.hearing_date DESC
                    `).all(...caseIds);

                    documents = db.prepare(`
                        SELECT d.*, c.case_number, c.title as case_title
                        FROM pleadings_documents d
                        JOIN cases c ON d.case_id = c.id
                        WHERE d.case_id IN (${placeholders})
                        ORDER BY d.id DESC
                    `).all(...caseIds);

                    feeLedger = db.prepare(`
                        SELECT f.*, c.case_number, c.title as case_title
                        FROM fee_ledger f
                        JOIN cases c ON f.case_id = c.id
                        WHERE f.case_id IN (${placeholders})
                        ORDER BY f.date DESC
                    `).all(...caseIds);
                }

                // WhatsApp logs for this client
                const whatsappLogs = db.prepare(`
                    SELECT w.*, c.case_number, c.title as case_title
                    FROM whatsapp_logs w
                    JOIN cases c ON w.case_id = c.id
                    WHERE w.client_id = ?
                    ORDER BY w.id DESC
                `).all(clientId);

                return sendJson(res, 200, {
                    client,
                    cases: clientCases,
                    hearings,
                    documents,
                    feeLedger,
                    whatsappLogs
                });
            }

            // WhatsApp Dispatches Log
            if (pathname === '/api/whatsapp-logs' && req.method === 'GET') {
                let sql = `
                    SELECT w.*, c.case_number, c.title as case_title, c.cino
                    FROM whatsapp_logs w
                    JOIN cases c ON w.case_id = c.id
                    WHERE 1=1
                `;
                const params = [];
                if (query.case_id) {
                    sql += ' AND w.case_id = ?';
                    params.push(Number(query.case_id));
                }
                if (query.client_id) {
                    sql += ' AND w.client_id = ?';
                    params.push(Number(query.client_id));
                }
                sql += ' ORDER BY w.id DESC LIMIT 50';
                return sendJson(res, 200, db.prepare(sql).all(...params));
            }

            // Clients CRUD (with BCI conflict check)
            if (pathname === '/api/clients' && req.method === 'GET') {
                const clients = db.prepare(`
                    SELECT cl.*, 
                           (SELECT COUNT(*) FROM cases WHERE client_id = cl.id) as case_count
                    FROM clients cl
                    ORDER BY cl.name ASC
                `).all();
                return sendJson(res, 200, clients);
            }

            if (pathname === '/api/clients' && req.method === 'POST') {
                const b = await parseJsonBody(req);
                if (!b.name) return sendJson(res, 400, { error: 'Client name is required' });

                const stmt = db.prepare(`
                    INSERT INTO clients (name, client_type, email, phone, address, notes, bci_conflict_check)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                const result = stmt.run(
                    b.name,
                    b.client_type || 'Individual',
                    b.email || '',
                    b.phone || '',
                    b.address || '',
                    b.notes || '',
                    b.bci_conflict_check !== undefined ? Number(b.bci_conflict_check) : 1
                );
                return sendJson(res, 201, { id: result.lastInsertRowid, ...b });
            }

            const clientIdMatch = pathname.match(/^\/api\/clients\/(\d+)$/);
            if (clientIdMatch) {
                const clientId = Number(clientIdMatch[1]);
                if (req.method === 'PUT') {
                    const b = await parseJsonBody(req);
                    db.prepare(`
                        UPDATE clients SET name = ?, client_type = ?, email = ?, phone = ?, address = ?, notes = ?, bci_conflict_check = ?
                        WHERE id = ?
                    `).run(b.name, b.client_type, b.email, b.phone, b.address, b.notes, b.bci_conflict_check, clientId);
                    return sendJson(res, 200, { success: true });
                }
                if (req.method === 'DELETE') {
                    db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);
                    return sendJson(res, 200, { success: true });
                }
            }

            // Case Calendar (Full Indian Court Diary & NDOH Schedule)
            if (pathname === '/api/calendar' && req.method === 'GET') {
                let sql = `
                    SELECT h.id as hearing_id, h.case_id, h.hearing_title, h.hearing_type, h.hearing_date, 
                           h.hearing_time, h.court_room, h.item_no, h.bench, h.advocate, h.status as hearing_status,
                           c.case_number, c.cino, c.title as case_title, c.practice_area, c.priority, c.court_name, c.stage_purpose
                    FROM hearings h
                    JOIN cases c ON h.case_id = c.id
                    WHERE 1=1
                `;
                const params = [];
                let monthPrefix = query.month;
                if (query.year && query.month && query.month.length <= 2) {
                    monthPrefix = `${query.year}-${query.month.padStart(2, '0')}`;
                }

                if (monthPrefix) {
                    sql += ' AND h.hearing_date LIKE ?';
                    params.push(`${monthPrefix}%`);
                }
                sql += ' ORDER BY h.hearing_date ASC, h.item_no ASC';
                const hearings = db.prepare(sql).all(...params);

                let caseSql = `
                    SELECT id as case_id, case_number, cino, title as case_title, practice_area, priority, court_name,
                           stage_purpose, date_next_list as hearing_date, advocate_brief as advocate, bench_designation as bench,
                           court_item_no as item_no, status
                    FROM cases
                    WHERE date_next_list IS NOT NULL AND date_next_list != ''
                `;
                const caseParams = [];
                if (monthPrefix) {
                    caseSql += ' AND date_next_list LIKE ?';
                    caseParams.push(`${monthPrefix}%`);
                }
                const ndohCases = db.prepare(caseSql).all(...caseParams);

                return sendJson(res, 200, {
                    hearings,
                    ndohCases
                });
            }

            // Hearings (Indian Court Appearances & Daily Board)
            if (pathname === '/api/hearings' && req.method === 'GET') {
                let sql = `
                    SELECT h.*, c.title as case_title, c.case_number, c.cino, c.court_name as establishment_name
                    FROM hearings h
                    JOIN cases c ON h.case_id = c.id
                    WHERE 1=1
                `;
                const params = [];
                if (query.case_id) {
                    sql += ' AND h.case_id = ?';
                    params.push(Number(query.case_id));
                }
                if (query.upcoming === 'true') {
                    sql += " AND h.hearing_date >= DATE('now')";
                }
                sql += ' ORDER BY h.hearing_date ASC, h.item_no ASC';
                const hearings = db.prepare(sql).all(...params);
                return sendJson(res, 200, hearings);
            }

            if (pathname === '/api/hearings' && req.method === 'POST') {
                const b = await parseJsonBody(req);
                const stmt = db.prepare(`
                    INSERT INTO hearings (case_id, hearing_title, hearing_type, hearing_date, hearing_time, court_room, item_no, bench, advocate, board_stage, daily_orders, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                const resRow = stmt.run(
                    b.case_id,
                    b.hearing_title,
                    b.hearing_type || 'Hearing on Board',
                    b.hearing_date,
                    b.hearing_time || '10:30 AM',
                    b.court_room || 'Court Hall 1',
                    b.item_no || 'Item No. 1',
                    b.bench || 'Hon\'ble Judge',
                    b.advocate || 'Chamber Advocate',
                    b.board_stage || 'Daily Cause List',
                    b.daily_orders || '',
                    b.status || 'Scheduled'
                );

                // Update date_next_list in cases table
                db.prepare('UPDATE cases SET date_next_list = ? WHERE id = ?').run(b.hearing_date, b.case_id);

                return sendJson(res, 201, { id: resRow.lastInsertRowid, ...b });
            }

            const hearingIdMatch = pathname.match(/^\/api\/hearings\/(\d+)$/);
            if (hearingIdMatch && req.method === 'DELETE') {
                db.prepare('DELETE FROM hearings WHERE id = ?').run(Number(hearingIdMatch[1]));
                return sendJson(res, 200, { success: true });
            }

            // Tasks (Chamber Workflow & Filings)
            if (pathname === '/api/tasks' && req.method === 'GET') {
                let sql = `
                    SELECT t.*, c.title as case_title, c.case_number, c.cino
                    FROM tasks t
                    LEFT JOIN cases c ON t.case_id = c.id
                    WHERE 1=1
                `;
                const params = [];
                if (query.case_id) {
                    sql += ' AND t.case_id = ?';
                    params.push(Number(query.case_id));
                }
                if (query.status) {
                    sql += ' AND t.status = ?';
                    params.push(query.status);
                }
                sql += ' ORDER BY t.due_date ASC';
                return sendJson(res, 200, db.prepare(sql).all(...params));
            }

            if (pathname === '/api/tasks' && req.method === 'POST') {
                const b = await parseJsonBody(req);
                const stmt = db.prepare(`
                    INSERT INTO tasks (case_id, title, assigned_to, due_date, priority, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                const r = stmt.run(b.case_id || null, b.title, b.assigned_to || '', b.due_date || '', b.priority || 'Regular', b.status || 'Pending');
                return sendJson(res, 201, { id: r.lastInsertRowid, ...b });
            }

            const taskIdMatch = pathname.match(/^\/api\/tasks\/(\d+)$/);
            if (taskIdMatch) {
                const taskId = Number(taskIdMatch[1]);
                if (req.method === 'PUT') {
                    const b = await parseJsonBody(req);
                    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(b.status, taskId);
                    return sendJson(res, 200, { success: true });
                }
                if (req.method === 'DELETE') {
                    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
                    return sendJson(res, 200, { success: true });
                }
            }

            // Pleadings & Documents
            if (pathname === '/api/documents' && req.method === 'GET') {
                let sql = `
                    SELECT d.*, c.title as case_title, c.case_number, c.cino
                    FROM pleadings_documents d
                    JOIN cases c ON d.case_id = c.id
                    WHERE 1=1
                `;
                const params = [];
                if (query.case_id) {
                    sql += ' AND d.case_id = ?';
                    params.push(Number(query.case_id));
                }
                sql += ' ORDER BY d.id DESC';
                return sendJson(res, 200, db.prepare(sql).all(...params));
            }

            if (pathname === '/api/documents' && req.method === 'POST') {
                const b = await parseJsonBody(req);
                const stmt = db.prepare(`
                    INSERT INTO pleadings_documents (case_id, title, category, annexure_no, file_type, file_size, tags, summary)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                const r = stmt.run(
                    b.case_id, b.title, b.category || 'Plaint',
                    b.annexure_no || '', b.file_type || 'PDF', b.file_size || '1.0 MB',
                    b.tags || '', b.summary || ''
                );
                return sendJson(res, 201, { id: r.lastInsertRowid, ...b });
            }

            const docIdMatch = pathname.match(/^\/api\/documents\/(\d+)$/);
            if (docIdMatch && req.method === 'DELETE') {
                db.prepare('DELETE FROM pleadings_documents WHERE id = ?').run(Number(docIdMatch[1]));
                return sendJson(res, 200, { success: true });
            }

            // Fee Ledger (Indian Chambers Accounting)
            if (pathname === '/api/billing' && req.method === 'GET') {
                let sql = `
                    SELECT f.*, c.title as case_title, c.case_number, c.cino
                    FROM fee_ledger f
                    JOIN cases c ON f.case_id = c.id
                    WHERE 1=1
                `;
                const params = [];
                if (query.case_id) {
                    sql += ' AND f.case_id = ?';
                    params.push(Number(query.case_id));
                }
                sql += ' ORDER BY f.date DESC';
                return sendJson(res, 200, db.prepare(sql).all(...params));
            }

            if (pathname === '/api/billing' && req.method === 'POST') {
                const b = await parseJsonBody(req);
                const stmt = db.prepare(`
                    INSERT INTO fee_ledger (case_id, date, advocate_name, amount, fee_category, description, payment_status, receipt_no)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                const r = stmt.run(
                    b.case_id, b.date, b.advocate_name || 'Senior Counsel',
                    Number(b.amount) || 15000,
                    b.fee_category || 'Senior Counsel Appearance Fee',
                    b.description || '',
                    b.payment_status || 'Pending',
                    b.receipt_no || `RCP-${Date.now().toString().slice(-6)}`
                );
                return sendJson(res, 201, { id: r.lastInsertRowid, ...b });
            }

            const billIdMatch = pathname.match(/^\/api\/billing\/(\d+)$/);
            if (billIdMatch && req.method === 'DELETE') {
                db.prepare('DELETE FROM fee_ledger WHERE id = ?').run(Number(billIdMatch[1]));
                return sendJson(res, 200, { success: true });
            }

            // Case Diary / Order Sheet Logs
            if (pathname === '/api/notes' && req.method === 'POST') {
                const b = await parseJsonBody(req);
                const stmt = db.prepare(`
                    INSERT INTO case_diary (case_id, author, diary_category, entry, citation_ref)
                    VALUES (?, ?, ?, ?, ?)
                `);
                const r = stmt.run(
                    b.case_id,
                    b.author || 'Chamber Advocate',
                    b.diary_category || 'Court Proceeding / Daily Order',
                    b.entry,
                    b.citation_ref || ''
                );
                return sendJson(res, 201, { id: r.lastInsertRowid, ...b, created_at: new Date().toISOString() });
            }

            const noteIdMatch = pathname.match(/^\/api\/notes\/(\d+)$/);
            if (noteIdMatch && req.method === 'DELETE') {
                db.prepare('DELETE FROM case_diary WHERE id = ?').run(Number(noteIdMatch[1]));
                return sendJson(res, 200, { success: true });
            }

            // Export Database JSON
            if (pathname === '/api/export' && req.method === 'GET') {
                const backup = {
                    version: '2.0-IN',
                    jurisdiction: 'India (Advocates Act 1961)',
                    exportDate: new Date().toISOString(),
                    clients: db.prepare('SELECT * FROM clients').all(),
                    cases: db.prepare('SELECT * FROM cases').all(),
                    hearings: db.prepare('SELECT * FROM hearings').all(),
                    tasks: db.prepare('SELECT * FROM tasks').all(),
                    pleadings_documents: db.prepare('SELECT * FROM pleadings_documents').all(),
                    fee_ledger: db.prepare('SELECT * FROM fee_ledger').all(),
                    case_diary: db.prepare('SELECT * FROM case_diary').all()
                };
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Content-Disposition': 'attachment; filename="clawssroom-indian-chambers-backup.json"'
                });
                res.end(JSON.stringify(backup, null, 2));
                return;
            }

            return sendJson(res, 404, { error: 'API endpoint not found' });
        } catch (apiErr) {
            console.error('API Error:', apiErr);
            return sendJson(res, 500, { error: apiErr.message || 'Internal server error' });
        }
    }

    // Static File Serving
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';
    
    const filePath = path.join(PUBLIC_DIR, safePath);

    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            const indexPath = path.join(PUBLIC_DIR, 'index.html');
            if (fs.existsSync(indexPath)) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                fs.createReadStream(indexPath).pipe(res);
                return;
            }
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================================`);
    console.log(`⚖️  cLAWssroom | Indian Court System & Law Chambers Portal`);
    console.log(`🇮🇳 Jurisdiction: Republic of India (Supreme Court, High Courts, District Courts & Tribunals)`);
    console.log(`🌐 Server running at: http://localhost:${PORT}`);
    console.log(`📁 Local Workspace: ${__dirname}`);
    console.log(`================================================================`);
});
