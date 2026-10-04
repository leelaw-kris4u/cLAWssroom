/**
 * cLAWssroom - Indian Court System & Advocate's Practice Management Frontend
 * Jurisdiction: Republic of India
 */

class IndianLegalPortalApp {
    constructor() {
        this.currentView = 'dashboard';
        this.currentCaseId = null;
        this.currentCaseData = null;
        this.cases = [];
        this.clients = [];
        this.hearings = [];
        this.tasks = [];
        this.billing = [];
        this.stats = {};

        // Case Calendar State
        this.calCurrentDate = new Date();
        this.calSelectedDate = new Date().toISOString().split('T')[0];
        this.calHearings = [];
        this.calNdohCases = [];

        // Client Portal Access Mode & OTP Verification State
        this.isClientMode = false;
        this.loggedInClient = null;
        this.clientPortalData = null;
        this.selectedOtpChannel = 'WhatsApp';
        this.activeOtp = null;
        this.activePhone = null;
        this.otpCountdownInterval = null;

        // Case Intake Submit Mode ('save' or 'add_another')
        this.caseSubmitMode = 'save';

        this.init();
    }

    async init() {
        this.initTheme();
        this.setupNavigation();
        this.setupEventListeners();
        this.setupCalendarEvents();
        this.updateDateDisplay();

        // Load initial data
        await this.loadClients();
        await this.loadStats();
        await this.loadCases();
        await this.loadHearings();
        await this.loadTasks();
        await this.loadBilling();
        await this.loadCalendarData();
        this.checkDraftBadge();
    }

    initTheme() {
        const savedTheme = localStorage.getItem('clawssroom_theme') || 'dark';
        document.body.className = savedTheme === 'light' ? 'theme-light' : 'theme-dark';
        
        document.getElementById('themeToggleBtn').addEventListener('click', () => {
            const isLight = document.body.classList.contains('theme-light');
            document.body.className = isLight ? 'theme-dark' : 'theme-light';
            localStorage.setItem('clawssroom_theme', isLight ? 'dark' : 'light');
            this.showToast(`Switched to ${isLight ? 'Dark' : 'Light'} theme`);
        });
    }

    updateDateDisplay() {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('currentDateDisplay').textContent = `${now.toLocaleDateString('en-IN', options)} | Indian Court Calendar`;
    }

    formatRupees(amount) {
        const num = Number(amount) || 0;
        return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.navigate(view);
            });
        });
    }

    goToHomePage() {
        // Close any open modals/drawers
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.classList.add('hidden');
        });

        // Reset global search bar
        const searchInput = document.getElementById('globalSearchInput');
        if (searchInput) searchInput.value = '';

        // Navigate to home view (Chambers Dashboard)
        this.navigate('dashboard');
    }

    navigate(viewName) {
        this.currentView = viewName;
        
        // Update nav buttons
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });

        // Update view containers
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.toggle('active', view.id === `view-${viewName}`);
        });

        // Update page title
        const titles = {
            'dashboard': 'Chambers Overview & Cause List Analytics',
            'cases': 'eCourts Case Vault & Litigation Dockets',
            'calendar': 'Case Calendar & NDOH Court Schedule',
            'hearings': 'Daily Cause List & Board Appearances',
            'tasks': 'Chamber Registry Filings & Deadlines',
            'clients': 'Client Directory & BCI Professional Clearance',
            'billing': 'Advocate Fee Ledger & Professional Accounting'
        };
        document.getElementById('pageTitle').textContent = titles[viewName] || 'Chambers Overview';

        // Refresh view data
        if (viewName === 'dashboard') this.loadStats();
        if (viewName === 'cases') this.loadCases();
        if (viewName === 'calendar') this.loadCalendarData();
        if (viewName === 'hearings') this.loadHearings();
        if (viewName === 'tasks') this.loadTasks();
        if (viewName === 'clients') this.loadClients();
        if (viewName === 'billing') this.loadBilling();
    }

    setupEventListeners() {
        // Global search with debounce
        let searchTimeout;
        const searchInput = document.getElementById('globalSearchInput');
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if (this.currentView !== 'cases') {
                    this.navigate('cases');
                }
                this.applyCaseFilters();
            }, 300);
        });

        // Filters in Cases view
        document.getElementById('caseFilterPracticeArea').addEventListener('change', () => this.applyCaseFilters());
        document.getElementById('caseFilterType').addEventListener('change', () => this.applyCaseFilters());
        document.getElementById('caseFilterStatus').addEventListener('change', () => this.applyCaseFilters());
        document.getElementById('caseFilterPriority').addEventListener('change', () => this.applyCaseFilters());
        document.getElementById('resetFiltersBtn').addEventListener('click', () => {
            document.getElementById('caseFilterPracticeArea').value = 'All';
            document.getElementById('caseFilterType').value = 'All';
            document.getElementById('caseFilterStatus').value = 'All';
            document.getElementById('caseFilterPriority').value = 'All';
            document.getElementById('globalSearchInput').value = '';
            this.loadCases();
        });

        // Brand / Logo click to redirect to home page
        const brandBtn = document.getElementById('brandLogoBtn');
        if (brandBtn) {
            brandBtn.addEventListener('click', () => this.goToHomePage());
            brandBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.goToHomePage();
                }
            });
        }

        // Quick New Case Intake Button in Header
        document.getElementById('btnQuickNewCase').addEventListener('click', () => this.openNewCaseModal());

        // Case Detail Tabs
        document.querySelectorAll('.modal-tab').forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                const tabKey = tabBtn.dataset.tab;
                document.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
                tabBtn.classList.add('active');

                document.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.remove('active');
                });
                const targetPane = document.getElementById(`tabContent-${tabKey}`);
                if (targetPane) targetPane.classList.add('active');
            });
        });

        // Print Case Summary / Docket Brief
        const btnPrintCase = document.getElementById('btnPrintCaseSummary');
        if (btnPrintCase) {
            btnPrintCase.addEventListener('click', () => {
                this.printSelectedCaseDocket(this.currentCaseId);
            });
        }

        // Edit Current Case Button
        document.getElementById('btnEditCurrentCase').addEventListener('click', () => {
            if (this.currentCaseId) {
                this.openEditCaseModal(this.currentCaseId);
            }
        });

        // Backup Export
        document.getElementById('exportBackupBtn').addEventListener('click', () => {
            window.location.href = '/api/export';
            this.showToast('Downloading Chamber JSON backup...', 'success');
        });
    }

    applyCaseFilters() {
        const practiceArea = document.getElementById('caseFilterPracticeArea').value;
        const caseType = document.getElementById('caseFilterType').value;
        const status = document.getElementById('caseFilterStatus').value;
        const priority = document.getElementById('caseFilterPriority').value;
        const q = document.getElementById('globalSearchInput').value.trim();

        this.loadCases({
            practice_area: practiceArea,
            case_type: caseType,
            status: status,
            priority: priority,
            q: q
        });
    }

    // ==========================================
    // API Data Loaders
    // ==========================================

    async loadStats() {
        try {
            const res = await fetch('/api/stats');
            const data = await res.json();
            this.stats = data;

            document.getElementById('kpiActiveCases').textContent = data.activeCases || 0;
            document.getElementById('kpiTotalCases').textContent = `${data.totalCases || 0} registered in eCourts`;
            document.getElementById('kpiUpcomingHearings').textContent = data.upcomingHearings || 0;
            document.getElementById('kpiTotalBilled').textContent = this.formatRupees(data.totalBilled || 0);
            document.getElementById('kpiUnbilledHours').textContent = `${this.formatRupees(data.pendingRecovery || 0)} pending fee recovery`;
            document.getElementById('kpiPendingTasks').textContent = data.pendingTasks || 0;
            document.getElementById('kpiTotalClients').textContent = `${data.totalClients || 0} active clients`;

            // Sidebar counters
            document.getElementById('navCaseCount').textContent = data.activeCases || 0;
            document.getElementById('navHearingCount').textContent = data.upcomingHearings || 0;
            document.getElementById('navTaskCount').textContent = data.pendingTasks || 0;

            // Urgent Banner
            const urgentBanner = document.getElementById('urgentAlertBar');
            if (data.urgentCases > 0) {
                urgentBanner.classList.remove('hidden');
                urgentBanner.querySelector('.urgent-text').innerHTML = `<strong>${data.urgentCases} Urgent Priority Matter${data.urgentCases > 1 ? 's' : ''} on Board:</strong> Bail applications, NBW recall, or interim stay listings requiring urgent appearance.`;
            } else {
                urgentBanner.classList.add('hidden');
            }

            // Render Practice Area Breakdown
            this.renderPracticeAreasList(data.practiceAreas || []);
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    }

    renderPracticeAreasList(practiceAreas) {
        const container = document.getElementById('dashPracticeAreasList');
        if (!practiceAreas || practiceAreas.length === 0) {
            container.innerHTML = '<div class="empty-state">No practice areas registered yet.</div>';
            return;
        }

        container.innerHTML = practiceAreas.map(pa => `
            <div class="pa-item">
                <span class="pa-name">${pa.practice_area}</span>
                <span class="pa-count">${pa.count} ${pa.count === 1 ? 'matter' : 'matters'}</span>
            </div>
        `).join('');
    }

    async loadCases(filterParams = {}) {
        try {
            const query = new URLSearchParams(filterParams).toString();
            const res = await fetch(`/api/cases${query ? '?' + query : ''}`);
            const data = await res.json();
            this.cases = data;

            this.renderCasesTable(data);
            this.renderRecentCasesTable(data.slice(0, 6));
        } catch (err) {
            console.error('Failed to load cases:', err);
        }
    }

    renderCasesTable(cases) {
        const tbody = document.getElementById('casesTableBody');
        if (!cases || cases.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No matching Indian Court cases found. Click "Add Case to Docket" to enter a matter.</td></tr>`;
            return;
        }

        tbody.innerHTML = cases.map(c => `
            <tr onclick="app.openCaseDetailModal(${c.id})">
                <td>
                    <div class="docket-col">${c.case_number}</div>
                    <div class="cnr-cell">${c.cino || ''}</div>
                </td>
                <td class="case-title-col">
                    <div style="font-weight:600;">${c.title}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${c.petitioner} v. ${c.respondent}</div>
                </td>
                <td><span class="badge practice-badge">${c.practice_area}</span></td>
                <td>
                    <div style="font-size: 12px; font-weight:500;">${c.court_name || 'City Civil Court'}</div>
                    <div style="font-size: 10.5px; color: var(--text-muted);">${c.district_name || ''}, ${c.state_name || ''}</div>
                </td>
                <td>
                    <div style="font-size: 12px; font-weight: 600; color: var(--primary);">${c.stage_purpose || 'Pleadings'}</div>
                </td>
                <td>
                    <span style="font-size: 12px; font-weight: 600; color: ${c.date_next_list ? 'var(--accent-amber)' : 'var(--text-muted)'};">
                        ${c.date_next_list ? '📅 ' + c.date_next_list : 'Date TBD'}
                </td>
                <td><span class="badge priority-badge ${c.priority ? c.priority.toLowerCase() : 'regular'}">${c.priority}</span></td>
                <td><span class="badge status-badge ${c.status && c.status.toLowerCase().includes('draft') ? 'draft' : ''}">${c.status}</span></td>
                <td class="text-right" onclick="event.stopPropagation()">
                    ${!this.isClientMode ? `<button class="btn btn-sm btn-primary" style="background:linear-gradient(135deg, #25d366, #128c7e); color:white; border:none; padding:4px 9px; font-size:11px;" onclick="app.openBusinessUpdateModal(${c.id})" title="Update Business of the Day & Push WhatsApp">⚡ Update</button>` : ''}
                    <button class="btn btn-sm btn-outline" onclick="app.openCaseDetailModal(${c.id})">View</button>
                    <button class="btn btn-sm btn-outline" onclick="app.printSelectedCaseDocket(${c.id})" title="Print Court Docket for this case">🖨️ Docket</button>
                    ${!this.isClientMode ? `<button class="btn btn-sm btn-outline" onclick="app.openEditCaseModal(${c.id})">Edit</button>` : ''}
                </td>
            </tr>
        `).join('');
    }

    renderRecentCasesTable(recentCases) {
        const container = document.getElementById('dashRecentCasesTable');
        if (!recentCases || recentCases.length === 0) {
            container.innerHTML = '<div class="empty-state">No cases recorded yet.</div>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Case / CNR No.</th>
                        <th>Cause Title</th>
                        <th>Practice Area</th>
                        <th>Establishment / Court</th>
                        <th>Current Stage / Purpose</th>
                        <th>Priority</th>
                        <th class="text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${recentCases.map(c => `
                        <tr onclick="app.openCaseDetailModal(${c.id})">
                            <td>
                                <div class="docket-col">${c.case_number}</div>
                                <div class="cnr-cell">${c.cino || ''}</div>
                            </td>
                            <td class="case-title-col">${c.title}</td>
                            <td><span class="badge practice-badge">${c.practice_area}</span></td>
                            <td style="font-size: 12px;">${c.court_name || '-'}</td>
                            <td style="font-weight: 600; color: var(--primary); font-size: 12px;">${c.stage_purpose || 'Notice'}</td>
                            <td><span class="badge priority-badge ${c.priority ? c.priority.toLowerCase() : 'regular'}">${c.priority}</span></td>
                            <td class="text-right" onclick="event.stopPropagation()">
                                ${!this.isClientMode ? `<button class="btn btn-sm btn-outline" style="border-color:#25d366; color:#25d366; font-size:11px;" onclick="app.openBusinessUpdateModal(${c.id})">⚡ Update</button>` : ''}
                                <button class="btn btn-sm btn-outline" onclick="app.printSelectedCaseDocket(${c.id})" title="Print Court Docket for this case">🖨️</button>
                                <button class="btn btn-sm btn-primary" onclick="app.openCaseDetailModal(${c.id})">Open Docket</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // ==========================================
    // Case Calendar (Full Indian Court Diary & NDOH Schedule)
    // ==========================================

    setupCalendarEvents() {
        const prevBtn = document.getElementById('calPrevMonthBtn');
        const nextBtn = document.getElementById('calNextMonthBtn');
        const todayBtn = document.getElementById('calTodayBtn');
        const advFilter = document.getElementById('calFilterAdvocate');
        const prioFilter = document.getElementById('calFilterPriority');
        const addListingBtn = document.getElementById('btnAddListingForSelectedDateBtn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.calCurrentDate.setMonth(this.calCurrentDate.getMonth() - 1);
                this.renderCalendar();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.calCurrentDate.setMonth(this.calCurrentDate.getMonth() + 1);
                this.renderCalendar();
            });
        }

        if (todayBtn) {
            todayBtn.addEventListener('click', () => {
                this.calCurrentDate = new Date();
                this.calSelectedDate = new Date().toISOString().split('T')[0];
                this.renderCalendar();
                this.renderAgendaForDate(this.calSelectedDate);
            });
        }

        if (advFilter) advFilter.addEventListener('change', () => this.renderCalendar());
        if (prioFilter) prioFilter.addEventListener('change', () => this.renderCalendar());

        if (addListingBtn) {
            addListingBtn.addEventListener('click', () => {
                this.openNewHearingModal();
                if (this.calSelectedDate) {
                    document.getElementById('h_hearing_date').value = this.calSelectedDate;
                }
            });
        }
    }

    async loadCalendarData() {
        try {
            const res = await fetch('/api/calendar');
            const data = await res.json();
            this.calHearings = data.hearings || [];
            this.calNdohCases = data.ndohCases || [];

            this.renderCalendar();
            this.renderAgendaForDate(this.calSelectedDate);
        } catch (err) {
            console.error('Failed to load calendar data:', err);
        }
    }

    renderCalendar() {
        const grid = document.getElementById('calendarDaysGrid');
        if (!grid) return;

        const year = this.calCurrentDate.getFullYear();
        const month = this.calCurrentDate.getMonth(); // 0-indexed

        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        document.getElementById('calMonthYearTitle').textContent = `${monthNames[month]} ${year}`;

        // Get filter selections
        const filterAdv = document.getElementById('calFilterAdvocate')?.value || 'All';
        const filterPrio = document.getElementById('calFilterPriority')?.value || 'All';

        // Combine hearings and NDOH cases (deduping by case_id on same date)
        const allListings = [...this.calHearings];
        const existingKeys = new Set(this.calHearings.map(h => `${h.case_id}_${h.hearing_date}`));

        this.calNdohCases.forEach(nc => {
            const key = `${nc.case_id}_${nc.hearing_date}`;
            if (!existingKeys.has(key)) {
                allListings.push({
                    hearing_id: null,
                    case_id: nc.case_id,
                    hearing_title: `${nc.case_number} - ${nc.stage_purpose || 'Listed'}`,
                    hearing_type: nc.stage_purpose || 'Court Listing',
                    hearing_date: nc.hearing_date,
                    hearing_time: '10:30 AM',
                    court_room: nc.court_name,
                    item_no: nc.item_no || 'Item TBD',
                    bench: nc.bench || 'Hon\'ble Judge',
                    advocate: nc.advocate,
                    case_number: nc.case_number,
                    cino: nc.cino,
                    case_title: nc.case_title,
                    practice_area: nc.practice_area,
                    priority: nc.priority || 'Regular',
                    court_name: nc.court_name
                });
            }
        });

        // Filter listings
        const filteredListings = allListings.filter(item => {
            if (filterAdv !== 'All' && item.advocate && !item.advocate.includes(filterAdv)) return false;
            if (filterPrio !== 'All' && item.priority !== filterPrio) return false;
            return true;
        });

        // Group by Date string: YYYY-MM-DD
        const dateMap = {};
        let monthListingsCount = 0;

        filteredListings.forEach(item => {
            if (!item.hearing_date) return;
            if (!dateMap[item.hearing_date]) dateMap[item.hearing_date] = [];
            dateMap[item.hearing_date].push(item);

            if (item.hearing_date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) {
                monthListingsCount++;
            }
        });

        const navCalCountEl = document.getElementById('navCalendarCount');
        if (navCalCountEl) navCalCountEl.textContent = monthListingsCount;

        // Calendar Geometry
        const firstDayOfMonth = new Date(year, month, 1);
        let startingDay = firstDayOfMonth.getDay(); // 0 is Sunday, 1 is Monday
        // Convert to Monday=0, Sunday=6
        startingDay = (startingDay === 0) ? 6 : startingDay - 1;

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        const todayStr = new Date().toISOString().split('T')[0];

        let cellsHtml = '';

        // 1. Prev month trailing days
        for (let i = startingDay - 1; i >= 0; i--) {
            const dayNum = daysInPrevMonth - i;
            const prevMonthDate = new Date(year, month - 1, dayNum);
            const pYear = prevMonthDate.getFullYear();
            const pMonth = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
            const pDay = String(dayNum).padStart(2, '0');
            const dateStr = `${pYear}-${pMonth}-${pDay}`;

            cellsHtml += `
                <div class="cal-day-cell is-other-month" data-date="${dateStr}">
                    <div class="cal-day-header">
                        <span class="cal-day-num">${dayNum}</span>
                    </div>
                </div>
            `;
        }

        // 2. Current month days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === this.calSelectedDate;
            const dayOfWeek = (startingDay + day - 1) % 7;
            const isSunday = dayOfWeek === 6;

            const dayMatters = dateMap[dateStr] || [];
            const hasUrgent = dayMatters.some(m => (m.priority || '').toLowerCase() === 'urgent');

            // Render matter chips
            let chipsHtml = '';
            const maxChips = 2;
            dayMatters.slice(0, maxChips).forEach(m => {
                const prioClass = (m.priority || 'regular').toLowerCase();
                const shortTitle = m.case_number ? `${m.case_number.split('/')[0]}` : m.hearing_title;
                chipsHtml += `
                    <div class="cal-chip ${prioClass}" title="${m.case_number}: ${m.hearing_title} (${m.court_room || ''})">
                        ${shortTitle}
                    </div>
                `;
            });

            if (dayMatters.length > maxChips) {
                chipsHtml += `<span class="cal-more-chip">+${dayMatters.length - maxChips} more</span>`;
            }

            cellsHtml += `
                <div class="cal-day-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${isSunday ? 'is-court-holiday' : ''}" 
                     data-date="${dateStr}" onclick="app.selectCalendarDate('${dateStr}')">
                    <div class="cal-day-header">
                        <span class="cal-day-num">${day}</span>
                        ${dayMatters.length > 0 ? `
                            <span class="cal-matters-count ${hasUrgent ? 'has-urgent' : ''}">
                                ${dayMatters.length} ${dayMatters.length === 1 ? 'matter' : 'matters'}
                            </span>
                        ` : ''}
                        ${isSunday ? `<span style="font-size:9.5px; color:var(--accent-rose); font-weight:700;">HOLIDAY</span>` : ''}
                    </div>
                    <div class="cal-events-list">
                        ${chipsHtml}
                    </div>
                </div>
            `;
        }

        // 3. Next month leading days to complete grid
        const totalRendered = startingDay + daysInMonth;
        const totalCellsNeeded = totalRendered > 35 ? 42 : 35;
        const trailingDays = totalCellsNeeded - totalRendered;

        for (let day = 1; day <= trailingDays; day++) {
            const nextMonthDate = new Date(year, month + 1, day);
            const nYear = nextMonthDate.getFullYear();
            const nMonth = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
            const nDay = String(day).padStart(2, '0');
            const dateStr = `${nYear}-${nMonth}-${nDay}`;

            cellsHtml += `
                <div class="cal-day-cell is-other-month" data-date="${dateStr}">
                    <div class="cal-day-header">
                        <span class="cal-day-num">${day}</span>
                    </div>
                </div>
            `;
        }

        grid.innerHTML = cellsHtml;
    }

    selectCalendarDate(dateStr) {
        this.calSelectedDate = dateStr;

        // Highlight selected day cell
        document.querySelectorAll('.cal-day-cell').forEach(cell => {
            cell.classList.toggle('is-selected', cell.dataset.date === dateStr);
        });

        this.renderAgendaForDate(dateStr);
    }

    renderAgendaForDate(dateStr) {
        const titleEl = document.getElementById('agendaSelectedDateTitle');
        const container = document.getElementById('agendaListingsContainer');
        const countBadge = document.getElementById('agendaTotalListingsCount');

        if (!container) return;

        // Format Date title
        const [y, m, d] = (dateStr || '').split('-');
        const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
        const dateFormatted = dateObj.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        if (titleEl) titleEl.textContent = dateFormatted;

        // Gather all listings for date
        const allListings = [...this.calHearings];
        const existingKeys = new Set(this.calHearings.map(h => `${h.case_id}_${h.hearing_date}`));

        this.calNdohCases.forEach(nc => {
            const key = `${nc.case_id}_${nc.hearing_date}`;
            if (!existingKeys.has(key)) {
                allListings.push({
                    hearing_id: null,
                    case_id: nc.case_id,
                    hearing_title: `${nc.case_number} - ${nc.stage_purpose || 'Listed'}`,
                    hearing_type: nc.stage_purpose || 'Court Listing',
                    hearing_date: nc.hearing_date,
                    hearing_time: '10:30 AM',
                    court_room: nc.court_name,
                    item_no: nc.item_no || 'Item TBD',
                    bench: nc.bench || 'Hon\'ble Judge',
                    advocate: nc.advocate,
                    case_number: nc.case_number,
                    cino: nc.cino,
                    case_title: nc.case_title,
                    practice_area: nc.practice_area,
                    priority: nc.priority || 'Regular',
                    court_name: nc.court_name
                });
            }
        });

        const dayMatters = allListings.filter(item => item.hearing_date === dateStr);
        if (countBadge) countBadge.textContent = `${dayMatters.length} ${dayMatters.length === 1 ? 'Matter' : 'Matters'}`;

        if (dayMatters.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 30px 10px; text-align: center;">
                    <div style="font-size: 28px; margin-bottom: 8px;">🏛️</div>
                    <div style="font-weight: 600; color: var(--text-primary);">No Court Listings for this Date</div>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Click the button below to schedule an appearance or filing.</div>
                </div>
            `;
            return;
        }

        container.innerHTML = dayMatters.map(m => {
            const prioClass = (m.priority || 'regular').toLowerCase();
            return `
                <div class="agenda-item-card ${prioClass}">
                    <div class="agenda-item-header">
                        <div>
                            <div class="agenda-case-no">${m.case_number}</div>
                            <span class="badge priority-badge ${prioClass}">${m.priority || 'Regular'}</span>
                        </div>
                        <div style="display:flex; gap:6px;">
                            ${!this.isClientMode ? `<button class="btn btn-sm btn-outline" style="border-color:#25d366; color:#25d366; font-size:11px;" onclick="app.openBusinessUpdateModal(${m.case_id})">⚡ Update</button>` : ''}
                            <button class="btn btn-sm btn-outline" onclick="app.openCaseDetailModal(${m.case_id})">Open Docket</button>
                        </div>
                    </div>
                    <div class="agenda-case-title">${m.case_title}</div>
                    <div class="agenda-meta-row">
                        <div>🏛️ <strong>Venue:</strong> ${m.court_room || m.court_name || 'City Civil Court'} (${m.item_no || 'Item on Daily Board'})</div>
                        <div>⚖️ <strong>Bench:</strong> ${m.bench || 'Hon\'ble Presiding Judge'}</div>
                        <div>📋 <strong>Stage:</strong> <span class="highlight-gold">${m.hearing_type || 'Listing on Board'}</span></div>
                        <div>👤 <strong>Counsel:</strong> ${m.advocate || 'Chamber Advocate'}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async loadHearings() {
        try {
            const res = await fetch('/api/hearings');
            const data = await res.json();
            this.hearings = data;

            this.renderHearingsGrid(data);
            this.renderDashHearings(data.slice(0, 5));
        } catch (err) {
            console.error('Failed to load cause list hearings:', err);
        }
    }

    renderDashHearings(hearings) {
        const container = document.getElementById('dashHearingsList');
        if (!hearings || hearings.length === 0) {
            container.innerHTML = '<div class="empty-state">No upcoming court appearances scheduled on cause list.</div>';
            return;
        }

        container.innerHTML = hearings.map(h => {
            const parts = (h.hearing_date || '').split('-');
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const month = parts[1] ? monthNames[parseInt(parts[1], 10) - 1] : 'DATE';
            const day = parts[2] || 'TBD';

            return `
                <div class="hearing-dash-row" onclick="app.openCaseDetailModal(${h.case_id})">
                    <div class="hearing-dash-date">
                        <span class="h-month">${month}</span>
                        <span class="h-day">${day}</span>
                    </div>
                    <div class="hearing-dash-details">
                        <h5>${h.case_number}: ${h.hearing_title}</h5>
                        <p><strong>${h.court_room || 'Court Hall'} (${h.item_no || 'Item TBD'}):</strong> ${h.bench || 'Hon\'ble Presiding Judge'}</p>
                        <p style="color:var(--text-secondary); margin-top:2px;">Counsel: ${h.advocate || 'Advocate on Record'}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderHearingsGrid(hearings) {
        const container = document.getElementById('hearingsListContainer');
        if (!hearings || hearings.length === 0) {
            container.innerHTML = '<div class="empty-state">No cause list entries found. Click "Add Listing to Cause List" to add an appearance.</div>';
            return;
        }

        container.innerHTML = hearings.map(h => `
            <div class="hearing-card">
                <div class="h-card-top">
                    <span class="h-card-type">${h.hearing_type}</span>
                    <span class="badge status-badge">${h.status}</span>
                </div>
                <h4 class="h-card-title">${h.hearing_title}</h4>
                <div class="h-card-case" onclick="app.openCaseDetailModal(${h.case_id})" style="cursor:pointer">
                    📁 <strong>${h.case_number}</strong> | CNR: ${h.cino || '-'}
                    <div>${h.case_title}</div>
                </div>
                <div class="h-meta-row">
                    <div class="h-meta-item">📅 <strong>Listing Date (NDOH):</strong> ${h.hearing_date} at ${h.hearing_time || '10:30 AM'}</div>
                    <div class="h-meta-item">🏛️ <strong>Venue:</strong> ${h.court_room || 'Court Hall'} (${h.item_no || 'Item on Daily Board'})</div>
                    <div class="h-meta-item">⚖️ <strong>Coram / Bench:</strong> ${h.bench || 'Presiding Judicial Officer'}</div>
                    <div class="h-meta-item">👤 <strong>Advocate Appearing:</strong> ${h.advocate || 'Chamber Counsel'}</div>
                    ${h.daily_orders ? `<div class="h-meta-item">📝 <em>Daily Order: ${h.daily_orders}</em></div>` : ''}
                </div>
                <div class="text-right mt-2">
                    <button class="btn btn-sm btn-outline" onclick="app.deleteHearing(${h.id})">Remove</button>
                    <button class="btn btn-sm btn-primary" onclick="app.openCaseDetailModal(${h.case_id})">Open Case</button>
                </div>
            </div>
        `).join('');
    }

    async loadTasks() {
        try {
            const res = await fetch('/api/tasks');
            const data = await res.json();
            this.tasks = data;

            this.renderKanbanBoard(data);
        } catch (err) {
            console.error('Failed to load tasks:', err);
        }
    }

    renderKanbanBoard(tasks) {
        const pendingCol = document.getElementById('colPendingTasks');
        const inProgressCol = document.getElementById('colInProgressTasks');
        const completedCol = document.getElementById('colCompletedTasks');

        const pending = tasks.filter(t => t.status === 'Pending');
        const inProgress = tasks.filter(t => t.status === 'In Drafting');
        const completed = tasks.filter(t => t.status === 'Completed');

        document.getElementById('badgePendingCount').textContent = pending.length;
        document.getElementById('badgeInProgressCount').textContent = inProgress.length;
        document.getElementById('badgeCompletedCount').textContent = completed.length;

        const renderCard = (t) => `
            <div class="task-card">
                <h4>${t.title}</h4>
                ${t.case_number ? `<div class="task-case-ref" onclick="app.openCaseDetailModal(${t.case_id})" style="cursor:pointer">📁 ${t.case_number}: ${t.case_title}</div>` : ''}
                <div class="task-footer">
                    <span class="badge priority-badge ${t.priority ? t.priority.toLowerCase() : 'regular'}">${t.priority}</span>
                    <span class="task-due">📅 ${t.due_date || 'No Date'}</span>
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                    👤 ${t.assigned_to || 'Chamber Clerk'}
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:8px;">
                    <select onchange="app.updateTaskStatus(${t.id}, this.value)" style="font-size:11px; padding:2px 4px; background:var(--bg-surface); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;">
                        <option value="Pending" ${t.status === 'Pending' ? 'selected' : ''}>To-Do</option>
                        <option value="In Drafting" ${t.status === 'In Drafting' ? 'selected' : ''}>In Drafting</option>
                        <option value="Completed" ${t.status === 'Completed' ? 'selected' : ''}>Filed / Completed</option>
                    </select>
                    <button class="btn btn-sm btn-outline" style="padding:2px 6px; font-size:10px;" onclick="app.deleteTask(${t.id})">✕</button>
                </div>
            </div>
        `;

        pendingCol.innerHTML = pending.length ? pending.map(renderCard).join('') : '<div class="empty-state" style="padding:16px;">No pending drafting tasks</div>';
        inProgressCol.innerHTML = inProgress.length ? inProgress.map(renderCard).join('') : '<div class="empty-state" style="padding:16px;">No drafts under review</div>';
        completedCol.innerHTML = completed.length ? completed.map(renderCard).join('') : '<div class="empty-state" style="padding:16px;">No completed court filings</div>';
    }

    async updateTaskStatus(taskId, newStatus) {
        try {
            await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            this.showToast(`Task updated to ${newStatus}`, 'success');
            await this.loadTasks();
            await this.loadStats();
        } catch (err) {
            this.showToast('Failed to update task status', 'error');
        }
    }

    async deleteTask(taskId) {
        if (!confirm('Are you sure you want to delete this filing task?')) return;
        try {
            await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
            this.showToast('Task removed from registry queue', 'success');
            await this.loadTasks();
            await this.loadStats();
        } catch (err) {
            this.showToast('Failed to delete task', 'error');
        }
    }

    async loadClients() {
        try {
            const res = await fetch('/api/clients');
            const data = await res.json();
            this.clients = data;

            this.renderClientsGrid(data);
            this.populateClientSelects(data);
        } catch (err) {
            console.error('Failed to load clients:', err);
        }
    }

    populateClientSelects(clients) {
        const selects = ['f_client_id'];
        selects.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = '<option value="">-- Select Client from Chambers --</option>' + 
                    clients.map(c => `<option value="${c.id}">${c.name} (${c.client_type})</option>`).join('');
            }
        });
    }

    populateCaseSelects() {
        const selects = ['h_case_id', 't_case_id', 'b_case_id', 'doc_case_id'];
        selects.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = '<option value="">-- Select Court Matter / CNR --</option>' +
                    this.cases.map(c => `<option value="${c.id}">${c.case_number} - ${c.title}</option>`).join('');
            }
        });
    }

    renderClientsGrid(clients) {
        const container = document.getElementById('clientsListContainer');
        if (!clients || clients.length === 0) {
            container.innerHTML = '<div class="empty-state">No clients registered. Click "Add Client" to begin chamber intake.</div>';
            return;
        }

        const conflictMap = {
            1: { text: 'BCI Cleared (No Conflict)', class: 'cleared' },
            0: { text: 'Under BCI Verification', class: 'pending' },
            2: { text: 'Potential Conflict Flag', class: 'flagged' }
        };

        container.innerHTML = clients.map(cl => {
            const conf = conflictMap[cl.bci_conflict_check] || conflictMap[1];
            return `
                <div class="client-card">
                    <div class="client-card-header">
                        <span class="client-name">${cl.name}</span>
                        <span class="conflict-badge ${conf.class}">${conf.text}</span>
                    </div>
                    <div class="badge status-badge" style="width: fit-content;">${cl.client_type}</div>
                    <div class="client-info-list">
                        <div>📧 ${cl.email || 'No email on file'}</div>
                        <div>📞 ${cl.phone || 'No phone on file'}</div>
                        <div>🏢 ${cl.address || 'Address unlisted'}</div>
                        <div>📁 Associated Indian Court Matters: <strong>${cl.case_count || 0}</strong></div>
                        ${cl.notes ? `<div style="margin-top:4px; font-style:italic;">📝 ${cl.notes}</div>` : ''}
                    </div>
                    <div class="text-right mt-2">
                        <button class="btn btn-sm btn-outline" onclick="app.filterCasesByClient(${cl.id})">View Matters</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    filterCasesByClient(clientId) {
        const cl = this.clients.find(c => c.id === clientId);
        if (cl) {
            this.navigate('cases');
            document.getElementById('globalSearchInput').value = cl.name;
            this.loadCases({ q: cl.name });
        }
    }

    async loadBilling() {
        try {
            const res = await fetch('/api/billing');
            const data = await res.json();
            this.billing = data;

            this.renderBillingTable(data);
        } catch (err) {
            console.error('Failed to load fee ledger:', err);
        }
    }

    renderBillingTable(entries) {
        const tbody = document.getElementById('billingTableBody');
        let totalAmount = 0;
        let unbilledAmount = 0;

        entries.forEach(b => {
            const rowTotal = Number(b.amount) || 0;
            totalAmount += rowTotal;
            if (b.payment_status === 'Pending') unbilledAmount += rowTotal;
        });

        document.getElementById('billingTotalHoursVal').textContent = `${entries.length} fee vouchers`;
        document.getElementById('billingTotalAmountVal').textContent = this.formatRupees(totalAmount);
        document.getElementById('billingUnbilledVal').textContent = this.formatRupees(unbilledAmount);

        if (!entries || entries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No fee entries recorded. Click "Record Fee Voucher" to add appearance or drafting fees.</td></tr>`;
            return;
        }

        tbody.innerHTML = entries.map(b => {
            const rowTotal = Number(b.amount) || 0;
            return `
                <tr>
                    <td>${b.date}</td>
                    <td onclick="app.openCaseDetailModal(${b.case_id})" style="cursor:pointer; font-weight:600; color:var(--primary);">
                        ${b.case_number}
                    </td>
                    <td>${b.advocate_name}</td>
                    <td><span class="badge practice-badge">${b.fee_category}</span></td>
                    <td style="max-width: 280px;">${b.description}</td>
                    <td><strong>${this.formatRupees(rowTotal)}</strong></td>
                    <td><span class="font-mono text-muted">${b.receipt_no || '-'}</span></td>
                    <td><span class="badge status-badge">${b.payment_status}</span></td>
                    <td class="text-right">
                        <button class="btn btn-sm btn-outline" onclick="app.deleteBilling(${b.id})">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async deleteBilling(billId) {
        if (!confirm('Are you sure you want to delete this fee entry?')) return;
        try {
            await fetch(`/api/billing/${billId}`, { method: 'DELETE' });
            this.showToast('Fee voucher deleted', 'success');
            await this.loadBilling();
            await this.loadStats();
        } catch (err) {
            this.showToast('Failed to delete fee voucher', 'error');
        }
    }

    async deleteHearing(hearingId) {
        if (!confirm('Remove this listing from the cause list?')) return;
        try {
            await fetch(`/api/hearings/${hearingId}`, { method: 'DELETE' });
            this.showToast('Listing removed from cause list', 'success');
            await this.loadHearings();
            await this.loadStats();
        } catch (err) {
            this.showToast('Failed to remove listing', 'error');
        }
    }

    // ==========================================
    // Case Detail Modal
    // ==========================================

    async openCaseDetailModal(caseId) {
        this.currentCaseId = caseId;
        try {
            const res = await fetch(`/api/cases/${caseId}`);
            if (!res.ok) throw new Error('Matter not found');
            const c = await res.json();
            this.currentCaseData = c;
            this.renderPrintableDocket(c);

            // Populate Header
            document.getElementById('modalCaseNumber').textContent = c.case_number;
            document.getElementById('modalCaseCnr').textContent = c.cino ? `CNR: ${c.cino}` : 'No CNR Registered';
            document.getElementById('modalCaseTitle').textContent = c.title;
            
            const pBadge = document.getElementById('modalCasePriority');
            pBadge.textContent = c.priority;
            pBadge.className = `badge priority-badge ${c.priority ? c.priority.toLowerCase() : 'regular'}`;

            document.getElementById('modalCaseStatus').textContent = c.status;
            document.getElementById('modalCasePracticeArea').textContent = c.practice_area;

            // Counts for Tabs
            document.getElementById('modalTabHearingCount').textContent = c.hearings ? c.hearings.length : 0;
            document.getElementById('modalTabTaskCount').textContent = c.tasks ? c.tasks.length : 0;
            document.getElementById('modalTabDocCount').textContent = c.documents ? c.documents.length : 0;
            document.getElementById('modalTabNoteCount').textContent = c.notes ? c.notes.length : 0;

            // Overview & Coram
            document.getElementById('detCnr').textContent = c.cino || 'Not Registered';
            document.getElementById('detCourtName').textContent = c.court_name || 'City Civil Court Complex';
            document.getElementById('detJudgeName').textContent = c.bench_designation || 'Hon\'ble Presiding Judge';
            document.getElementById('detItemNo').textContent = c.court_item_no || 'Item TBD';
            document.getElementById('detStagePurpose').textContent = c.stage_purpose || 'Pleadings Stage';
            document.getElementById('detNdoh').textContent = c.date_next_list ? `📅 ${c.date_next_list}` : 'Date to be given by Court';
            document.getElementById('detJurisdiction').textContent = `${c.district_name || 'District'}, ${c.state_name || 'India'}`;

            // Parties & Representation
            document.getElementById('detPetitioner').textContent = c.petitioner || 'Petitioner';
            document.getElementById('detRespondent').textContent = c.respondent || 'Respondent';
            document.getElementById('detLeadAttorney').textContent = c.advocate_brief || 'A. LEELA KRISHNA (BA. LLB.) Advocate';
            document.getElementById('detOpposingCounsel').textContent = c.opposite_advocate || 'Opposite Advocate / GP';
            document.getElementById('detVakalatnamaStatus').textContent = c.vakalatnama_status || 'Vakalatnama Filed';
            const feeDueEl = document.getElementById('detFeeDue');
            if (feeDueEl) {
                const isDue = (c.fee_due === 'Yes');
                feeDueEl.innerHTML = isDue
                    ? `<span class="badge" style="background:rgba(239, 68, 68, 0.15); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.35); font-weight:700; padding:2px 8px; border-radius:4px;">☑ Yes (Fee Due)</span>`
                    : `<span class="badge" style="background:rgba(34, 197, 94, 0.15); color:#22c55e; border:1px solid rgba(34, 197, 94, 0.35); font-weight:700; padding:2px 8px; border-radius:4px;">☑ No (Fee Cleared)</span>`;
            }

            // Background & Strategy
            document.getElementById('detSummary').textContent = c.summary || 'No factual summary provided yet.';
            document.getElementById('detStrategyNotes').textContent = c.advocate_notes || 'No strategic litigation plan posted.';

            // Business of the Day Card & Client Mobile
            const bText = document.getElementById('detBusinessText');
            const bMeta = document.getElementById('detBusinessMeta');
            const cPhone = document.getElementById('detClientPhoneDisplay');
            if (bText) {
                bText.textContent = c.business_of_the_day || 'No court proceedings recorded for today yet. Click "Update Business" to enter daily court order and dispatch instant WhatsApp alert.';
            }
            if (bMeta) {
                bMeta.textContent = `Last Business Update: ${c.last_business_update || 'Never'} | Next Hearing (NDOH): ${c.date_next_list || 'TBD'}`;
            }
            if (cPhone) {
                cPhone.textContent = c.client_phone ? `${c.client_phone} (${c.client_name || 'Client'})` : 'No mobile registered';
            }

            // Client mode visibility toggles in Detail Modal
            const btnUpdateBiz = document.getElementById('btnUpdateBusinessDetail');
            const btnEditCase = document.getElementById('btnEditCurrentCase');
            const detBusinessBoxBtn = document.querySelector('#detBusinessBox button');
            const stratCard = document.getElementById('detStrategyNotes')?.closest('.detail-card');

            if (this.isClientMode) {
                if (btnUpdateBiz) btnUpdateBiz.style.display = 'none';
                if (btnEditCase) btnEditCase.style.display = 'none';
                if (detBusinessBoxBtn) detBusinessBoxBtn.style.display = 'none';
                if (stratCard) stratCard.style.display = 'none'; // Privileged chamber strategy notes
            } else {
                if (btnUpdateBiz) btnUpdateBiz.style.display = 'inline-flex';
                if (btnEditCase) btnEditCase.style.display = 'inline-flex';
                if (detBusinessBoxBtn) detBusinessBoxBtn.style.display = 'inline-flex';
                if (stratCard) stratCard.style.display = 'block';
            }

            // Render Sub-Lists
            this.renderCaseHearingsSubList(c.hearings || []);
            this.renderCaseTasksSubList(c.tasks || []);
            this.renderCaseDocumentsSubList(c.documents || []);
            this.renderCaseBillingSubList(c.billing || [], c);
            this.renderCaseNotesSubList(c.notes || []);

            // Open Modal
            document.getElementById('caseDetailModal').classList.remove('hidden');
        } catch (err) {
            this.showToast('Failed to load case details', 'error');
        }
    }

    closeCaseDetailModal() {
        document.getElementById('caseDetailModal').classList.add('hidden');
    }

    async toggleCaseFeeDue() {
        if (!this.currentCaseId) return;
        const c = this.currentCaseData || this.cases.find(item => item.id === this.currentCaseId);
        const nextVal = (c && c.fee_due === 'Yes') ? 'No' : 'Yes';
        try {
            const res = await fetch(`/api/cases/${this.currentCaseId}/fee-due`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fee_due: nextVal })
            });
            if (!res.ok) throw new Error('Failed to update fee status');
            const updated = await res.json();
            if (this.currentCaseData) this.currentCaseData.fee_due = updated.fee_due;
            const targetInList = this.cases.find(item => item.id === this.currentCaseId);
            if (targetInList) targetInList.fee_due = updated.fee_due;
            
            // Re-render detail modal fee row
            const feeDueEl = document.getElementById('detFeeDue');
            if (feeDueEl) {
                const isDue = (updated.fee_due === 'Yes');
                feeDueEl.innerHTML = isDue
                    ? `<span class="badge" style="background:rgba(239, 68, 68, 0.15); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.35); font-weight:700; padding:2px 8px; border-radius:4px;">☑ Yes (Fee Due)</span>`
                    : `<span class="badge" style="background:rgba(34, 197, 94, 0.15); color:#22c55e; border:1px solid rgba(34, 197, 94, 0.35); font-weight:700; padding:2px 8px; border-radius:4px;">☑ No (Fee Cleared)</span>`;
            }
            this.showToast(`Fee Due updated to: ${updated.fee_due}`, 'success');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }

    async printSelectedCaseDocket(caseId) {
        const targetId = caseId || this.currentCaseId;
        if (!targetId) {
            this.showToast('Please select or open a case to print its docket', 'warning');
            return;
        }

        try {
            let caseData = this.currentCaseData;
            if (!caseData || caseData.id !== Number(targetId)) {
                const res = await fetch(`/api/cases/${targetId}`);
                if (!res.ok) throw new Error('Case not found');
                caseData = await res.json();
                this.currentCaseData = caseData;
            }

            this.renderPrintableDocket(caseData);

            // Small delay to ensure browser layout is updated before triggering print dialog
            setTimeout(() => {
                window.print();
            }, 120);
        } catch (err) {
            console.error('Error preparing print docket:', err);
            this.showToast('Failed to prepare print docket for this matter', 'error');
        }
    }

    renderPrintableDocket(c) {
        const container = document.getElementById('printableCourtDocket');
        if (!container) return;

        if (!c) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; font-family:sans-serif;">
                    <div style="font-size:11px; font-weight:800; letter-spacing:1.5px; color:#64748b;">OFFICE OF THE</div>
                    <h2 style="font-size:20px; margin:4px 0 6px 0;">cLAWssroom</h2>
                    <div style="font-size:14px; font-weight:700; color:#0f172a;">A. LEELA KRISHNA (BA. LLB.) Advocate</div>
                    <div style="font-size:11.5px; color:#475569;">Telangana State High Court and Supreme Court of India &bull; Bar Council: TS/3581/2018</div>
                    <p style="color:#64748b; font-size:13px; margin-top:16px;">No matter selected. Please select a case from the eCourts docket vault to print.</p>
                </div>
            `;
            return;
        }

        const partyTitle = c.title || `${c.petitioner || 'Petitioner'} v. ${c.respondent || 'Respondent'}`;
        const printDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const filingDate = c.filing_date || (c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : 'Registered');
        const isFeeDue = (c.fee_due === 'Yes' || c.fee_due === 'yes' || c.fee_due === true);

        const hearingsRows = (c.hearings && c.hearings.length > 0)
            ? c.hearings.map(h => `
                <tr>
                    <td><strong>${this.escapeHtml(h.hearing_date || '-')}</strong></td>
                    <td>${this.escapeHtml(h.item_no || '-')} ${h.court_room ? `(${this.escapeHtml(h.court_room)})` : ''}</td>
                    <td>${this.escapeHtml(h.bench || '-')}</td>
                    <td>${this.escapeHtml(h.hearing_title || h.hearing_type || '-')}</td>
                    <td>${this.escapeHtml(h.daily_orders || '-')}</td>
                </tr>
            `).join('')
            : '';

        container.innerHTML = `
            <!-- Chambers Official Docket Letterhead -->
            <div class="print-header">
                <div class="print-brand">
                    <div class="print-emblem">⚖️</div>
                    <div class="print-chambers-info">
                        <div class="print-office-label">OFFICE OF THE</div>
                        <h2>cLAWssroom</h2>
                        <div class="print-advocate-name">A. LEELA KRISHNA (BA. LLB.) Advocate</div>
                        <div class="print-sub">Telangana State High Court and Supreme Court of India</div>
                        <div class="print-enrollment">Bar Council Enrollment No. TS/3581/2018</div>
                        <div class="print-address">Address for Services: Plot No. 94/95, AVR Signature, Sri Viswamithra Enclave-1, Koheda Road, Toroor, Hayathnagar, Ranga Reddy District-501505</div>
                        <div class="print-contact">E-mail: leela.kris4u@gmail.com &bull; WhatsApp: +91-9493489498 &bull; Cell: +91-8121578785</div>
                    </div>
                </div>
                <div class="print-meta-box">
                    <div><strong>CNR:</strong> ${this.escapeHtml(c.cino) || 'NOT REGISTERED'}</div>
                    <div><strong>DOCKET NO:</strong> ${this.escapeHtml(c.case_number)}</div>
                    <div><strong>PRINTED:</strong> ${printDate}</div>
                    <div><strong>STATUS:</strong> ${this.escapeHtml(c.status || 'Active')}</div>
                </div>
            </div>

            <!-- Case Banner -->
            <div class="print-case-banner">
                <div class="print-case-title">${this.escapeHtml(partyTitle)}</div>
                <div class="print-case-badges">
                    <span>Court: <strong>${this.escapeHtml(c.court_name || 'Competent Court')}</strong></span> &bull; 
                    <span>Practice Area: <strong>${this.escapeHtml(c.practice_area || 'General Practice')}</strong></span> &bull; 
                    <span>Priority: <strong>${this.escapeHtml(c.priority || 'Regular')}</strong></span>
                </div>
            </div>

            <!-- Section I: Coram & Listing Particulars -->
            <div class="print-section">
                <div class="print-sec-title">I. Coram, Bench &amp; Listing Particulars</div>
                <table class="print-table">
                    <tr>
                        <td class="lbl">Court / Forum</td>
                        <td class="val highlight">${this.escapeHtml(c.court_name || 'City Civil Court')}</td>
                        <td class="lbl">Bench / Coram</td>
                        <td class="val">${this.escapeHtml(c.bench_designation || 'Hon\'ble Presiding Judge')}</td>
                    </tr>
                    <tr>
                        <td class="lbl">Case / Suit No.</td>
                        <td class="val highlight">${this.escapeHtml(c.case_number)}</td>
                        <td class="lbl">CNR Number</td>
                        <td class="val" style="font-family:monospace; font-weight:700;">${this.escapeHtml(c.cino) || 'Not Registered'}</td>
                    </tr>
                    <tr>
                        <td class="lbl">Court Item No.</td>
                        <td class="val">${this.escapeHtml(c.court_item_no || 'Item TBD')}</td>
                        <td class="lbl">Stage / Purpose</td>
                        <td class="val highlight">${this.escapeHtml(c.stage_purpose || 'Pleadings')}</td>
                    </tr>
                    <tr>
                        <td class="lbl">Next Listing (NDOH)</td>
                        <td class="val highlight" style="font-weight:700;">${c.date_next_list ? '📅 ' + this.escapeHtml(c.date_next_list) : 'To be notified'}</td>
                        <td class="lbl">Jurisdiction District / State</td>
                        <td class="val">${this.escapeHtml((c.district_name || 'District') + ', ' + (c.state_name || 'India'))}</td>
                    </tr>
                </table>
            </div>

            <!-- Section II: Parties & Legal Representation -->
            <div class="print-section">
                <div class="print-sec-title">II. Parties &amp; Legal Representation</div>
                <table class="print-table">
                    <tr>
                        <td class="lbl">Petitioner / Plaintiff</td>
                        <td class="val highlight">${this.escapeHtml(c.petitioner || 'Petitioner')}</td>
                        <td class="lbl">Chamber Lead Counsel</td>
                        <td class="val highlight">${this.escapeHtml(c.advocate_brief || 'A. LEELA KRISHNA (BA. LLB.) Advocate')}</td>
                    </tr>
                    <tr>
                        <td class="lbl">Respondent / Defendant</td>
                        <td class="val">${this.escapeHtml(c.respondent || 'Respondent')}</td>
                        <td class="lbl">Opposing Counsel / GP</td>
                        <td class="val">${this.escapeHtml(c.opposite_advocate || 'Opposite Advocate / GP')}</td>
                    </tr>
                    <tr>
                        <td class="lbl">Client Information</td>
                        <td class="val">${this.escapeHtml(c.client_name ? `${c.client_name} (${c.client_phone || 'No phone'})` : (c.client_phone || 'Registered Client'))}</td>
                        <td class="lbl">Vakalatnama Status</td>
                        <td class="val highlight">${this.escapeHtml(c.vakalatnama_status || 'Vakalatnama Filed')}</td>
                    </tr>
                    <tr>
                        <td class="lbl">Fee Due</td>
                        <td class="val highlight" style="font-weight:700;">
                            <span style="display:inline-flex; align-items:center; gap:16px;">
                                <span style="${isFeeDue ? 'color:#0f172a; font-weight:800;' : 'color:#64748b;'}">
                                    <span style="font-size:14px;">${isFeeDue ? '☑' : '☐'}</span> Yes
                                </span>
                                <span style="${!isFeeDue ? 'color:#0f172a; font-weight:800;' : 'color:#64748b;'}">
                                    <span style="font-size:14px;">${!isFeeDue ? '☑' : '☐'}</span> No
                                </span>
                            </span>
                        </td>
                        <td class="lbl">Filing / Intake Date</td>
                        <td class="val">${filingDate}</td>
                    </tr>
                </table>
            </div>

            <!-- Section III: Latest Court Business / Order (if available) -->
            ${c.business_of_the_day ? `
            <div class="print-section">
                <div class="print-sec-title">III. Latest Court Proceedings &amp; Daily Order</div>
                <div class="print-box-content">${this.escapeHtml(c.business_of_the_day)}</div>
            </div>
            ` : ''}

            <!-- Section IV: Factual Synopsis -->
            <div class="print-section">
                <div class="print-sec-title">${c.business_of_the_day ? 'IV' : 'III'}. Factual Synopsis &amp; Background</div>
                <div class="print-box-content">${this.escapeHtml(c.summary || 'No factual synopsis recorded.')}</div>
            </div>

            <!-- Section V: Privileged Counsel Strategy (hidden in client mode) -->
            ${!this.isClientMode && c.advocate_notes ? `
            <div class="print-section">
                <div class="print-sec-title">${c.business_of_the_day ? 'V' : 'IV'}. Confidential Litigation Strategy &amp; Counsel Notes</div>
                <div class="print-box-content">${this.escapeHtml(c.advocate_notes)}</div>
            </div>
            ` : ''}

            <!-- Cause List & Daily Orders History -->
            ${hearingsRows ? `
            <div class="print-section">
                <div class="print-sec-title">Cause List Appearances &amp; Order Sheet Record (${c.hearings.length})</div>
                <table class="print-hearings-table">
                    <thead>
                        <tr>
                            <th style="width: 14%;">Listing Date</th>
                            <th style="width: 14%;">Item / Room</th>
                            <th style="width: 24%;">Bench / Coram</th>
                            <th style="width: 20%;">Purpose / Stage</th>
                            <th style="width: 28%;">Proceedings / Order Sheet</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${hearingsRows}
                    </tbody>
                </table>
            </div>
            ` : ''}

            <!-- Footer / Signature Block -->
            <div class="print-footer-signature">
                <div class="sig-left">
                    <strong>OFFICE OF THE cLAWssroom &bull; ADVOCATE-CLIENT PRIVILEGE</strong><br>
                    <strong>A. LEELA KRISHNA (BA. LLB.) Advocate &bull; Bar Council: TS/3581/2018</strong><br>
                    Plot No. 94/95, AVR Signature, Sri Viswamithra Enclave-1, Koheda Road, Toroor, Hayathnagar, Ranga Reddy Dist-501505<br>
                    E-mail: leela.kris4u@gmail.com &bull; WhatsApp: +91-9493489498 &bull; Cell: +91-8121578785<br>
                    Matter: ${this.escapeHtml(c.case_number)} | CNR: ${this.escapeHtml(c.cino || 'N/A')}
                </div>
                <div class="sig-right">
                    <div class="sig-line">____________________________________________</div>
                    <div class="sig-name">A. LEELA KRISHNA (BA. LLB.)</div>
                    <div class="sig-title">Advocate, Telangana State High Court &amp; Supreme Court of India</div>
                    <div class="sig-title" style="font-size: 7.5pt; color: #475569; margin-top: 2px;">Bar Council Enrollment No. TS/3581/2018</div>
                </div>
            </div>
        `;
    }

    renderCaseHearingsSubList(hearings) {
        const container = document.getElementById('caseHearingsList');
        if (!hearings || hearings.length === 0) {
            container.innerHTML = '<div class="empty-state">No scheduled court appearances on cause list for this matter.</div>';
            return;
        }

        container.innerHTML = hearings.map(h => `
            <div class="hearing-dash-row">
                <div class="hearing-dash-date">
                    <span class="h-month">${h.hearing_date.split('-')[1]}</span>
                    <span class="h-day">${h.hearing_date.split('-')[2]}</span>
                </div>
                <div class="hearing-dash-details">
                    <h5>${h.hearing_title} (${h.hearing_type})</h5>
                    <p>📍 ${h.court_room || 'Court Hall'} - ${h.item_no || 'Item TBD'} | ⏰ ${h.hearing_time || '10:30 AM'} | ⚖️ ${h.bench || 'Coram'}</p>
                    ${h.daily_orders ? `<p style="font-style:italic; margin-top:2px;">Order Sheet Note: ${h.daily_orders}</p>` : ''}
                </div>
                <button class="btn btn-sm btn-outline" onclick="app.deleteHearing(${h.id})">Delete</button>
            </div>
        `).join('');
    }

    renderCaseTasksSubList(tasks) {
        const container = document.getElementById('caseTasksList');
        if (!tasks || tasks.length === 0) {
            container.innerHTML = '<div class="empty-state">No chamber registry deadlines or drafting tasks.</div>';
            return;
        }

        container.innerHTML = tasks.map(t => `
            <div class="task-card" style="margin-bottom: 10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h4>${t.title}</h4>
                    <span class="badge priority-badge ${t.priority ? t.priority.toLowerCase() : 'regular'}">${t.priority}</span>
                </div>
                <div class="task-footer">
                    <span>Due: <strong>${t.due_date || 'No Date'}</strong> | Assignee: ${t.assigned_to || 'Chamber Clerk'}</span>
                    <select onchange="app.updateTaskStatus(${t.id}, this.value)" style="font-size:11px; padding:2px 4px; background:var(--bg-surface); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;">
                        <option value="Pending" ${t.status === 'Pending' ? 'selected' : ''}>To-Do</option>
                        <option value="In Drafting" ${t.status === 'In Drafting' ? 'selected' : ''}>In Drafting</option>
                        <option value="Completed" ${t.status === 'Completed' ? 'selected' : ''}>Filed / Completed</option>
                    </select>
                </div>
            </div>
        `).join('');
    }

    renderCaseDocumentsSubList(documents) {
        const tbody = document.getElementById('caseDocumentsList');
        if (!documents || documents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No pleadings, vakalatnamas or annexures indexed for this matter.</td></tr>';
            return;
        }

        tbody.innerHTML = documents.map(d => `
            <tr>
                <td style="font-weight:600;">📄 ${d.title}</td>
                <td><span class="badge practice-badge">${d.category}</span></td>
                <td><span style="font-family:var(--font-mono);">${d.annexure_no || '-'}</span></td>
                <td>${d.file_type} (${d.file_size})</td>
                <td><span class="badge status-badge">${d.tags || '-'}</span></td>
                <td class="text-right">
                    <button class="btn btn-sm btn-outline" onclick="app.deleteDocument(${d.id})">Delete</button>
                </td>
            </tr>
        `).join('');
    }

    async deleteDocument(docId) {
        if (!confirm('Remove this indexed pleading / document from the chamber vault?')) return;
        try {
            await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
            this.showToast('Document unindexed', 'success');
            if (this.currentCaseId) this.openCaseDetailModal(this.currentCaseId);
        } catch (err) {
            this.showToast('Failed to delete document', 'error');
        }
    }

    renderCaseBillingSubList(entries, caseObj) {
        const tbody = document.getElementById('caseBillingList');
        document.getElementById('detHearingFeeDisplay').textContent = this.formatRupees(caseObj.appearance_fee || 15000);
        document.getElementById('detRetainerBalance').textContent = this.formatRupees(caseObj.fee_received || 0);

        if (!entries || entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No fee vouchers recorded for this matter.</td></tr>';
            return;
        }

        tbody.innerHTML = entries.map(b => {
            const rowTotal = Number(b.amount) || 0;
            return `
                <tr>
                    <td>${b.date}</td>
                    <td>${b.advocate_name}</td>
                    <td><span class="badge practice-badge">${b.fee_category}</span></td>
                    <td style="max-width: 250px;">${b.description}</td>
                    <td><strong>${this.formatRupees(rowTotal)}</strong></td>
                    <td><span class="badge status-badge">${b.payment_status}</span></td>
                    <td class="text-right">
                        <button class="btn btn-sm btn-outline" onclick="app.deleteBilling(${b.id})">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    renderCaseNotesSubList(notes) {
        const container = document.getElementById('caseNotesList');
        if (!notes || notes.length === 0) {
            container.innerHTML = '<div class="empty-state">No chamber diary entries or court proceedings recorded. Use the box above to write strategic logs.</div>';
            return;
        }

        container.innerHTML = notes.map(n => `
            <div class="note-card">
                <div class="note-card-header">
                    <span class="note-author">✍️ ${n.author}</span>
                    <span class="note-category-tag">${n.diary_category}</span>
                    <span class="note-date">${n.created_at || 'Just now'}</span>
                    <button class="btn btn-sm btn-outline" style="padding:2px 5px; font-size:10px;" onclick="app.deleteCaseNote(${n.id})">✕</button>
                </div>
                <div class="note-content">${n.entry}</div>
                ${n.citation_ref ? `<div class="note-citation">📚 Precedent: ${n.citation_ref}</div>` : ''}
            </div>
        `).join('');
    }

    async saveCaseNote() {
        if (!this.currentCaseId) return;
        const author = document.getElementById('newNoteAuthor').value.trim() || 'Chamber Advocate';
        const category = document.getElementById('newNoteCategory').value;
        const citation = document.getElementById('newNoteCitation').value.trim();
        const content = document.getElementById('newNoteContent').value.trim();

        if (!content) {
            this.showToast('Please type a court diary note before submitting', 'error');
            return;
        }

        try {
            await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    case_id: this.currentCaseId,
                    author,
                    diary_category: category,
                    entry: content,
                    citation_ref: citation
                })
            });

            document.getElementById('newNoteContent').value = '';
            document.getElementById('newNoteCitation').value = '';
            this.showToast('Chamber diary entry saved', 'success');
            await this.openCaseDetailModal(this.currentCaseId);
        } catch (err) {
            this.showToast('Failed to save note', 'error');
        }
    }

    async deleteCaseNote(noteId) {
        if (!confirm('Delete this diary entry?')) return;
        try {
            await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
            this.showToast('Diary entry deleted', 'success');
            if (this.currentCaseId) this.openCaseDetailModal(this.currentCaseId);
        } catch (err) {
            this.showToast('Failed to delete note', 'error');
        }
    }

    // ==========================================
    // Modals: Case Intake & Edit
    // ==========================================

    setCaseSubmitMode(mode) {
        this.caseSubmitMode = mode || 'save';
    }

    checkDraftBadge() {
        const pill = document.getElementById('quickDraftPill');
        if (!pill) return;
        const draft = localStorage.getItem('clawssroom_vakalat_draft');
        if (draft) {
            pill.classList.remove('hidden');
        } else {
            pill.classList.add('hidden');
        }
    }

    saveCaseDraft() {
        const cino = document.getElementById('f_cino').value.trim();
        const caseNumber = document.getElementById('f_case_number').value.trim();
        const pet = document.getElementById('f_petitioner').value.trim();
        const res = document.getElementById('f_respondent').value.trim();

        if (!pet && !caseNumber && !cino) {
            this.showToast('Please enter at least a Petitioner, Case Number, or CNR to save draft.', 'warning');
            return;
        }

        const draft = {
            caseId: document.getElementById('caseFormId').value || '',
            cino: cino,
            case_type: document.getElementById('f_case_type').value || 'OS',
            case_number: caseNumber,
            petitioner: pet,
            respondent: res,
            client_id: document.getElementById('f_client_id').value || '',
            practice_area: document.getElementById('f_practice_area').value,
            status: 'Draft / Intake in Progress',
            stage_purpose: document.getElementById('f_stage_purpose').value.trim(),
            priority: document.getElementById('f_priority').value,
            court_name: document.getElementById('f_court_name').value.trim(),
            bench_designation: document.getElementById('f_bench_designation').value.trim(),
            state_district: document.getElementById('f_state_district').value.trim(),
            court_item_no: document.getElementById('f_court_item_no').value.trim(),
            date_next_list: document.getElementById('f_date_next_list').value || '',
            advocate_brief: document.getElementById('f_advocate_brief').value.trim(),
            opposite_advocate: document.getElementById('f_opposite_advocate').value.trim(),
            vakalatnama_status: document.getElementById('f_vakalatnama_status').value,
            fee_due: document.getElementById('f_fee_due')?.value || 'No',
            appearance_fee: document.getElementById('f_appearance_fee').value,
            fee_received: document.getElementById('f_fee_received').value,
            summary: document.getElementById('f_summary').value.trim(),
            advocate_notes: document.getElementById('f_advocate_notes').value.trim(),
            savedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        };

        localStorage.setItem('clawssroom_vakalat_draft', JSON.stringify(draft));
        this.closeModal('caseFormModal');
        this.checkDraftBadge();
        this.showToast('📝 Vakalat intake saved as Draft! You can resume it anytime.', 'info');
    }

    restoreCaseDraft() {
        const saved = localStorage.getItem('clawssroom_vakalat_draft');
        if (!saved) return;
        try {
            const d = JSON.parse(saved);
            if (d.caseId) document.getElementById('caseFormId').value = d.caseId;
            if (d.cino) document.getElementById('f_cino').value = d.cino;
            if (d.case_type) document.getElementById('f_case_type').value = d.case_type;
            if (d.case_number) document.getElementById('f_case_number').value = d.case_number;
            if (d.petitioner) document.getElementById('f_petitioner').value = d.petitioner;
            if (d.respondent) document.getElementById('f_respondent').value = d.respondent;
            if (d.client_id) document.getElementById('f_client_id').value = d.client_id;
            if (d.practice_area) document.getElementById('f_practice_area').value = d.practice_area;
            if (d.stage_purpose) document.getElementById('f_stage_purpose').value = d.stage_purpose;
            if (d.priority) document.getElementById('f_priority').value = d.priority;
            if (d.court_name) document.getElementById('f_court_name').value = d.court_name;
            if (d.bench_designation) document.getElementById('f_bench_designation').value = d.bench_designation;
            if (d.state_district) document.getElementById('f_state_district').value = d.state_district;
            if (d.court_item_no) document.getElementById('f_court_item_no').value = d.court_item_no;
            if (d.date_next_list) document.getElementById('f_date_next_list').value = d.date_next_list;
            if (d.advocate_brief) document.getElementById('f_advocate_brief').value = d.advocate_brief;
            if (d.opposite_advocate) document.getElementById('f_opposite_advocate').value = d.opposite_advocate;
            if (d.vakalatnama_status) document.getElementById('f_vakalatnama_status').value = d.vakalatnama_status;
            if (d.fee_due && document.getElementById('f_fee_due')) document.getElementById('f_fee_due').value = d.fee_due;
            if (d.appearance_fee) document.getElementById('f_appearance_fee').value = d.appearance_fee;
            if (d.fee_received) document.getElementById('f_fee_received').value = d.fee_received;
            if (d.summary) document.getElementById('f_summary').value = d.summary;
            if (d.advocate_notes) document.getElementById('f_advocate_notes').value = d.advocate_notes;

            const banner = document.getElementById('caseDraftNoticeBanner');
            if (banner) banner.classList.add('hidden');
            this.showToast('✓ Restored draft intake details!', 'success');
        } catch (e) {
            console.error('Failed to parse draft', e);
        }
    }

    discardCaseDraft() {
        localStorage.removeItem('clawssroom_vakalat_draft');
        const banner = document.getElementById('caseDraftNoticeBanner');
        if (banner) banner.classList.add('hidden');
        this.checkDraftBadge();
        this.showToast('Intake draft discarded.', 'info');
    }

    openNewCaseModal() {
        document.getElementById('caseForm').reset();
        document.getElementById('caseFormId').value = '';
        document.getElementById('caseFormModalTitle').textContent = 'New Vakalat Intake & eCourts Filing';
        
        // Populate client dropdown
        this.populateClientSelects(this.clients);

        // Pre-fill CNR number format
        const randNum = Math.floor(100000 + Math.random() * 900000);
        document.getElementById('f_cino').value = `TSRA${randNum}2026`;
        document.getElementById('f_case_number').value = `OS No. ${Math.floor(100 + Math.random() * 900)}/2026`;
        document.getElementById('f_state_district').value = 'Telangana, Rangareddy';
        document.getElementById('f_advocate_brief').value = 'A. LEELA KRISHNA (BA. LLB.) Advocate';
        if (document.getElementById('f_fee_due')) document.getElementById('f_fee_due').value = 'No';

        // Check if an unsaved draft exists
        const savedDraft = localStorage.getItem('clawssroom_vakalat_draft');
        const draftBanner = document.getElementById('caseDraftNoticeBanner');
        if (savedDraft && draftBanner) {
            try {
                const d = JSON.parse(savedDraft);
                const titleSummary = (d.petitioner ? `${d.petitioner} v. ${d.respondent || '...'}` : d.case_number) || 'Draft Matter';
                const summaryEl = document.getElementById('draftSavedSummary');
                if (summaryEl) summaryEl.textContent = `${titleSummary} (${d.savedAt || 'saved draft'})`;
                draftBanner.classList.remove('hidden');
            } catch (err) {
                draftBanner.classList.add('hidden');
            }
        } else if (draftBanner) {
            draftBanner.classList.add('hidden');
        }

        // Configure Save, Save & Next, and Add buttons for new intake
        const saveLabel = document.getElementById('btnCaseSaveLabel');
        if (saveLabel) saveLabel.textContent = 'Save Case';
        const nextLabel = document.getElementById('btnCaseSaveNextLabel');
        if (nextLabel) nextLabel.textContent = 'Save & Next';
        const addLabel = document.getElementById('btnCaseAddLabel');
        if (addLabel) addLabel.textContent = 'Save & Add Another Case';
        const draftBtn = document.getElementById('btnCaseSaveDraft');
        if (draftBtn) draftBtn.style.display = 'inline-flex';
        const addBtn = document.getElementById('btnCaseAddOption');
        if (addBtn) addBtn.style.display = 'inline-flex';
        this.caseSubmitMode = 'save';

        this.openModal('caseFormModal');
    }

    openEditCaseModal(caseId) {
        const c = this.cases.find(item => item.id === caseId);
        if (!c) return;

        // Hide draft banner during explicit matter edit
        const draftBanner = document.getElementById('caseDraftNoticeBanner');
        if (draftBanner) draftBanner.classList.add('hidden');

        document.getElementById('caseFormModalTitle').textContent = `Edit Matter: ${c.case_number}`;
        document.getElementById('caseFormId').value = c.id;
        document.getElementById('f_cino').value = c.cino || '';
        document.getElementById('f_case_type').value = c.case_type || 'OS';
        document.getElementById('f_case_number').value = c.case_number;
        document.getElementById('f_petitioner').value = c.petitioner || '';
        document.getElementById('f_respondent').value = c.respondent || '';
        document.getElementById('f_client_id').value = c.client_id || '';
        document.getElementById('f_practice_area').value = c.practice_area;
        document.getElementById('f_status').value = c.status;
        document.getElementById('f_stage_purpose').value = c.stage_purpose || '';
        document.getElementById('f_priority').value = c.priority || 'Regular';
        document.getElementById('f_court_name').value = c.court_name || '';
        document.getElementById('f_bench_designation').value = c.bench_designation || '';
        document.getElementById('f_state_district').value = `${c.state_name || 'Telangana'}, ${c.district_name || 'Rangareddy'}`;
        document.getElementById('f_court_item_no').value = c.court_item_no || '';
        document.getElementById('f_date_next_list').value = c.date_next_list || '';
        document.getElementById('f_advocate_brief').value = c.advocate_brief || '';
        document.getElementById('f_opposite_advocate').value = c.opposite_advocate || '';
        document.getElementById('f_vakalatnama_status').value = c.vakalatnama_status || 'Vakalatnama Filed';
        if (document.getElementById('f_fee_due')) document.getElementById('f_fee_due').value = (c.fee_due === 'Yes' ? 'Yes' : 'No');
        document.getElementById('f_appearance_fee').value = c.appearance_fee || 15000;
        document.getElementById('f_fee_received').value = c.fee_received || 25000;
        document.getElementById('f_summary').value = c.summary || '';
        document.getElementById('f_advocate_notes').value = c.advocate_notes || '';

        // Configure Save, Save & Next, and Add buttons for editing
        const saveLabel = document.getElementById('btnCaseSaveLabel');
        if (saveLabel) saveLabel.textContent = 'Save Changes';
        const nextLabel = document.getElementById('btnCaseSaveNextLabel');
        if (nextLabel) nextLabel.textContent = 'Save & Next Step';
        const addLabel = document.getElementById('btnCaseAddLabel');
        if (addLabel) addLabel.textContent = 'Save as New Intake';
        const draftBtn = document.getElementById('btnCaseSaveDraft');
        if (draftBtn) draftBtn.style.display = 'none';
        const addBtn = document.getElementById('btnCaseAddOption');
        if (addBtn) addBtn.style.display = 'inline-flex';
        this.caseSubmitMode = 'save';

        this.openModal('caseFormModal');
    }

    async handleCaseFormSubmit(e) {
        e.preventDefault();
        const caseId = document.getElementById('caseFormId').value;
        const pet = document.getElementById('f_petitioner').value.trim();
        const res = document.getElementById('f_respondent').value.trim();
        const stateDist = document.getElementById('f_state_district').value.split(',');
        const state = stateDist[0] ? stateDist[0].trim() : 'Telangana';
        const district = stateDist[1] ? stateDist[1].trim() : 'Rangareddy';

        const payload = {
            cino: document.getElementById('f_cino').value.trim(),
            case_type: document.getElementById('f_case_type').value,
            case_number: document.getElementById('f_case_number').value.trim(),
            title: `${pet} v. ${res}`,
            petitioner: pet,
            respondent: res,
            client_id: document.getElementById('f_client_id').value || null,
            practice_area: document.getElementById('f_practice_area').value,
            status: document.getElementById('f_status').value,
            stage_purpose: document.getElementById('f_stage_purpose').value.trim(),
            priority: document.getElementById('f_priority').value,
            court_name: document.getElementById('f_court_name').value.trim(),
            bench_designation: document.getElementById('f_bench_designation').value.trim(),
            court_item_no: document.getElementById('f_court_item_no').value.trim(),
            state_name: state,
            district_name: district,
            date_next_list: document.getElementById('f_date_next_list').value || null,
            advocate_brief: document.getElementById('f_advocate_brief').value.trim(),
            opposite_advocate: document.getElementById('f_opposite_advocate').value.trim(),
            vakalatnama_status: document.getElementById('f_vakalatnama_status').value,
            fee_due: document.getElementById('f_fee_due')?.value || 'No',
            appearance_fee: Number(document.getElementById('f_appearance_fee').value) || 15000,
            fee_received: Number(document.getElementById('f_fee_received').value) || 0,
            summary: document.getElementById('f_summary').value.trim(),
            advocate_notes: document.getElementById('f_advocate_notes').value.trim()
        };

        const submitMode = this.caseSubmitMode || 'save';

        try {
            // If editing an existing case and user clicked 'Save as New Intake', create a new case
            const isClone = caseId && submitMode === 'add_another';
            const targetCaseId = isClone ? '' : caseId;

            const url = targetCaseId ? `/api/cases/${targetCaseId}` : '/api/cases';
            const method = targetCaseId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to save matter');
            }

            const savedCase = await res.json();
            await this.loadCases();
            await this.loadStats();

            // Clear any active draft on successful submission
            localStorage.removeItem('clawssroom_vakalat_draft');
            this.checkDraftBadge();

            if (targetCaseId) {
                // Case was updated
                this.closeModal('caseFormModal');
                this.showToast(`Case ${payload.case_number} updated successfully!`, 'success');
                if (submitMode === 'save_and_next') {
                    this.currentCaseId = Number(targetCaseId);
                    this.openNewHearingForCurrentCase();
                } else if (this.currentCaseId === Number(targetCaseId)) {
                    await this.openCaseDetailModal(Number(targetCaseId));
                }
                return;
            }

            // Case was newly added
            const newCaseId = savedCase.id;
            this.currentCaseId = newCaseId;

            if (submitMode === 'add_another') {
                this.showToast(`✓ Case ${payload.case_number} recorded! Intake form ready for next case.`, 'success');
                this.openNewCaseModal();
            } else if (submitMode === 'save_and_next') {
                this.closeModal('caseFormModal');
                this.showToast(`✓ Case ${payload.case_number} recorded in docket! Step 2: Schedule First Court Listing (NDOH)...`, 'success');
                this.openNewHearingForCurrentCase();
            } else {
                this.closeModal('caseFormModal');
                this.showToast(`✓ Case ${payload.case_number} recorded in chambers docket!`, 'success');
                this.openPostAddModal(savedCase);
            }
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }

    openPostAddModal(c) {
        if (!c) return;
        this.currentCaseId = c.id;
        const titleEl = document.getElementById('postAddCaseTitle');
        if (titleEl) titleEl.textContent = `${c.case_number}: ${c.title || (c.petitioner + ' v. ' + c.respondent)}`;
        const numEl = document.getElementById('postAddCaseNumber');
        if (numEl) numEl.textContent = c.case_number || 'Court Matter';
        const cnrEl = document.getElementById('postAddCaseCnr');
        if (cnrEl) cnrEl.textContent = c.cino || 'CNR Not Assigned';
        const prioEl = document.getElementById('postAddCasePriority');
        if (prioEl) prioEl.textContent = c.priority || 'Regular';
        const statEl = document.getElementById('postAddCaseStatus');
        if (statEl) statEl.textContent = c.status || 'Active Matter';
        const partiesEl = document.getElementById('postAddParties');
        if (partiesEl) partiesEl.textContent = `${c.petitioner || 'Petitioner'} v. ${c.respondent || 'Respondent'}`;
        const courtEl = document.getElementById('postAddCourt');
        if (courtEl) courtEl.textContent = `${c.court_name || 'Court Establishment'} • ${c.bench_designation || 'Hon\'ble Presiding Bench'}`;

        this.openModal('casePostAddModal');
    }

    async postAddViewDocket() {
        this.closeModal('casePostAddModal');
        if (this.currentCaseId) {
            await this.openCaseDetailModal(this.currentCaseId);
        }
    }

    postAddDoneAndReturn() {
        this.closeModal('casePostAddModal');
        this.navigate('cases');
        this.showToast('Matter saved in eCourts Case Vault.', 'info');
    }

    postAddAction(action) {
        this.closeModal('casePostAddModal');
        if (action === 'add_hearing') {
            this.openNewHearingForCurrentCase();
        } else if (action === 'add_task') {
            this.openNewTaskForCurrentCase();
        } else if (action === 'add_doc') {
            this.openNewDocModal();
        } else if (action === 'add_fee') {
            this.openNewBillingForCurrentCase();
        } else if (action === 'add_another_case') {
            this.openNewCaseModal();
        }
    }

    // ==========================================
    // Modals: Hearings, Tasks, Clients, Billing, Documents
    // ==========================================

    openNewHearingModal() {
        document.getElementById('hearingForm').reset();
        this.populateCaseSelects();
        this.openModal('hearingFormModal');
    }

    openNewHearingForCurrentCase() {
        this.openNewHearingModal();
        if (this.currentCaseId) {
            document.getElementById('h_case_id').value = this.currentCaseId;
            const c = this.cases.find(i => i.id === this.currentCaseId);
            if (c) {
                document.getElementById('h_courtroom').value = c.court_name || 'Court Hall 1';
                document.getElementById('h_bench').value = c.bench_designation || '';
                document.getElementById('h_attorney').value = c.advocate_brief || 'A. LEELA KRISHNA (BA. LLB.) Advocate';
                if (c.date_next_list) {
                    document.getElementById('h_hearing_date').value = c.date_next_list;
                }
                if (c.stage_purpose) {
                    document.getElementById('h_title').value = c.stage_purpose;
                }
            }
        }
    }

    async handleHearingSubmit(e) {
        e.preventDefault();
        const payload = {
            case_id: Number(document.getElementById('h_case_id').value),
            hearing_title: document.getElementById('h_title').value.trim(),
            hearing_type: document.getElementById('h_hearing_type').value,
            hearing_date: document.getElementById('h_hearing_date').value,
            court_room: document.getElementById('h_courtroom').value.trim(),
            item_no: document.getElementById('h_item_no').value.trim(),
            bench: document.getElementById('h_bench').value.trim(),
            advocate: document.getElementById('h_attorney').value.trim(),
            notes: document.getElementById('h_notes').value.trim(),
            status: 'Scheduled'
        };

        try {
            await fetch('/api/hearings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            this.closeModal('hearingFormModal');
            this.showToast('Listing added to Daily Cause List!', 'success');
            await this.loadHearings();
            await this.loadStats();
            if (this.currentCaseId && this.currentCaseId === payload.case_id) {
                await this.openCaseDetailModal(this.currentCaseId);
            }
        } catch (err) {
            this.showToast('Failed to schedule listing', 'error');
        }
    }

    openNewTaskModal() {
        document.getElementById('taskForm').reset();
        this.populateCaseSelects();
        this.openModal('taskFormModal');
    }

    openNewTaskForCurrentCase() {
        this.openNewTaskModal();
        if (this.currentCaseId) {
            document.getElementById('t_case_id').value = this.currentCaseId;
        }
    }

    async handleTaskSubmit(e) {
        e.preventDefault();
        const payload = {
            case_id: document.getElementById('t_case_id').value ? Number(document.getElementById('t_case_id').value) : null,
            title: document.getElementById('t_title').value.trim(),
            assigned_to: document.getElementById('t_assigned_to').value.trim(),
            due_date: document.getElementById('t_due_date').value,
            priority: document.getElementById('t_priority').value,
            status: document.getElementById('t_status').value
        };

        try {
            await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            this.closeModal('taskFormModal');
            this.showToast('Drafting / Filing task created', 'success');
            await this.loadTasks();
            await this.loadStats();
            if (this.currentCaseId && this.currentCaseId === payload.case_id) {
                await this.openCaseDetailModal(this.currentCaseId);
            }
        } catch (err) {
            this.showToast('Failed to create task', 'error');
        }
    }

    openNewClientModal() {
        document.getElementById('clientForm').reset();
        this.openModal('clientFormModal');
    }

    async handleClientSubmit(e) {
        e.preventDefault();
        const payload = {
            name: document.getElementById('cl_name').value.trim(),
            client_type: document.getElementById('cl_client_type').value,
            bci_conflict_check: Number(document.getElementById('cl_conflict_check').value),
            email: document.getElementById('cl_email').value.trim(),
            phone: document.getElementById('cl_phone').value.trim(),
            address: document.getElementById('cl_address').value.trim(),
            notes: document.getElementById('cl_notes').value.trim()
        };

        try {
            await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            this.closeModal('clientFormModal');
            this.showToast(`Client ${payload.name} added to roster!`, 'success');
            await this.loadClients();
            await this.loadStats();
        } catch (err) {
            this.showToast('Failed to register client', 'error');
        }
    }

    openNewBillingModal() {
        document.getElementById('billingForm').reset();
        this.populateCaseSelects();
        document.getElementById('b_date').value = new Date().toISOString().split('T')[0];
        document.getElementById('b_receipt_no').value = `RCP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        this.openModal('billingFormModal');
    }

    openNewBillingForCurrentCase() {
        this.openNewBillingModal();
        if (this.currentCaseId) {
            document.getElementById('b_case_id').value = this.currentCaseId;
            const c = this.cases.find(i => i.id === this.currentCaseId);
            if (c) {
                document.getElementById('b_amount').value = c.appearance_fee || 15000;
                document.getElementById('b_attorney').value = c.advocate_brief || 'A. LEELA KRISHNA (BA. LLB.) Advocate';
            }
        }
    }

    async handleBillingSubmit(e) {
        e.preventDefault();
        const payload = {
            case_id: Number(document.getElementById('b_case_id').value),
            date: document.getElementById('b_date').value,
            advocate_name: document.getElementById('b_attorney').value.trim(),
            amount: Number(document.getElementById('b_amount').value),
            fee_category: document.getElementById('b_activity_type').value,
            payment_status: document.getElementById('b_status').value,
            receipt_no: document.getElementById('b_receipt_no').value.trim(),
            description: document.getElementById('b_description').value.trim()
        };

        try {
            await fetch('/api/billing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            this.closeModal('billingFormModal');
            this.showToast('Fee voucher saved to chamber ledger!', 'success');
            await this.loadBilling();
            await this.loadStats();
            if (this.currentCaseId && this.currentCaseId === payload.case_id) {
                await this.openCaseDetailModal(this.currentCaseId);
            }
        } catch (err) {
            this.showToast('Failed to save fee voucher', 'error');
        }
    }

    openNewDocModal() {
        document.getElementById('docForm').reset();
        this.populateCaseSelects();
        if (this.currentCaseId) {
            document.getElementById('doc_case_id').value = this.currentCaseId;
        }
        this.openModal('docFormModal');
    }

    async handleDocSubmit(e) {
        e.preventDefault();
        const payload = {
            case_id: Number(document.getElementById('doc_case_id').value),
            title: document.getElementById('doc_title').value.trim(),
            category: document.getElementById('doc_category').value,
            annexure_no: document.getElementById('doc_bates_number').value.trim(),
            file_type: document.getElementById('doc_file_type').value,
            file_size: document.getElementById('doc_file_size').value.trim(),
            tags: document.getElementById('doc_tags').value.trim(),
            summary: document.getElementById('doc_summary').value.trim()
        };

        try {
            await fetch('/api/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            this.closeModal('docFormModal');
            this.showToast('Pleading / Annexure indexed in chamber vault!', 'success');
            if (this.currentCaseId && this.currentCaseId === payload.case_id) {
                await this.openCaseDetailModal(this.currentCaseId);
            }
        } catch (err) {
            this.showToast('Failed to index document', 'error');
        }
    }

    // ==========================================
    // Client Portal Access Mode (Phone Login & Scoping)
    // ==========================================

    openClientLoginModal() {
        const errEl = document.getElementById('clientLoginError');
        if (errEl) {
            errEl.style.display = 'none';
            errEl.textContent = '';
        }
        document.getElementById('clientLoginForm').reset();
        this.openModal('clientLoginModal');
    }

    fillLoginPhone(phone) {
        const phoneInput = document.getElementById('clientLoginPhone');
        if (phoneInput) {
            phoneInput.value = phone;
            phoneInput.focus();
        }
    }

    openClientLoginModal() {
        const errEl = document.getElementById('clientLoginError');
        const otpErrEl = document.getElementById('clientOtpError');
        if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
        if (otpErrEl) { otpErrEl.style.display = 'none'; otpErrEl.textContent = ''; }

        // Reset forms
        const step1 = document.getElementById('clientLoginStep1');
        const step2 = document.getElementById('clientLoginStep2');
        if (step1) { 
            step1.classList.remove('hidden'); 
            step1.reset(); 
        }
        if (step2) { 
            step2.classList.add('hidden'); 
            step2.reset(); 
        }
        const nameInput = document.getElementById('clientLoginName');
        if (nameInput) nameInput.value = '';

        this.selectOtpChannel('WhatsApp');
        this.stopOtpTimer();
        this.activeOtp = null;
        this.activePhone = null;

        this.openModal('clientLoginModal');
    }

    selectOtpChannel(channel) {
        this.selectedOtpChannel = channel;
        const cardWa = document.getElementById('channelCardWhatsApp');
        const cardSms = document.getElementById('channelCardSMS');
        const radioWa = document.querySelector('input[name="otpDeliveryChannel"][value="WhatsApp"]');
        const radioSms = document.querySelector('input[name="otpDeliveryChannel"][value="SMS"]');
        const iconEl = document.getElementById('btnRequestOtpIcon');
        const textEl = document.getElementById('btnRequestOtpText');

        if (cardWa && cardSms) {
            if (channel === 'WhatsApp') {
                cardWa.classList.add('selected');
                cardSms.classList.remove('selected');
                if (radioWa) radioWa.checked = true;
                if (iconEl) iconEl.textContent = '📲';
                if (textEl) textEl.textContent = 'Send WhatsApp OTP →';
            } else {
                cardSms.classList.add('selected');
                cardWa.classList.remove('selected');
                if (radioSms) radioSms.checked = true;
                if (iconEl) iconEl.textContent = '💬';
                if (textEl) textEl.textContent = 'Send SMS OTP →';
            }
        }
    }

    fillLoginPhone(phone) {
        const phoneInput = document.getElementById('clientLoginPhone');
        if (phoneInput) {
            phoneInput.value = phone;
            phoneInput.focus();
        }
    }

    async handleRequestOtp(e) {
        if (e) e.preventDefault();
        const rawPhone = document.getElementById('clientLoginPhone').value.trim();
        const rawName = (document.getElementById('clientLoginName')?.value || '').trim();
        const errEl = document.getElementById('clientLoginError');
        if (errEl) errEl.style.display = 'none';

        if (!rawPhone) {
            if (errEl) {
                errEl.textContent = 'Please enter a 10-digit Indian mobile number.';
                errEl.style.display = 'block';
            }
            return;
        }

        try {
            const res = await fetch('/api/client/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: rawPhone,
                    name: rawName,
                    channel: this.selectedOtpChannel
                })
            });
            const data = await res.json();

            if (!res.ok) {
                if (errEl) {
                    errEl.textContent = data.error || 'Failed to generate OTP. Please try again.';
                    errEl.style.display = 'block';
                }
                return;
            }

            // Save target phone
            this.activeOtp = null;
            this.activePhone = rawPhone;

            // Transition to Step 2
            document.getElementById('clientLoginStep1').classList.add('hidden');
            const step2 = document.getElementById('clientLoginStep2');
            step2.classList.remove('hidden');

            document.getElementById('step2TargetPhone').textContent = data.phone;
            const badge = document.getElementById('step2TargetBadge');
            if (badge) {
                badge.textContent = `Via ${data.channel}`;
                badge.style.background = data.channel === 'WhatsApp' ? '#128c7e' : '#0284c7';
            }

            const otpInput = document.getElementById('clientLoginOtp');
            if (otpInput) {
                otpInput.value = '';
                otpInput.focus();
            }

            this.startOtpTimer(data.expires_in_seconds || 300);
            this.showToast(`One-Time Password (OTP) dispatched via ${data.channel}!`, 'success');
        } catch (err) {
            console.error('Request OTP failed:', err);
            if (errEl) {
                errEl.textContent = 'Network or server error while generating OTP. Please retry.';
                errEl.style.display = 'block';
            }
        }
    }

    startOtpTimer(seconds) {
        this.stopOtpTimer();
        let remaining = seconds;
        const countdownEl = document.getElementById('otpCountdown');

        const updateDisplay = () => {
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            if (countdownEl) {
                countdownEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            }
            if (remaining <= 0) {
                this.stopOtpTimer();
                if (countdownEl) countdownEl.textContent = 'Expired';
            }
            remaining--;
        };

        updateDisplay();
        this.otpCountdownInterval = setInterval(updateDisplay, 1000);
    }

    stopOtpTimer() {
        if (this.otpCountdownInterval) {
            clearInterval(this.otpCountdownInterval);
            this.otpCountdownInterval = null;
        }
    }

    autoFillOtp() {
        if (this.activeOtp) {
            const otpInput = document.getElementById('clientLoginOtp');
            if (otpInput) {
                otpInput.value = this.activeOtp;
                otpInput.focus();
            }
            this.showToast('OTP code auto-filled!', 'info');
        }
    }

    backToStep1() {
        this.stopOtpTimer();
        document.getElementById('clientLoginStep2').classList.add('hidden');
        document.getElementById('clientLoginStep1').classList.remove('hidden');
        const otpErr = document.getElementById('clientOtpError');
        if (otpErr) otpErr.style.display = 'none';
    }

    async resendOtp(channel) {
        if (!this.activePhone) return;
        this.selectedOtpChannel = channel;
        const phoneInput = document.getElementById('clientLoginPhone');
        if (phoneInput) phoneInput.value = this.activePhone;
        await this.handleRequestOtp(null);
    }

    async handleVerifyOtp(e) {
        e.preventDefault();
        const otpCode = document.getElementById('clientLoginOtp').value.trim();
        const errEl = document.getElementById('clientOtpError');
        if (errEl) errEl.style.display = 'none';

        if (!otpCode || otpCode.length !== 6) {
            if (errEl) {
                errEl.textContent = 'Please enter the complete 6-digit verification code.';
                errEl.style.display = 'block';
            }
            return;
        }

        try {
            const res = await fetch('/api/client/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: this.activePhone,
                    otp: otpCode
                })
            });
            const data = await res.json();

            if (!res.ok) {
                if (errEl) {
                    errEl.textContent = data.error || 'Verification failed. Please check OTP.';
                    errEl.style.display = 'block';
                }
                return;
            }

            // Successfully authenticated
            this.stopOtpTimer();
            this.isClientMode = true;
            this.loggedInClient = data.client;
            this.closeModal('clientLoginModal');

            // Setup banner
            document.getElementById('cbClientName').textContent = data.client.name;
            document.getElementById('cbClientPhone').textContent = data.client.phone;
            document.getElementById('cbCasesScope').textContent = `Showing strictly your ${data.cases_count} registered matter(s)`;
            document.getElementById('clientPortalBanner').classList.remove('hidden');

            // Hide advocate action buttons
            const newCaseBtn = document.getElementById('btnQuickNewCase');
            if (newCaseBtn) newCaseBtn.style.display = 'none';
            const clientLoginBtn = document.getElementById('btnOpenClientLogin');
            if (clientLoginBtn) clientLoginBtn.style.display = 'none';

            // Load and restrict to client data
            await this.loadClientPortalData(data.client.id);

            // Switch to cases vault
            this.navigate('cases');
            this.showToast(`OTP Verified! Welcome, ${data.client.name}. Accessing your matters.`, 'success');
        } catch (err) {
            console.error('OTP Verification error:', err);
            if (errEl) {
                errEl.textContent = 'Server error during OTP verification. Please retry.';
                errEl.style.display = 'block';
            }
        }
    }

    async loadClientPortalData(clientId) {
        try {
            const res = await fetch(`/api/client/portal-data?client_id=${clientId}`);
            if (!res.ok) throw new Error('Failed to load client portal data');
            const data = await res.json();
            this.clientPortalData = data;

            // Restrict in-memory cases and hearings
            this.cases = data.cases || [];
            this.hearings = data.hearings || [];
            this.billing = data.billing || [];

            // Update badges
            const navCaseBadge = document.getElementById('navCaseCount');
            if (navCaseBadge) navCaseBadge.textContent = this.cases.length;
            const navHearBadge = document.getElementById('navHearingCount');
            if (navHearBadge) navHearBadge.textContent = this.hearings.length;
            const navCalBadge = document.getElementById('navCalendarCount');
            if (navCalBadge) navCalBadge.textContent = this.hearings.length;

            // Render tables
            this.renderCasesTable(this.cases);
            this.renderHearingsGrid(this.hearings);
            this.renderBillingTable(this.billing);
        } catch (err) {
            console.error('Error fetching client portal data:', err);
            this.showToast('Could not load case data for client', 'error');
        }
    }

    async logoutClientPortal() {
        this.isClientMode = false;
        this.loggedInClient = null;
        this.clientPortalData = null;

        // Hide banner
        document.getElementById('clientPortalBanner').classList.add('hidden');

        // Restore advocate action buttons
        const newCaseBtn = document.getElementById('btnQuickNewCase');
        if (newCaseBtn) newCaseBtn.style.display = 'inline-flex';
        const clientLoginBtn = document.getElementById('btnOpenClientLogin');
        if (clientLoginBtn) clientLoginBtn.style.display = 'inline-flex';

        // Reload full advocate data
        await this.loadCases();
        await this.loadHearings();
        await this.loadCalendarData();
        await this.loadStats();
        await this.loadBilling();

        this.showToast('Logged out of Client Portal. Restored full Advocate Chambers view.', 'info');
        this.navigate('dashboard');
    }

    // ==========================================
    // Business of the Day & WhatsApp Push
    // ==========================================

    openBusinessUpdateModal(caseId) {
        const cId = caseId || this.currentCaseId;
        if (!cId) {
            this.showToast('Please select a court matter first', 'warning');
            return;
        }

        const c = this.cases.find(item => item.id == cId);
        if (!c) {
            this.showToast('Case record not loaded in memory', 'error');
            return;
        }

        document.getElementById('buCaseId').value = c.id;
        document.getElementById('buCaseNumberTitle').textContent = `${c.case_number} | ${c.petitioner} v. ${c.respondent}`;
        document.getElementById('buBusinessText').value = c.business_of_the_day || '';
        document.getElementById('buNdoh').value = c.date_next_list || '';
        document.getElementById('buStagePurpose').value = c.stage_purpose || '';
        document.getElementById('buCourtItemNo').value = c.court_item_no || '';
        
        const clientLabel = document.getElementById('buClientPhoneLabel');
        if (clientLabel) {
            clientLabel.textContent = `Client: ${c.client_name || 'Registered Litigant'} (${c.client_phone || 'No phone registered'})`;
        }

        this.updateWhatsAppLivePreview();
        this.openModal('businessUpdateModal');
    }

    updateWhatsAppLivePreview() {
        const caseId = document.getElementById('buCaseId').value;
        const c = this.cases.find(item => item.id == caseId) || {};

        const businessText = document.getElementById('buBusinessText').value.trim() || '[Court proceedings / order sheet entry will appear here]';
        const ndoh = document.getElementById('buNdoh').value || '[NDOH TBD]';
        const stage = document.getElementById('buStagePurpose').value.trim() || (c.stage_purpose || '[Next Stage]');
        const courtItem = document.getElementById('buCourtItemNo').value.trim() || (c.court_item_no || 'Item on Daily Board');

        const now = new Date();
        const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        const formattedMsg = 
`⚖️ *OFFICE OF THE cLAWssroom*
*A. LEELA KRISHNA (BA. LLB.) Advocate*
*Telangana State High Court and Supreme Court of India*
*Bar Council Reg: TS/3581/2018*
━━━━━━━━━━━━━━━━━━━━━━━━
🏛️ *Court:* ${c.court_name || 'City Civil Court Complex'}
📋 *Matter:* ${c.case_number || 'Case Record'}
🏷️ *CNR:* ${c.cino || 'eCourts CIS'}
👥 *Cause Title:* ${c.petitioner || 'Petitioner'} v. ${c.respondent || 'Respondent'}
📍 *Item No:* ${courtItem}

📅 *Hearing Date:* ${dateStr}
📝 *Business of the Day:*
${businessText}

📌 *Next Date of Hearing (NDOH):* ${ndoh}
🎯 *Next Stage / Purpose:* ${stage}
━━━━━━━━━━━━━━━━━━━━━━━━
_Chambers: Plot No. 94/95, AVR Signature, Sri Viswamithra Enclave-1, Koheda Road, Toroor, Hayathnagar, Ranga Reddy District-501505_
_WhatsApp: +91-9493489498 | Cell: +91-8121578785 | Email: leela.kris4u@gmail.com_`;

        const previewBox = document.getElementById('whatsappLivePreviewBox');
        if (previewBox) {
            previewBox.textContent = formattedMsg;
        }
    }

    async handleBusinessUpdateSubmit(e) {
        e.preventDefault();
        const caseId = document.getElementById('buCaseId').value;
        if (!caseId) return;

        const payload = {
            business_of_the_day: document.getElementById('buBusinessText').value.trim(),
            date_next_list: document.getElementById('buNdoh').value,
            stage_purpose: document.getElementById('buStagePurpose').value.trim(),
            court_item_no: document.getElementById('buCourtItemNo').value.trim(),
            send_whatsapp: document.getElementById('buSendWhatsapp').checked
        };

        try {
            const res = await fetch(`/api/cases/${caseId}/update-business`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (!res.ok) {
                this.showToast(data.error || 'Failed to update business of the day', 'error');
                return;
            }

            this.closeModal('businessUpdateModal');
            this.showToast('Court Business of the Day updated successfully!', 'success');

            // If WhatsApp was dispatched, show confirmation modal
            if (data.whatsapp && data.whatsapp.sent) {
                document.getElementById('waResClientName').textContent = data.whatsapp.client_name || 'Registered Client';
                document.getElementById('waResPhone').textContent = data.whatsapp.phone || '-';
                document.getElementById('waResMessageText').textContent = data.whatsapp.message || '';
                
                const directLink = document.getElementById('waResDirectLink');
                if (directLink) {
                    directLink.href = data.whatsapp.wa_link || '#';
                }
                this.openModal('whatsappResultModal');
            }

            // Refresh app state
            if (this.isClientMode && this.loggedInClient) {
                await this.loadClientPortalData(this.loggedInClient.id);
            } else {
                await this.loadCases();
                await this.loadCalendarData();
                await this.loadHearings();
                await this.loadStats();
            }

            // If detail modal is open for this case, refresh it
            if (this.currentCaseId && this.currentCaseId == caseId) {
                await this.openCaseDetailModal(caseId);
            }
        } catch (err) {
            console.error('Business update submit failed:', err);
            this.showToast('Network error while saving business of the day', 'error');
        }
    }

    // Helper functions
    openModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }

    showUrgentCases() {
        this.navigate('cases');
        document.getElementById('caseFilterPriority').value = 'Urgent';
        this.applyCaseFilters();
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
}

// Global App Instance
const app = new IndianLegalPortalApp();
