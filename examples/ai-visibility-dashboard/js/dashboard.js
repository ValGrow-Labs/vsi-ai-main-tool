/**
 * AI Visibility Dashboard — Multi-User Controller
 * Handles session management, role-based views, data rendering, and modals.
 */

class AIVisibilityDashboard {
    constructor() {
        this.currentUser = null;
        this.data = { aiQueries: [], users: [] };
        this.selectedClientFilter = '';
        this.currentResultData = null;
        this.currentResultTab = 'google';
        this.platformChart = null;
        this.init();
    }

    async init() {
        // Check auth first
        const session = await apiGetSession();
        if (!session.authenticated) {
            window.location.href = 'login.html';
            return;
        }

        this.currentUser = session.user;
        this.applyRoleUI();
        this.setupNavigation();
        this.setupModals();
        await this.loadData();
        this.renderDashboard();
    }

    applyRoleUI() {
        const isAdmin = this.currentUser.role === 'admin';

        // Show/hide admin elements
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });

        // Hide admin-only table columns for non-admins
        document.querySelectorAll('.admin-only-col').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });

        // User sidebar info
        document.getElementById('sidebar-avatar').textContent = (this.currentUser.name || 'U')[0].toUpperCase();
        document.getElementById('sidebar-user-name').textContent = this.currentUser.name;
        document.getElementById('sidebar-user-role').textContent = this.currentUser.role;

        // Settings account info
        document.getElementById('setting-user-name').textContent = this.currentUser.name;
        document.getElementById('setting-user-email').textContent = this.currentUser.email;
        document.getElementById('setting-user-role').textContent = this.currentUser.role.charAt(0).toUpperCase() + this.currentUser.role.slice(1);
    }

    async loadData() {
        // Load AI queries
        this.data.aiQueries = await fetchAiQueries(this.selectedClientFilter);

        // If admin, also load users
        if (this.currentUser.role === 'admin') {
            this.data.users = await apiListUsers();
            this.populateClientSelectors();
        }
    }

    populateClientSelectors() {
        const clients = this.data.users.filter(u => u.role === 'client');
        const selectors = ['client-filter', 'ai-client-filter', 'chatgpt-client-filter', 'new-ai-query-client'];

        selectors.forEach(selectorId => {
            const sel = document.getElementById(selectorId);
            if (!sel) return;

            const currentValue = sel.value;

            if (selectorId === 'new-ai-query-client') {
                sel.innerHTML = '<option value="">-- Select Client --</option>';
            } else {
                sel.innerHTML = '<option value="">All Clients</option>';
            }

            clients.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = `${c.name} (${c.company || 'No Company'})`;
                sel.appendChild(opt);
            });

            sel.value = currentValue;
        });
    }

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item[data-view]');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;

                // Update active nav
                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');

                // Show/hide views
                document.querySelectorAll('.page-view').forEach(v => {
                    v.style.display = 'none';
                    v.classList.remove('active');
                });
                const targetView = document.getElementById('view-' + view);
                if (targetView) {
                    targetView.style.display = 'block';
                    targetView.classList.add('active');
                }

                // Render view-specific content
                this.onViewChange(view);
            });
        });

        // Client filter change events
        ['client-filter', 'ai-client-filter', 'chatgpt-client-filter'].forEach(filterId => {
            const el = document.getElementById(filterId);
            if (el) {
                el.addEventListener('change', async () => {
                    this.selectedClientFilter = el.value;
                    // Sync all selectors
                    ['client-filter', 'ai-client-filter', 'chatgpt-client-filter'].forEach(id => {
                        const other = document.getElementById(id);
                        if (other) other.value = this.selectedClientFilter;
                    });
                    await this.loadData();
                    this.renderDashboard();
                    this.renderAiQueries();
                    this.renderChatGPT();
                });
            }
        });
    }

    onViewChange(view) {
        switch (view) {
            case 'dashboard':
                this.renderDashboard();
                break;
            case 'ai-queries':
                this.renderAiQueries();
                break;
            case 'chatgpt':
                this.renderChatGPT();
                break;
            case 'clients':
                this.renderClients();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    // ==========================================
    // DASHBOARD OVERVIEW
    // ==========================================

    renderDashboard() {
        const queries = this.data.aiQueries;
        const checkedQueries = queries.filter(q => q.status === 'Checked' && q.latest_result);

        const totalQueries = queries.length;
        let googleMentions = 0;
        let chatgptMentions = 0;

        checkedQueries.forEach(q => {
            const r = q.latest_result;
            if (r.google && r.google.brand_mentioned) googleMentions++;
            if (r.chatgpt && r.chatgpt.brand_mentioned) chatgptMentions++;
        });

        const checked = checkedQueries.length;
        const visibilityScore = checked > 0
            ? Math.round(((googleMentions + chatgptMentions) / (checked * 2)) * 100)
            : 0;

        document.getElementById('stat-total-queries').textContent = totalQueries;
        document.getElementById('stat-google-mentions').textContent = googleMentions;
        document.getElementById('stat-chatgpt-mentions').textContent = chatgptMentions;
        document.getElementById('stat-visibility-score').textContent = visibilityScore + '%';

        // Visibility bar
        const bar = document.getElementById('stat-visibility-bar');
        bar.style.width = visibilityScore + '%';
        bar.style.background = visibilityScore >= 60
            ? 'linear-gradient(90deg, #059669, #10b981)'
            : visibilityScore >= 30
                ? 'linear-gradient(90deg, #d97706, #f59e0b)'
                : 'linear-gradient(90deg, #dc2626, #ef4444)';

        // Badge
        const badge = document.getElementById('stat-visibility-badge');
        if (visibilityScore >= 60) {
            badge.textContent = 'Strong';
            badge.className = 'badge badge-success';
        } else if (visibilityScore >= 30) {
            badge.textContent = 'Moderate';
            badge.className = 'badge badge-warning';
        } else {
            badge.textContent = 'Weak';
            badge.className = 'badge badge-danger';
        }

        // Recent Checks Feed
        this.renderRecentChecks(checkedQueries);

        // Platform chart
        this.renderPlatformChart(googleMentions, chatgptMentions, checked);
    }

    renderRecentChecks(checkedQueries) {
        const container = document.getElementById('recent-checks-feed');
        const recent = [...checkedQueries]
            .sort((a, b) => new Date(b.last_checked) - new Date(a.last_checked))
            .slice(0, 8);

        if (recent.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    <div style="font-weight: 500; margin-bottom: 0.25rem;">No recent checks</div>
                    <div style="font-size: 0.85rem;">Run queries to see recent activity here.</div>
                </div>`;
            return;
        }

        container.innerHTML = recent.map(q => {
            const r = q.latest_result;
            const google = r.google?.brand_mentioned;
            const chatgpt = r.chatgpt?.brand_mentioned;

            return `
                <div class="feed-item" style="cursor: pointer;" onclick="window.dashboard.viewAiResult('${q.id}')">
                    <div class="feed-header">
                        <div class="feed-source">${q.query}</div>
                        <span class="feed-time">${this.timeAgo(q.last_checked)}</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                        <span class="badge ${google ? 'badge-success' : 'badge-danger'}">Google: ${google ? 'Yes' : 'No'}</span>
                        <span class="badge ${chatgpt ? 'badge-success' : 'badge-danger'}">ChatGPT: ${chatgpt ? 'Yes' : 'No'}</span>
                    </div>
                </div>`;
        }).join('');
    }

    renderPlatformChart(googleMentions, chatgptMentions, totalChecked) {
        const ctx = document.getElementById('platformComparisonChart');
        if (!ctx) return;

        if (this.platformChart) this.platformChart.destroy();

        this.platformChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Google AI Overview', 'ChatGPT'],
                datasets: [
                    {
                        label: 'Mentioned',
                        data: [googleMentions, chatgptMentions],
                        backgroundColor: ['rgba(16, 185, 129, 0.7)', 'rgba(99, 102, 241, 0.7)'],
                        borderRadius: 8
                    },
                    {
                        label: 'Not Mentioned',
                        data: [totalChecked - googleMentions, totalChecked - chatgptMentions],
                        backgroundColor: ['rgba(239, 68, 68, 0.3)', 'rgba(239, 68, 68, 0.3)'],
                        borderRadius: 8
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }

    // ==========================================
    // AI OVERVIEW TRACKING
    // ==========================================

    renderAiQueries() {
        const tbody = document.querySelector('#ai-queries-table tbody');
        const queries = this.data.aiQueries;
        const isAdmin = this.currentUser.role === 'admin';

        if (queries.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="${isAdmin ? 8 : 7}" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    No queries tracked yet.${isAdmin ? ' Click "Add Query" to start tracking.' : ''}
                </td></tr>`;
            return;
        }

        const userMap = {};
        this.data.users.forEach(u => userMap[u.id] = u);

        tbody.innerHTML = queries.map(q => {
            const r = q.latest_result;
            const google = r?.google;
            const googleMentioned = google?.brand_mentioned;
            const googleError = google?.error;
            const competitors = google?.competitors_mentioned || [];

            const client = userMap[q.client_id];

            return `
                <tr>
                    <td style="font-weight: 500;">${this.escapeHtml(q.query)}</td>
                    <td>${this.escapeHtml(q.brand_name || '—')}</td>
                    ${isAdmin ? `<td class="admin-only-col">${client ? this.escapeHtml(client.name) : '<span style="color: var(--text-muted);">Unassigned</span>'}</td>` : ''}
                    <td>
                        <span class="badge ${q.status === 'Checked' ? 'badge-success' : q.status === 'Checking...' ? 'badge-warning' : 'badge-neutral'}">
                            ${q.status || 'Pending'}
                        </span>
                    </td>
                    <td>
                        ${googleError
                    ? '<span class="badge badge-neutral">Error</span>'
                    : google
                        ? `<span class="badge ${googleMentioned ? 'badge-success' : 'badge-danger'}">${googleMentioned ? 'Yes' : 'No'}</span>`
                        : '<span class="badge badge-neutral">—</span>'
                }
                    </td>
                    <td>
                        ${competitors.length > 0
                    ? `<div style="display:flex; flex-wrap:wrap; gap:0.25rem;">${competitors.slice(0, 3).map(c => `<span class="badge badge-neutral" style="font-size: 0.7rem;">${this.escapeHtml(c)}</span>`).join('')}${competitors.length > 3 ? `<span class="badge badge-neutral" style="font-size: 0.7rem;">+${competitors.length - 3}</span>` : ''}</div>`
                    : '<span style="color: var(--text-muted); font-size: 0.85rem;">—</span>'}
                    </td>
                    <td style="font-size: 0.85rem; color: var(--text-muted);">
                        ${q.last_checked ? this.timeAgo(q.last_checked) : 'Never'}
                    </td>
                    <td>
                        <div style="display: flex; gap: 0.5rem;">
                            ${r ? `<button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" onclick="window.dashboard.viewAiResult('${q.id}')">View</button>` : ''}
                            <button class="btn btn-primary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" onclick="window.dashboard.runAiCheck('${q.id}')">Check</button>
                            ${isAdmin ? `<button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; color: var(--danger-text);" onclick="window.dashboard.deleteAiQuery('${q.id}')">Delete</button>` : ''}
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    // ==========================================
    // CHATGPT TRACKING VIEW
    // ==========================================

    renderChatGPT() {
        const tbody = document.querySelector('#chatgpt-table tbody');
        const queries = this.data.aiQueries.filter(q => q.latest_result?.chatgpt);
        const isAdmin = this.currentUser.role === 'admin';

        if (queries.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="${isAdmin ? 7 : 6}" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    No ChatGPT results available yet. Run checks on queries in the AI Tracking view.
                </td></tr>`;
            return;
        }

        const userMap = {};
        this.data.users.forEach(u => userMap[u.id] = u);

        tbody.innerHTML = queries.map(q => {
            const r = q.latest_result.chatgpt;
            const mentioned = r.brand_mentioned;
            const sentiment = r.sentiment || 'unknown';
            const client = userMap[q.client_id];

            const sentimentBadge = sentiment === 'positive' ? 'badge-success'
                : sentiment === 'negative' ? 'badge-danger'
                    : 'badge-warning';

            return `
                <tr>
                    <td style="font-weight: 500;">${this.escapeHtml(q.query)}</td>
                    <td>${this.escapeHtml(q.brand_name || '—')}</td>
                    ${isAdmin ? `<td class="admin-only-col">${client ? this.escapeHtml(client.name) : '—'}</td>` : ''}
                    <td>
                        <span class="badge ${mentioned ? 'badge-success' : 'badge-danger'}">
                            ${mentioned ? 'Yes' : 'No'}
                        </span>
                    </td>
                    <td>
                        <span class="badge ${sentimentBadge}" style="text-transform: capitalize;">${sentiment}</span>
                    </td>
                    <td style="font-size: 0.85rem; color: var(--text-muted);">
                        ${q.last_checked ? this.timeAgo(q.last_checked) : 'Never'}
                    </td>
                    <td>
                        <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;"
                            onclick="window.dashboard.viewAiResult('${q.id}')">View Response</button>
                    </td>
                </tr>`;
        }).join('');
    }

    // ==========================================
    // CLIENT MANAGEMENT (Admin Only)
    // ==========================================

    async renderClients() {
        const tbody = document.querySelector('#clients-table tbody');
        this.data.users = await apiListUsers();
        const clients = this.data.users.filter(u => u.role === 'client');

        if (clients.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    No clients yet. Click "Add Client" to create one.
                </td></tr>`;
            return;
        }

        // Count queries per client
        const allQueries = await fetchAiQueries('');
        const qCounts = {};
        allQueries.forEach(q => {
            const cid = q.client_id || '';
            qCounts[cid] = (qCounts[cid] || 0) + 1;
        });

        tbody.innerHTML = clients.map(c => {
            return `
                <tr>
                    <td style="font-weight: 500;">${this.escapeHtml(c.name)}</td>
                    <td>${this.escapeHtml(c.company || '—')}</td>
                    <td style="font-size: 0.85rem;">${this.escapeHtml(c.email)}</td>
                    <td><span class="badge badge-neutral">${qCounts[c.id] || 0}</span></td>
                    <td>
                        <span class="badge ${c.status === 'active' ? 'badge-success' : 'badge-danger'}">
                            ${c.status || 'active'}
                        </span>
                    </td>
                    <td style="font-size: 0.85rem; color: var(--text-muted);">${c.created_at || '—'}</td>
                    <td>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; color: var(--danger-text);"
                                onclick="window.dashboard.deleteClient('${c.id}')">Delete</button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    async deleteClient(id) {
        if (!confirm('Delete this client? All their queries will also be removed.')) return;
        const result = await apiDeleteUser(id);
        if (result.error) {
            alert(result.error);
        } else {
            await this.loadData();
            this.renderClients();
        }
    }

    // ==========================================
    // SETTINGS
    // ==========================================

    async loadSettings() {
        if (this.currentUser.role !== 'admin') return;

        try {
            const res = await fetch(`${API_BASE}?action=get_settings`);
            const settings = await res.json();
            document.getElementById('setting-serpapi-key').value = settings.serpapi_key || '';
            document.getElementById('setting-openai-key').value = settings.openai_key || '';
            document.getElementById('setting-brand-name').value = settings.brand_name || '';
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }

    // ==========================================
    // MODALS
    // ==========================================

    setupModals() {
        // Add AI Query Modal
        const addQueryBtn = document.getElementById('add-ai-query-btn');
        if (addQueryBtn) {
            addQueryBtn.addEventListener('click', () => {
                document.getElementById('ai-query-modal').classList.add('open');
            });
        }

        // Save AI Query
        const saveQueryBtn = document.getElementById('save-ai-query-btn');
        if (saveQueryBtn) {
            saveQueryBtn.addEventListener('click', async () => {
                const query = document.getElementById('new-ai-query-text').value.trim();
                const brandName = document.getElementById('new-ai-query-brand').value.trim();
                const location = document.getElementById('new-ai-query-location').value;
                const clientId = document.getElementById('new-ai-query-client').value;

                if (!query) {
                    alert('Please enter a query.');
                    return;
                }

                const payload = {
                    query,
                    brand_name: brandName,
                    location,
                    client_id: clientId || this.currentUser.id
                };

                try {
                    const res = await fetch(`${API_BASE}?action=save_ai_query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();
                    if (data.error) {
                        alert(data.error);
                    } else {
                        document.getElementById('ai-query-modal').classList.remove('open');
                        document.getElementById('new-ai-query-text').value = '';
                        document.getElementById('new-ai-query-brand').value = '';
                        await this.loadData();
                        this.renderAiQueries();
                        this.renderDashboard();
                    }
                } catch (e) {
                    alert('Failed to save query.');
                }
            });
        }

        // Add Client Modal
        const addClientBtn = document.getElementById('add-client-btn');
        if (addClientBtn) {
            addClientBtn.addEventListener('click', () => {
                document.getElementById('client-modal').classList.add('open');
                document.getElementById('client-modal-error').style.display = 'none';
            });
        }

        // Save Client
        const saveClientBtn = document.getElementById('save-client-btn');
        if (saveClientBtn) {
            saveClientBtn.addEventListener('click', async () => {
                const name = document.getElementById('new-client-name').value.trim();
                const company = document.getElementById('new-client-company').value.trim();
                const email = document.getElementById('new-client-email').value.trim();
                const password = document.getElementById('new-client-password').value;
                const errorEl = document.getElementById('client-modal-error');

                if (!name || !email || !password) {
                    errorEl.textContent = 'Name, email, and password are required.';
                    errorEl.style.display = 'block';
                    return;
                }

                if (password.length < 6) {
                    errorEl.textContent = 'Password must be at least 6 characters.';
                    errorEl.style.display = 'block';
                    return;
                }

                const result = await apiCreateUser({ name, company, email, password, role: 'client' });

                if (result.error) {
                    errorEl.textContent = result.error;
                    errorEl.style.display = 'block';
                } else {
                    document.getElementById('client-modal').classList.remove('open');
                    document.getElementById('new-client-name').value = '';
                    document.getElementById('new-client-company').value = '';
                    document.getElementById('new-client-email').value = '';
                    document.getElementById('new-client-password').value = '';
                    await this.loadData();
                    this.renderClients();
                }
            });
        }

        // Save Settings
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', async () => {
                const serpKey = document.getElementById('setting-serpapi-key').value.trim();
                const openaiKey = document.getElementById('setting-openai-key').value.trim();
                const brandName = document.getElementById('setting-brand-name').value.trim();

                try {
                    const res = await fetch(`${API_BASE}?action=save_settings`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            serpapi_key: serpKey,
                            openai_key: openaiKey,
                            brand_name: brandName
                        })
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        alert('Settings saved successfully.');
                    }
                } catch (e) {
                    alert('Failed to save settings.');
                }
            });
        }
    }

    // ==========================================
    // QUERY ACTIONS
    // ==========================================

    async deleteAiQuery(id) {
        if (!confirm('Are you sure you want to delete this query?')) return;
        try {
            const res = await fetch(`${API_BASE}?action=delete_ai_query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (data.status === 'success') {
                await this.loadData();
                this.renderAiQueries();
                this.renderDashboard();
            }
        } catch (e) {
            alert('Failed to delete query.');
        }
    }

    async runAiCheck(id) {
        // Update UI to show checking state
        const query = this.data.aiQueries.find(q => q.id === id);
        if (query) {
            query.status = 'Checking...';
            this.renderAiQueries();
        }

        try {
            const res = await fetch(`${API_BASE}?action=run_ai_query_check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const data = await res.json();

            if (data.error) {
                alert('Check failed: ' + data.error);
            }

            await this.loadData();
            this.renderAiQueries();
            this.renderChatGPT();
            this.renderDashboard();
        } catch (e) {
            alert('Failed to run check.');
            await this.loadData();
            this.renderAiQueries();
        }
    }

    viewAiResult(id) {
        const query = this.data.aiQueries.find(q => q.id === id);
        if (!query || !query.latest_result) {
            alert('No results available for this query.');
            return;
        }

        this.currentResultData = query;
        this.currentResultTab = 'google';

        // Update tabs
        document.querySelectorAll('.result-tab').forEach(tab => {
            tab.classList.toggle('active-tab', tab.dataset.tab === 'google');
        });

        this.renderResultContent();
        document.getElementById('ai-result-modal').classList.add('open');
    }

    renderResultContent() {
        const container = document.getElementById('ai-result-content');
        const r = this.currentResultData?.latest_result;
        if (!r) return;

        const tab = this.currentResultTab;
        const data = r[tab];

        if (!data) {
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No data available for this platform.</p>';
            return;
        }

        if (data.error) {
            container.innerHTML = `<div style="padding: 1rem; color: var(--danger-text);">Error: ${this.escapeHtml(data.error)}</div>`;
            return;
        }

        const mentioned = data.brand_mentioned;
        const sentiment = data.sentiment || 'unknown';
        const sentimentColor = sentiment === 'positive' ? 'var(--success-text)' : sentiment === 'negative' ? 'var(--danger-text)' : 'var(--warning-text)';

        let html = `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                <div style="background: white; padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--border-color);">
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Brand Mentioned</div>
                    <div style="font-weight: 700; color: ${mentioned ? 'var(--success-text)' : 'var(--danger-text)'};">
                        ${mentioned ? '✓ Yes' : '✗ No'}
                    </div>
                </div>
                <div style="background: white; padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--border-color);">
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Position</div>
                    <div style="font-weight: 700;">${this.escapeHtml(data.position || 'N/A')}</div>
                </div>
                <div style="background: white; padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--border-color);">
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Sentiment</div>
                    <div style="font-weight: 700; color: ${sentimentColor}; text-transform: capitalize;">${sentiment}</div>
                </div>
                <div style="background: white; padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--border-color);">
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Query</div>
                    <div style="font-weight: 500; font-size: 0.85rem;">${this.escapeHtml(this.currentResultData.query)}</div>
                </div>
            </div>`;

        // Exact Words
        if (data.description_exact_words) {
            html += `
                <div style="margin-bottom: 1.5rem; background: #fffde7; padding: 1rem; border-radius: 0.5rem; border: 1px solid #fff59d;">
                    <div style="font-weight: 600; margin-bottom: 0.5rem; color: #f57f17;">Exactly Described As</div>
                    <div style="font-size: 0.9rem; font-style: italic;">"${this.escapeHtml(data.description_exact_words)}"</div>
                </div>`;
        }

        // Competitors Preceding / Mentioned
        if (data.competitors_before_brand && data.competitors_before_brand.length > 0) {
            html += `
                <div style="margin-bottom: 1.5rem;">
                    <div style="font-weight: 600; margin-bottom: 0.5rem;">Competitors Before Brand</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                        ${data.competitors_before_brand.map(c => `<span class="badge badge-warning">${this.escapeHtml(c)}</span>`).join('')}
                    </div>
                </div>`;
        }

        if (data.competitors_mentioned && data.competitors_mentioned.length > 0) {
            html += `
                <div style="margin-bottom: 1.5rem;">
                    <div style="font-weight: 600; margin-bottom: 0.5rem;">Domain Citations Found</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                        ${data.competitors_mentioned.map(c => `<span class="badge badge-neutral">${this.escapeHtml(c)}</span>`).join('')}
                    </div>
                </div>`;
        }

        if (data.omitted_competitors && data.omitted_competitors.length > 0) {
            html += `
                <div style="margin-bottom: 1.5rem;">
                    <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--danger-text);">Omitted Competitors (Should be added)</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                        ${data.omitted_competitors.map(c => `<span class="badge badge-danger">${this.escapeHtml(c)}</span>`).join('')}
                    </div>
                </div>`;
        }

        // Citations
        if (data.citations && data.citations.length > 0) {
            html += `
                <div style="margin-bottom: 1.5rem;">
                    <div style="font-weight: 600; margin-bottom: 0.5rem;">Citations</div>
                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                        ${data.citations.map(c => {
                const url = typeof c === 'string' ? c : c.link || c.url || '';
                const title = typeof c === 'string' ? c : c.title || url;
                return `<a href="${this.escapeHtml(url)}" target="_blank" style="font-size: 0.85rem; color: var(--primary-600);">${this.escapeHtml(title)}</a>`;
            }).join('')}
                    </div>
                </div>`;
        }

        // Response text
        if (data.response_text) {
            let contentHtml = '';
            const text = data.response_text.trim();

            // Check if content looks like HTML (starts with tag)
            if (text.startsWith('<') && text.includes('>')) {
                contentHtml = text;
            } else {
                // Parse as Markdown
                contentHtml = typeof marked !== 'undefined' ? marked.parse(text) : this.escapeHtml(text).replace(/\n/g, '<br>');
            }

            html += `
                <div>
                    <div style="font-weight: 600; margin-bottom: 0.5rem;">Full Response</div>
                    <div class="response-content" style="background: white; padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--border-color); font-size: 0.875rem; line-height: 1.6; max-height: 300px; overflow-y: auto;">
                        ${contentHtml}
                    </div>
                </div>`;
        }

        container.innerHTML = html;
    }

    // ==========================================
    // PDF REPORT
    // ==========================================

    renderAiReport() {
        const queries = this.data.aiQueries;
        const checked = queries.filter(q => q.status === 'Checked' && q.latest_result);

        let gMentions = 0, cMentions = 0;
        checked.forEach(q => {
            if (q.latest_result?.google?.brand_mentioned) gMentions++;
            if (q.latest_result?.chatgpt?.brand_mentioned) cMentions++;
        });

        const visScore = checked.length > 0 ? Math.round(((gMentions + cMentions) / (checked.length * 2)) * 100) : 0;

        document.getElementById('report-date').textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        // Dynamic Title Branding
        const reportTitleEl = document.getElementById('pdf-report-title');
        if (this.selectedClientFilter && this.data.users) {
            const client = this.data.users.find(u => u.id === this.selectedClientFilter);
            if (client) {
                reportTitleEl.textContent = `${client.company || client.name} - AI Visibility Report`;
            } else {
                reportTitleEl.textContent = 'AI Visibility Report';
            }
        } else {
            reportTitleEl.textContent = 'AI Visibility Report';
        }

        const statsContainer = document.getElementById('pdf-stats-container');
        statsContainer.innerHTML = [
            { label: 'Total Queries', value: queries.length },
            { label: 'Google AI Mentions', value: gMentions },
            { label: 'ChatGPT Mentions', value: cMentions },
            { label: 'Visibility Score', value: visScore + '%' }
        ].map(s => `
            <div style="background: #f1f5f9; padding: 15px; border-radius: 10px; text-align: center;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">${s.label}</div>
                <div style="font-size: 28px; font-weight: 800; color: #0f172a;">${s.value}</div>
            </div>
        `).join('');

        const tableBody = document.getElementById('pdf-table-body');
        const locationMap = {
            'us': 'US',
            'ae': 'UAE',
            'gb': 'UK',
            'in': 'India',
            'sa': 'Saudi Arabia'
        };

        tableBody.innerHTML = queries.map(q => {
            const gm = q.latest_result?.google?.brand_mentioned;
            const gs = q.latest_result?.google?.sentiment || 'unknown';
            const gc = q.latest_result?.google?.competitors_mentioned || [];

            const cm = q.latest_result?.chatgpt?.brand_mentioned;
            const cs = q.latest_result?.chatgpt?.sentiment || 'unknown';

            const gmHtml = gm === undefined ? '—' :
                gm ? `<div style="color: #059669; font-weight: 600;">✓ Mentioned</div><div style="font-size:10px; color:#64748b; margin-top:2px;">Sentiment: <span style="text-transform: capitalize; color: ${gs === 'positive' ? '#059669' : gs === 'negative' ? '#dc2626' : '#d97706'}">${gs}</span></div>`
                    : '<div style="color: #dc2626; font-weight: 600;">✗ Not found</div>';

            const cmHtml = cm === undefined ? '—' :
                cm ? `<div style="color: #059669; font-weight: 600;">✓ Mentioned</div><div style="font-size:10px; color:#64748b; margin-top:2px;">Sentiment: <span style="text-transform: capitalize; color: ${cs === 'positive' ? '#059669' : cs === 'negative' ? '#dc2626' : '#d97706'}">${cs}</span></div>`
                    : '<div style="color: #dc2626; font-weight: 600;">✗ Not found</div>';

            const topComps = gc.length > 0 ? gc.slice(0, 3).map(c => `<div style="display:inline-block; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:2px 4px; font-size:9px; margin:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px;">${this.escapeHtml(c)}</div>`).join('') + (gc.length > 3 ? `<div style="display:inline-block; font-size:9px; color:#64748b; margin-left:2px;">+${gc.length - 3}</div>` : '') : '<span style="color:#94a3b8">—</span>';
            const locName = locationMap[q.location || 'us'] || (q.location || 'US').toUpperCase();

            return `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 10px;">${this.escapeHtml(q.query)}</td>
                    <td style="padding: 10px;">${this.escapeHtml(q.brand_name || '—')}</td>
                    <td style="padding: 10px; font-weight: 500;">${this.escapeHtml(locName)}</td>
                    <td style="padding: 10px;">${gmHtml}</td>
                    <td style="padding: 10px; line-height:1.2;">${topComps}</td>
                    <td style="padding: 10px;">${cmHtml}</td>
                    <td style="padding: 10px; color: #64748b;">${q.last_checked || 'Never'}</td>
                </tr>`;
        }).join('');
    }

    // ==========================================
    // HELPERS
    // ==========================================

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    timeAgo(dateStr) {
        if (!dateStr) return 'Never';
        const d = new Date(dateStr);
        const now = new Date();
        const seconds = Math.floor((now - d) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
        return Math.floor(seconds / 86400) + 'd ago';
    }
}

// ==========================================
// GLOBAL FUNCTIONS
// ==========================================

// Initialize dashboard
const dashboard = new AIVisibilityDashboard();
window.dashboard = dashboard;

// Tab switcher for result modal
function switchResultTab(tab) {
    dashboard.currentResultTab = tab;
    document.querySelectorAll('.result-tab').forEach(t => {
        t.classList.toggle('active-tab', t.dataset.tab === tab);
    });
    dashboard.renderResultContent();
}
window.switchResultTab = switchResultTab;

// Logout
async function handleLogout() {
    await apiLogout();
    window.location.href = 'login.html';
}
window.handleLogout = handleLogout;

// Download Report
function downloadCSVReport() {
    let url = `${API_BASE}?action=export&format=csv`;
    if (dashboard.selectedClientFilter) {
        url += `&client_id=${encodeURIComponent(dashboard.selectedClientFilter)}`;
    }
    window.location.href = url;
}
window.downloadCSVReport = downloadCSVReport;

function downloadAiReport() {
    dashboard.renderAiReport();

    const element = document.getElementById('pdf-report-template');
    element.style.display = 'block';

    const opt = {
        margin: 0,
        filename: 'ExampleBrand_AI_Visibility_Report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        element.style.display = 'none';
    });
}
window.downloadAiReport = downloadAiReport;
