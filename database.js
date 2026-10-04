const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.join(__dirname, 'clawssroom.db');

function getDatabase() {
    const db = new DatabaseSync(DB_PATH);
    
    // Enable WAL mode & foreign keys
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
    `);

    // Create tables customized for Indian Courts & Chambers
    db.exec(`
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            client_type TEXT DEFAULT 'Individual',
            email TEXT,
            phone TEXT,
            address TEXT,
            notes TEXT,
            bci_conflict_check INTEGER DEFAULT 1, -- 1: Cleared under BCI Rules, 0: Pending, 2: Flagged
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cino TEXT UNIQUE, -- 16-digit eCourts CNR Number (e.g. TSRA330011622021)
            case_type TEXT NOT NULL, -- OS, CC, WP(C), CRLA, HMOP, FCOP, DVC, STC.NI, etc.
            case_number TEXT NOT NULL, -- e.g. OS No. 791/2021, CC No. 720/2021
            title TEXT NOT NULL, -- [Petitioner] vs. [Respondent]
            petitioner TEXT NOT NULL,
            respondent TEXT NOT NULL,
            client_id INTEGER,
            practice_area TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending', -- Pending, In Hearing, Evidence Stage, Arguments, Reserved for Orders, Decreed, Dismissed, Disposed
            stage_purpose TEXT DEFAULT 'Notice / Summons', -- e.g. SUMMONS, WRITTEN STATEMENT, ISSUES, CROSS EXAMINATION OF PW, 313 CRPC, ARGUMENTS, JUDGMENT
            priority TEXT DEFAULT 'Regular', -- Urgent, High, Regular, Normal
            court_name TEXT, -- Establishment / Complex (e.g. Prl. Junior Civil Judges Court, Ranga Reddy)
            bench_designation TEXT, -- Presiding Judicial Officer (e.g. Principal District & Sessions Judge)
            court_item_no TEXT, -- Item No. on Daily Cause List (e.g. Item 14, Court No. 4)
            state_name TEXT DEFAULT 'Telangana',
            district_name TEXT DEFAULT 'Rangareddy',
            advocate_brief TEXT, -- Briefing Counsel / Chamber Advocate
            opposite_advocate TEXT, -- Opposite Party Counsel
            vakalatnama_status TEXT DEFAULT 'Vakalatnama Filed', -- Vakalatnama Filed, Memo of Appearance, Caveat Filed, NOC Issued
            fee_type TEXT DEFAULT 'Lump Sum Per Hearing', -- Per Appearance, Lump Sum Stage-wise, Retainer, Brief Fee
            fee_due TEXT DEFAULT 'No', -- 'Yes' or 'No'
            appearance_fee REAL DEFAULT 15000.00,
            fee_received REAL DEFAULT 25000.00,
            limitation_date TEXT, -- Limitation Period under Limitation Act 1963
            date_next_list TEXT, -- Next Date of Hearing (NDOH)
            date_last_list TEXT, -- Previous Date of Hearing
            date_of_decision TEXT, -- Date of Judgment / Disposal
            disposition_name TEXT, -- e.g. DECREED WITH COSTS, ALLOWED, DISMISSED AS NOT PRESSED, ACQUITTAL, CONVICTED
            business_of_the_day TEXT, -- Today's Court Proceedings / Daily Business
            last_business_update TEXT, -- Timestamp of last court business update
            summary TEXT,
            advocate_notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS hearings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            hearing_title TEXT NOT NULL,
            hearing_type TEXT NOT NULL, -- Admission & Notice, Framing of Issues, P.W. Evidence, D.W. Evidence, 313 CrPC, Final Arguments, Pronouncement of Order, Bail Hearing
            hearing_date TEXT NOT NULL, -- YYYY-MM-DD (Next Date of Hearing)
            hearing_time TEXT DEFAULT '10:30 AM',
            court_room TEXT, -- Court No. / Chamber
            item_no TEXT, -- Item No. on Cause List
            bench TEXT, -- Hon'ble Judge
            advocate TEXT, -- Attending Counsel
            board_stage TEXT, -- Motion Board, Regular Board, Daily Cause List
            daily_orders TEXT, -- Daily Proceeding / Order Sheet note
            status TEXT DEFAULT 'Scheduled', -- Scheduled, Part-Heard, Adjourned, Disposed
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER,
            title TEXT NOT NULL,
            assigned_to TEXT, -- Junior Advocate / Chamber Clerk
            due_date TEXT,
            priority TEXT DEFAULT 'Regular',
            status TEXT DEFAULT 'Pending', -- Pending, In Drafting, Under Review, Completed / Filed
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pleadings_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL, -- Plaint, Written Statement (WS), Vakalatnama, Interlocutory Application (IA), Counter Affidavit, Rejoinder, Evidence Affidavit, Annexure, Certified Order Sheet
            annexure_no TEXT, -- e.g. Annexure P-1, Annexure R-1, Ex. PW-1/A
            file_type TEXT DEFAULT 'PDF',
            file_size TEXT DEFAULT '1.2 MB',
            tags TEXT,
            summary TEXT,
            upload_date TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS fee_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            advocate_name TEXT NOT NULL,
            amount REAL NOT NULL,
            fee_category TEXT NOT NULL, -- Senior Counsel Appearance Fee, Drafting & Settling Plaint/WS, Conferencing Fee, Clerkage (10%), Court Fees & Stamp Duty, Process Fee & Misc.
            description TEXT NOT NULL,
            payment_status TEXT DEFAULT 'Pending', -- Pending, Received, Settled
            receipt_no TEXT,
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS case_diary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            diary_category TEXT DEFAULT 'Court Observation', -- Court Proceeding / Daily Order, Client Conference, Cross-Examination Strategy, Case Law Citation / Precedent
            entry TEXT NOT NULL,
            citation_ref TEXT, -- e.g. (2023) 4 SCC 128 / AIR 2022 SC 980
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS whatsapp_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER,
            client_id INTEGER,
            client_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            message_text TEXT NOT NULL,
            status TEXT DEFAULT 'Delivered', -- Sent, Delivered, Opened
            whatsapp_url TEXT,
            sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS otp_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            phone TEXT NOT NULL,
            otp_code TEXT NOT NULL,
            channel TEXT NOT NULL, -- WhatsApp, SMS
            status TEXT DEFAULT 'Pending', -- Pending, Verified, Expired
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        );
    `);

    // Migration helper: Ensure columns exist if DB was created before
    try {
        db.exec(`
            ALTER TABLE cases ADD COLUMN business_of_the_day TEXT;
        `);
    } catch (_) {}
    try {
        db.exec(`
            ALTER TABLE cases ADD COLUMN last_business_update TEXT;
        `);
    } catch (_) {}
    try {
        db.exec(`
            ALTER TABLE cases ADD COLUMN fee_due TEXT DEFAULT 'No';
        `);
    } catch (_) {}

    try {
        const tableInfo = db.prepare("PRAGMA table_info(whatsapp_logs)").all();
        const caseIdCol = tableInfo.find(c => c.name === 'case_id');
        if (caseIdCol && caseIdCol.notnull === 1) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS whatsapp_logs_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id INTEGER,
                    client_id INTEGER,
                    client_name TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    message_text TEXT NOT NULL,
                    status TEXT DEFAULT 'Delivered',
                    whatsapp_url TEXT,
                    sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
                    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
                );
                INSERT INTO whatsapp_logs_new SELECT * FROM whatsapp_logs;
                DROP TABLE whatsapp_logs;
                ALTER TABLE whatsapp_logs_new RENAME TO whatsapp_logs;
            `);
        }
    } catch (_) {}
    try {
        db.exec(`ALTER TABLE cases ADD COLUMN owner_id INTEGER;`);
    } catch (_) {}
    try {
        db.exec(`ALTER TABLE clients ADD COLUMN owner_id INTEGER;`);
    } catch (_) {}
    try {
        db.exec(`ALTER TABLE clients ADD COLUMN role TEXT DEFAULT 'client';`);
    } catch (_) {}
    try {
        db.exec(`ALTER TABLE tasks ADD COLUMN owner_id INTEGER;`);
    } catch (_) {}
    try {
        db.exec(`UPDATE clients SET role = 'admin' WHERE REPLACE(REPLACE(phone, ' ', ''), '-', '') LIKE '%8121578785%' OR REPLACE(REPLACE(phone, ' ', ''), '-', '') LIKE '%9493489498%';`);
    } catch (_) {}

    return db;
}

function mapPracticeArea(typeName, purpose) {
    const t = (typeName || '').toUpperCase();
    const p = (purpose || '').toUpperCase();

    if (t.includes('DVC') || t.includes('F.C.O.P') || t.includes('H.M.O.P') || t.includes('MAT')) {
        return 'Matrimonial & Family Law';
    }
    if (t.includes('CC') || t.includes('CRLA') || t.includes('BAIL') || t.includes('NDPS') || p.includes('313 CRPC') || p.includes('NBW')) {
        return 'Criminal Law & Bail Matters';
    }
    if (t.includes('STC') || t.includes('NI') || p.includes('138')) {
        return 'Negotiable Instruments (Sec 138 NI Act)';
    }
    if (t.includes('COMM') || t.includes('ARB') || t.includes('CP') || t.includes('CA')) {
        return 'Commercial & Corporate Disputes';
    }
    if (t.includes('OS') || t.includes('EP') || t.includes('OP')) {
        return 'Civil Suits, Property & Injunctions';
    }
    return 'General Litigation Practice';
}

function mapStatus(dispName, purpose) {
    if (dispName && dispName.trim()) {
        const d = dispName.toUpperCase();
        if (d.includes('DECREED') || d.includes('ALLOWED') || d.includes('CONVICTED') || d.includes('ACQUITTAL') || d.includes('EXPARTE')) {
            return 'Disposed / Decreed';
        }
        if (d.includes('DISMISSED') || d.includes('NOT PRESSED') || d.includes('DEFAULT')) {
            return 'Dismissed';
        }
        if (d.includes('TRANSFERRED')) {
            return 'Transferred';
        }
        return 'Disposed';
    }

    const p = (purpose || '').toUpperCase();
    if (p.includes('JUDGMENT') || p.includes('ORDERS')) return 'Reserved for Orders';
    if (p.includes('ARGUMENT') || p.includes('HEARING')) return 'Final Arguments';
    if (p.includes('EVIDENCE') || p.includes('CROSS') || p.includes('313')) return 'Evidence Stage';
    if (p.includes('WRITTEN STATEMENT') || p.includes('ISSUES')) return 'Pleadings & Issues';
    if (p.includes('SUMMONS') || p.includes('NOTICE') || p.includes('PROCESS')) return 'Notice & Summons Stage';
    return 'Active Matter';
}

function mapPriority(purpose, typeName) {
    const p = (purpose || '').toUpperCase();
    const t = (typeName || '').toUpperCase();
    if (t.includes('BAIL') || p.includes('NBW') || p.includes('STAY') || p.includes('INJUNCTION') || p.includes('JUDGMENT')) {
        return 'Urgent';
    }
    if (p.includes('CROSS') || p.includes('EVIDENCE') || p.includes('ARGUMENT')) {
        return 'High';
    }
    return 'Regular';
}

module.exports = {
    getDatabase,
    DB_PATH,
    mapPracticeArea,
    mapStatus,
    mapPriority
};
