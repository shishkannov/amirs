document.addEventListener('DOMContentLoaded', function () {
    const API_URL = '/api';
    let token = localStorage.getItem('amirs_token') || null;
    let currentUsername = localStorage.getItem('amirs_user') || '';
    let currentRole = localStorage.getItem('amirs_role') || 'user';

    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');
    const userBadge = document.getElementById('user-badge');
    const userRoleEl = document.getElementById('user-role');
    const btnLogout = document.getElementById('btn-logout');

    function showLogin() {
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
    }
    function showApp() {
        if (loginScreen) loginScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';
        if (userBadge) userBadge.innerText = currentUsername;
        if (userRoleEl) {
            const roleNames = { 'admin': 'Администратор', 'judge': 'Судья', 'secretary': 'Секретарь', 'user': 'Пользователь' };
            userRoleEl.innerText = '(' + (roleNames[currentRole] || 'Пользователь') + ')';
        }
        initDateAndYear();
        loadCases();
        setupMenuByRole();
    }

    function setupMenuByRole() {
        // Скрыть админские вкладки для не-админов
        const adminMenuItems = document.querySelectorAll('[data-section="users"], [data-section="logs"], [data-section="stats"]');
        adminMenuItems.forEach(item => {
            if (currentRole === 'admin') {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    loginBtn?.addEventListener('click', async () => {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        try {
            const res = await fetch(API_URL + '/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok) {
                token = data.token;
                currentUsername = data.username;
                currentRole = data.role;
                localStorage.setItem('amirs_token', token);
                localStorage.setItem('amirs_user', currentUsername);
                localStorage.setItem('amirs_role', currentRole);
                loginError.style.display = 'none';
                showApp();
            } else {
                loginError.innerText = data.error || 'Ошибка входа';
                loginError.style.display = 'block';
            }
        } catch (err) {
            loginError.innerText = 'Сервер недоступен';
            loginError.style.display = 'block';
        }
    });

    btnLogout?.addEventListener('click', () => {
        token = null;
        localStorage.removeItem('amirs_token');
        localStorage.removeItem('amirs_user');
        localStorage.removeItem('amirs_role');
        showLogin();
    });

    if (token) showApp(); else showLogin();

    function initDateAndYear() {
        const yearSelect = document.getElementById('year-select');
        const currentYear = new Date().getFullYear();
        if (yearSelect) {
            yearSelect.innerHTML = '';
            for (let i = currentYear - 1; i <= currentYear + 1; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = i;
                if (i === currentYear) option.selected = true;
                yearSelect.appendChild(option);
            }
        }
        const dateEl = document.getElementById('current-date');
        if (dateEl) dateEl.textContent = new Date().toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    }
    let casesDB = [];
    let sortConfig = { key: 'id', direction: 'desc' };

    async function loadCases() {
        try {
            const res = await fetch(API_URL + '/cases', { headers: { 'Authorization': 'Bearer ' + token } });
            if (res.status === 401 || res.status === 403) { btnLogout.click(); return; }
            casesDB = await res.json();
            renderTable();
            loadJudgesForFilter();
            updateToolbarByRole();
        } catch (err) { console.error(err); }
    }

    function updateToolbarByRole() {
        // Скрыть кнопки создания/удаления для обычных пользователей
        const btnCreate = document.getElementById('btn-create');
        const btnDelete = document.getElementById('btn-delete');
        const btnSchedule = document.getElementById('btn-schedule-selected');
        const btnGenerate = document.getElementById('btn-generate-doc-selected');
        
        if (currentRole === 'user') {
            if (btnCreate) btnCreate.style.display = 'none';
            if (btnDelete) btnDelete.style.display = 'none';
            if (btnSchedule) btnSchedule.style.display = 'none';
            // Генерация документов доступна всем
            if (btnGenerate) btnGenerate.style.display = 'inline-block';
        } else {
            if (btnCreate) btnCreate.style.display = 'inline-block';
            if (btnDelete) btnDelete.style.display = 'inline-block';
            if (btnSchedule) btnSchedule.style.display = 'inline-block';
            if (btnGenerate) btnGenerate.style.display = 'inline-block';
        }
    }

    const journalBody = document.getElementById('journal-body');
    const searchInput = document.getElementById('search-input');
    const filterStatus = document.getElementById('filter-status');
    const filterJudge = document.getElementById('filter-judge');
    let selectedRowId = null;

    async function loadJudgesForFilter() {
        if (!filterJudge) return;
        try {
            const res = await fetch(API_URL + '/users', { headers: { 'Authorization': 'Bearer ' + token } });
            if (!res.ok) return;
            const users = await res.json();
            const judges = users.filter(u => u.role === 'judge');
            filterJudge.innerHTML = '<option value="">Все судьи</option><option value="__none__">Не назначен</option>';
            judges.forEach(j => {
                const opt = document.createElement('option');
                opt.value = j.username;
                opt.textContent = j.username;
                filterJudge.appendChild(opt);
            });
        } catch (err) { console.error(err); }
    }

    function renderTable() {
        if (!journalBody) return;
        journalBody.innerHTML = '';
        const searchText = (searchInput?.value || '').toLowerCase();
        const statusFilter = filterStatus?.value || '';
        const judgeFilter = filterJudge?.value || '';

        let filtered = casesDB.filter(item => {
            const matchSearch = (item.sender || '').toLowerCase().includes(searchText) ||
                (item.summary || '').toLowerCase().includes(searchText) ||
                (item.caseNum || '').toLowerCase().includes(searchText);
            const matchStatus = !statusFilter || item.status === statusFilter;
            let matchJudge = true;
            if (judgeFilter === '__none__') matchJudge = !item.judge;
            else if (judgeFilter) matchJudge = item.judge === judgeFilter;
            return matchSearch && matchStatus && matchJudge;
        });

        filtered.sort((a, b) => {
            let valA = a[sortConfig.key] || '';
            let valB = b[sortConfig.key] || '';
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        if (filtered.length === 0) {
            journalBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px; color: #64748b;">Нет данных.</td></tr>';
            return;
        }

        filtered.forEach(item => {
            const tr = document.createElement('tr');
            tr.dataset.id = item.id;
            if (item.id === selectedRowId) tr.classList.add('selected');
            
            let statusBadge = '<span style="color:#64748b;">Ознакомление</span>';
            if (item.status === 'Подготовка') statusBadge = '<span style="color:#eab308; font-weight:600;">Подготовка</span>';
            if (item.status === 'Заседание') statusBadge = '<span style="color:#3b82f6; font-weight:600;">Заседание</span>';
            if (item.status === 'Решение') {
                statusBadge = '<span style="color:#10b981; font-weight:600;">Решено</span>';
                tr.style.backgroundColor = '#f0fdf4'; tr.style.borderLeft = '3px solid #10b981';
            }
            
            let categoryBadge = '<span style="color:#94a3b8; font-size:11px;">—</span>';
            if (item.category === 'civil') {
                categoryBadge = '<span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">Гражданское</span>';
            } else if (item.category === 'admin') {
                categoryBadge = '<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">Административное</span>';
            } else if (item.category === 'criminal') {
                categoryBadge = '<span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">Уголовное</span>';
            }
            
            tr.innerHTML = '<td>' + (item.inNum || '') + '</td><td>' + (item.date || '') + '</td><td>' + (item.caseNum || '') + '</td><td>' + (item.sender || '') + '</td><td>' + (item.docType || '') + '</td><td>' + (item.summary || '') + '</td><td>' + categoryBadge + '</td><td>' + statusBadge + '</td><td>' + (item.author || '-') + '</td>';
            
            tr.addEventListener('click', function () {
                document.querySelectorAll('#journal-body tr').forEach(r => r.classList.remove('selected'));
                this.classList.add('selected'); selectedRowId = item.id;
            });
            
            // Только для админов, судей и секретарей разрешаем открывать карточку дела
            if (currentRole !== 'user') {
                tr.addEventListener('dblclick', function () { openCaseCard(item); });
            }
            
            journalBody.appendChild(tr);
        });
    }

    if (searchInput) searchInput.addEventListener('input', () => renderTable());
    if (filterStatus) filterStatus.addEventListener('change', () => renderTable());
    if (filterJudge) filterJudge.addEventListener('change', () => renderTable());

    document.querySelectorAll('#main-journal th[data-sort]').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (sortConfig.key === key) {
                sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortConfig.key = key;
                sortConfig.direction = 'asc';
            }
            renderTable();
        });
    });

    const modalCase = document.getElementById('modal-case');
    const caseTitleText = document.getElementById('case-title-text');
    const caseNumber = document.getElementById('case-number');
    const casePlaintiff = document.getElementById('case-plaintiff');
    const caseDefendant = document.getElementById('case-defendant');
    const caseJudge = document.getElementById('case-judge');
    const detailContent = document.getElementById('case-detail-content');
    const steps = document.querySelectorAll('.step-item');
    let currentCaseId = null;
    let currentCaseItem = null;

    function updateCaseStep(index) {
        steps.forEach((step, i) => {
            step.classList.remove('active-step');
            step.classList.toggle('completed-step', i < index);
            if (i === index) step.classList.add('active-step');
        });
        if (!detailContent) return;
        switch (index) {
            case 0:
                detailContent.innerHTML = '<h4>Этап 1: Ознакомление с материалами</h4><div class="form-group"><label>Местонахождение дела</label><select class="input-control"><option>В канцелярии</option><option>У судьи</option></select></div><div class="form-group"><label>Дата поступления</label><input type="text" class="input-control" value="' + (currentCaseItem?.date || '') + '" readonly></div>';
                break;
            case 1:
                detailContent.innerHTML = '<h4>Этап 2: Подготовка к разбирательству</h4><div class="form-group"><label>Судья</label><input type="text" class="input-control" value="' + (currentCaseItem?.judge || 'Не назначен') + '" readonly></div><div class="form-group"><label>Дата принятия</label><input type="date" class="input-control"></div>';
                break;
            case 2:
                detailContent.innerHTML = '<h4>Этап 3: Судебное заседание</h4><div class="form-group"><label>Дата заседания</label><input type="date" class="input-control"></div><div class="form-group"><label>Время</label><input type="time" class="input-control" value="10:00"></div><div class="form-group"><label>Зал</label><input type="text" class="input-control" value="Зал № 3"></div>';
                break;
            case 3:
                detailContent.innerHTML = '<h4>Этап 4: Решение по существу</h4><div class="form-group"><label>Решение</label><select class="input-control"><option>Удовлетворен</option><option>Отказано</option></select></div><div class="form-group"><label>Дата вступления в силу</label><input type="date" class="input-control"></div>';
                break;
        }
    }

    async function openCaseCard(item) {
        currentCaseId = item.id;
        currentCaseItem = item;
        if (caseTitleText) caseTitleText.innerText = '№ ' + item.caseNum + ' - ' + item.sender;
        if (caseNumber) caseNumber.innerText = item.caseNum;
        if (casePlaintiff) casePlaintiff.innerText = item.sender;
        if (caseDefendant) caseDefendant.innerText = item.defendant || 'Не указан';
        if (caseJudge) caseJudge.innerText = item.judge || 'Не назначен';

        const btnTake = document.getElementById('btn-take-case');
        const btnSchedule = document.getElementById('btn-schedule');
        const btnDecide = document.getElementById('btn-decide');
        const btnAddParticipant = document.getElementById('btn-add-participant');

        // Скрыть кнопки для обычных пользователей
        if (currentRole === 'user') {
            if (btnTake) btnTake.style.display = 'none';
            if (btnSchedule) btnSchedule.style.display = 'none';
            if (btnDecide) btnDecide.style.display = 'none';
            if (btnAddParticipant) btnAddParticipant.style.display = 'none';
        } else if (currentRole === 'secretary') {
            if (btnTake) btnTake.style.display = 'inline-block';
            if (btnSchedule) btnSchedule.style.display = 'none';
            if (btnDecide) btnDecide.style.display = 'none';
            if (btnAddParticipant) btnAddParticipant.style.display = 'inline-block';
        } else if (currentRole === 'judge') {
            if (btnAddParticipant) btnAddParticipant.style.display = 'inline-block';
            if (item.judge === currentUsername) {
                if (btnTake) btnTake.style.display = 'none';
                if (btnSchedule) btnSchedule.style.display = 'inline-block';
                if (btnDecide) btnDecide.style.display = 'inline-block';
            } else {
                if (btnTake) btnTake.style.display = 'none';
                if (btnSchedule) btnSchedule.style.display = 'none';
                if (btnDecide) btnDecide.style.display = 'none';
            }
        } else {
            // Админ видит все
            if (btnTake) btnTake.style.display = 'inline-block';
            if (btnSchedule) btnSchedule.style.display = 'inline-block';
            if (btnDecide) btnDecide.style.display = 'inline-block';
            if (btnAddParticipant) btnAddParticipant.style.display = 'inline-block';
        }

        let stepIndex = 0;
        if (item.status === 'Подготовка') stepIndex = 1;
        else if (item.status === 'Заседание') stepIndex = 2;
        else if (item.status === 'Решение') stepIndex = 3;
        updateCaseStep(stepIndex);

        // Reset to history tab when opening
        document.querySelectorAll('.case-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.case-tab[data-tab="history"]').classList.add('active');
        document.getElementById('case-content-history').style.display = 'flex';
        document.getElementById('case-content-participants').style.display = 'none';
        document.getElementById('case-content-logs').style.display = 'none';

        // Load data then show modal to prevent content flash
        await loadParticipants(item.id);
        await loadCaseLogs(item.id);
        modalCase.classList.add('show');
    }

    steps.forEach((step, index) => step.addEventListener('click', () => updateCaseStep(index)));

    document.querySelectorAll('.case-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.case-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            const target = this.dataset.tab;
            document.getElementById('case-content-history').style.display = target === 'history' ? 'flex' : 'none';
            document.getElementById('case-content-participants').style.display = target === 'participants' ? 'block' : 'none';
            document.getElementById('case-content-logs').style.display = target === 'logs' ? 'block' : 'none';
        });
    });
    async function loadParticipants(caseId) {
        try {
            const res = await fetch(API_URL + '/cases/' + caseId + '/participants', { headers: { 'Authorization': 'Bearer ' + token } });
            if (!res.ok) return;
            const participants = await res.json();
            const tbody = document.getElementById('participants-list');
            if (participants.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#64748b;">Участники не добавлены</td></tr>';
            } else {
                tbody.innerHTML = participants.map(p => 
                    '<tr>' +
                    '<td>' + p.role + '</td>' +
                    '<td>' + p.fullName + '</td>' +
                    '<td>' + (p.phone || '—') + '</td>' +
                    '<td><button class="btn btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="deleteParticipant(' + p.id + ')">Удалить</button></td>' +
                    '</tr>'
                ).join('');
            }
        } catch (err) { console.error(err); }
    }

    async function loadCaseLogs(caseId) {
        try {
            const res = await fetch(API_URL + '/logs/' + caseId, { headers: { 'Authorization': 'Bearer ' + token } });
            if (!res.ok) return;
            const logs = await res.json();
            const logList = document.getElementById('case-logs-list');
            if (logs.length === 0) {
                logList.innerHTML = '<p style="color:#64748b;">Нет действий</p>';
            } else {
                logList.innerHTML = logs.map(l => '<div><span><b>' + l.username + '</b>: ' + l.action + '</span><span>' + l.timestamp + '</span></div>').join('');
            }
        } catch (err) { console.error(err); }
    }

    document.getElementById('btn-add-participant')?.addEventListener('click', function () {
        if (!currentCaseId) return;
        document.getElementById('modal-participant').classList.add('show');
        // Clear form
        document.getElementById('participant-role').value = '';
        document.getElementById('participant-name').value = '';
        document.getElementById('participant-phone').value = '';
        document.getElementById('participant-email').value = '';
        document.getElementById('participant-address').value = '';
    });

    document.getElementById('participant-save-btn')?.addEventListener('click', async function () {
        if (!currentCaseId) return;
        
        const role = document.getElementById('participant-role').value;
        const fullName = document.getElementById('participant-name').value.trim();
        const phone = document.getElementById('participant-phone').value.trim();
        const email = document.getElementById('participant-email').value.trim();
        const address = document.getElementById('participant-address').value.trim();
        
        if (!role) {
            showAlert('Выберите роль участника');
            return;
        }
        if (!fullName || fullName.length < 3) {
            showAlert('Введите ФИО (минимум 3 символа)');
            return;
        }
        
        const res = await fetch(API_URL + '/cases/' + currentCaseId + '/participants', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify({ role, fullName, phone, email, address })
        });
        
        if (res.ok) {
            document.getElementById('modal-participant').classList.remove('show');
            await loadParticipants(currentCaseId);
            showAlert('Участник добавлен');
        } else {
            const data = await res.json();
            showAlert(data.error || 'Ошибка добавления');
        }
    });

    document.getElementById('participant-cancel-btn')?.addEventListener('click', function () {
        document.getElementById('modal-participant').classList.remove('show');
    });

    document.getElementById('participant-close-btn')?.addEventListener('click', function () {
        document.getElementById('modal-participant').classList.remove('show');
    });

    window.deleteParticipant = async function (id) {
        showConfirm('Удалить участника?', async function () {
            const res = await fetch(API_URL + '/participants/' + id, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (res.ok) loadParticipants(currentCaseId);
        });
    };

    async function updateCaseStatus(status) {
        if (!currentCaseId) return;
        const res = await fetch(API_URL + '/cases/' + currentCaseId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (!res.ok) { showAlert(data.error || 'Ошибка'); return; }
        loadCases();
    }
    document.getElementById('btn-take-case')?.addEventListener('click', () => { updateCaseStep(1); updateCaseStatus('Подготовка'); });
    document.getElementById('btn-schedule')?.addEventListener('click', () => { 
        if (currentCaseItem) {
            openHearingModal(currentCaseItem.id);
        } else {
            updateCaseStep(2); 
            updateCaseStatus('Заседание');
        }
    });
    document.getElementById('btn-decide')?.addEventListener('click', () => { updateCaseStep(3); updateCaseStatus('Решение'); });
    
    document.getElementById('btn-generate-doc')?.addEventListener('click', () => {
        if (currentCaseItem) {
            // Открыть модалку создания документа с автоматическим выбором текущего дела
            const select = document.getElementById('template-case');
            select.innerHTML = '<option value="">— Выберите дело —</option>';
            
            const opt = document.createElement('option');
            opt.value = currentCaseItem.id;
            opt.textContent = '№' + currentCaseItem.caseNum + ' - ' + currentCaseItem.sender;
            opt.selected = true;
            select.appendChild(opt);
            
            casesDB.forEach(c => {
                if (c.id !== currentCaseItem.id) {
                    const opt2 = document.createElement('option');
                    opt2.value = c.id;
                    opt2.textContent = '№' + c.caseNum + ' - ' + c.sender;
                    select.appendChild(opt2);
                }
            });
            
            // Предложить выбор типа документа
            const fieldsContainer = document.getElementById('template-fields');
            fieldsContainer.innerHTML = '<div class="form-group"><label>Выберите тип документа *</label><select id="quick-template-type" class="input-control"><option value="">— Выберите —</option><option value="definition">Определение о принятии</option><option value="summons">Судебная повестка</option><option value="decision">Решение суда</option><option value="ruling">Определение об отложении</option><option value="protocol">Протокол заседания</option><option value="writ">Исполнительный лист</option></select></div>';
            
            document.getElementById('quick-template-type')?.addEventListener('change', function() {
                const templateType = this.value;
                if (templateType) {
                    const templateConfig = templates[templateType];
                    if (!templateConfig) {
                        showAlert('Шаблон пока недоступен');
                        return;
                    }
                    document.getElementById('template-title').innerText = templateConfig.title;
                    document.getElementById('modal-template').dataset.template = templateType;
                    
                    const fieldsContainer = document.getElementById('template-fields');
                    fieldsContainer.innerHTML = '<div class="form-group"><label>Тип документа</label><input type="text" class="input-control" value="' + templateConfig.title + '" readonly></div>';
                    appendTemplateFields(fieldsContainer, templateConfig.fields);
                }
            });
            
            document.getElementById('template-title').innerText = 'Создание документа';
            document.getElementById('modal-template').classList.add('show');
        }
    });

    const modalAlert = document.getElementById('modal-alert');
    const alertText = document.getElementById('alert-text');
    const modalConfirm = document.getElementById('modal-confirm');
    const confirmText = document.getElementById('confirm-text');

    function bringNoticeToFront(modal) {
        if (!modal) return;
        document.body.appendChild(modal);
        modal.classList.add('show');
    }
    function showAlert(message) {
        if (alertText) alertText.innerText = message;
        bringNoticeToFront(modalAlert);
        document.getElementById('alert-ok-btn')?.focus();
    }
    function showConfirm(message, onConfirm) {
        if (confirmText) confirmText.innerText = message;
        bringNoticeToFront(modalConfirm);
        const yesBtn = document.getElementById('confirm-yes-btn');
        const noBtn = document.getElementById('confirm-no-btn');
        const newYes = yesBtn.cloneNode(true);
        const newNo = noBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);
        noBtn.parentNode.replaceChild(newNo, noBtn);
        newYes.addEventListener('click', () => { modalConfirm.classList.remove('show'); if (onConfirm) onConfirm(); });
        newNo.addEventListener('click', () => modalConfirm.classList.remove('show'));
    }
    function printHtml(html) {
        let frame = document.getElementById('print-frame');
        if (!frame) {
            frame = document.createElement('iframe');
            frame.id = 'print-frame';
            frame.setAttribute('aria-hidden', 'true');
            frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
            document.body.appendChild(frame);
        }
        const doc = frame.contentDocument || frame.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        frame.contentWindow.focus();
        frame.contentWindow.print();
    }
    document.getElementById('alert-ok-btn')?.addEventListener('click', () => modalAlert.classList.remove('show'));

    document.querySelectorAll('.modal-close, #modal-cancel-btn, #case-close-btn-bottom').forEach(btn => {
        btn.addEventListener('click', function () { this.closest('.modal-overlay').classList.remove('show'); });
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.classList.remove('show'); });
    });

    document.getElementById('btn-create')?.addEventListener('click', async () => {
        try {
            const res = await fetch(API_URL + '/users', { headers: { 'Authorization': 'Bearer ' + token } });
            if (res.ok) {
                const users = await res.json();
                const judges = users.filter(u => u.role === 'judge');
                const select = document.getElementById('create-judge');
                select.innerHTML = '<option value="">— Не назначен —</option>';
                judges.forEach(j => {
                    const opt = document.createElement('option');
                    opt.value = j.username;
                    opt.textContent = j.username;
                    select.appendChild(opt);
                });
            }
        } catch (err) { console.error(err); }
        document.getElementById('modal-create').classList.add('show');
    });

    document.getElementById('modal-save-btn')?.addEventListener('click', async function () {
        const dateVal = document.getElementById('create-date').value;
        const inNumVal = document.getElementById('create-in-num').value.trim();
        const senderVal = document.getElementById('create-sender').value.trim();
        const defendantVal = document.getElementById('create-defendant').value.trim();
        const caseNumVal = document.getElementById('create-case-num').value.trim();
        const docTypeVal = document.getElementById('create-doc-type').value.trim();
        const summaryVal = document.getElementById('create-summary').value.trim();
        const judgeVal = document.getElementById('create-judge').value;
        const categoryVal = document.getElementById('create-case-category').value;

        if (!dateVal) { showAlert('Укажите дату.'); return; }
        if (!inNumVal) { showAlert('Укажите вх. номер.'); return; }
        if (!senderVal || senderVal.length < 3) { showAlert('ФИО минимум 3 символа.'); return; }
        if (!caseNumVal) { showAlert('Укажите номер дела.'); return; }
        if (!docTypeVal) { showAlert('Укажите вид документа.'); return; }
        if (!summaryVal) { showAlert('Укажите содержание.'); return; }

        const res = await fetch(API_URL + '/cases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({
                inNum: inNumVal,
                date: dateVal.split('-').reverse().join('.'),
                caseNum: caseNumVal,
                sender: senderVal,
                defendant: defendantVal,
                docType: docTypeVal,
                summary: summaryVal,
                judge: judgeVal,
                category: categoryVal
            })
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('modal-create').classList.remove('show');
            document.querySelectorAll('#modal-create input').forEach(i => i.value = '');
            document.getElementById('create-case-category').value = '';
            loadCases();
            showAlert('Дело создано успешно!');
        } else {
            showAlert(data.error || 'Ошибка сохранения');
        }
    });

    document.getElementById('btn-delete')?.addEventListener('click', function () {
        if (!selectedRowId) { showAlert('Выберите дело'); return; }
        if (currentRole !== 'admin') { showAlert('Только администратор'); return; }
        showConfirm('Удалить дело?', async function () {
            await fetch(API_URL + '/cases/' + selectedRowId, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            selectedRowId = null;
            loadCases();
        });
    });
    
    document.getElementById('btn-schedule-selected')?.addEventListener('click', function() {
        if (!selectedRowId) { 
            showAlert('Выберите дело из списка'); 
            return; 
        }
        
        const selectedCase = casesDB.find(c => c.id === selectedRowId);
        if (!selectedCase) {
            showAlert('Дело не найдено');
            return;
        }
        openHearingModal(selectedCase.id);
    });
    
    document.getElementById('btn-generate-doc-selected')?.addEventListener('click', function() {
        if (!selectedRowId) { 
            showAlert('Выберите дело из списка'); 
            return; 
        }
        
        const selectedCase = casesDB.find(c => c.id === selectedRowId);
        if (!selectedCase) {
            showAlert('Дело не найдено');
            return;
        }
        
        // Открыть модалку создания документа
        const select = document.getElementById('template-case');
        select.innerHTML = '<option value="">— Выберите дело —</option>';
        
        const opt = document.createElement('option');
        opt.value = selectedCase.id;
        opt.textContent = '№' + selectedCase.caseNum + ' - ' + selectedCase.sender;
        opt.selected = true;
        select.appendChild(opt);
        
        casesDB.forEach(c => {
            if (c.id !== selectedCase.id) {
                const opt2 = document.createElement('option');
                opt2.value = c.id;
                opt2.textContent = '№' + c.caseNum + ' - ' + c.sender;
                select.appendChild(opt2);
            }
        });
        
        // Предложить выбор типа документа
        const fieldsContainer = document.getElementById('template-fields');
        fieldsContainer.innerHTML = '<div class="form-group"><label>Выберите тип документа *</label><select id="quick-template-type" class="input-control"><option value="">— Выберите —</option><option value="definition">Определение о принятии</option><option value="summons">Судебная повестка</option><option value="decision">Решение суда</option><option value="ruling">Определение об отложении</option><option value="protocol">Протокол заседания</option><option value="writ">Исполнительный лист</option></select></div>';
        
        document.getElementById('quick-template-type')?.addEventListener('change', function() {
            const templateType = this.value;
            if (templateType) {
                const templateConfig = templates[templateType];
                if (!templateConfig) {
                    showAlert('Шаблон пока недоступен');
                    return;
                }
                document.getElementById('template-title').innerText = templateConfig.title;
                document.getElementById('modal-template').dataset.template = templateType;
                
                const fieldsContainer = document.getElementById('template-fields');
                fieldsContainer.innerHTML = '<div class="form-group"><label>Тип документа</label><input type="text" class="input-control" value="' + templateConfig.title + '" readonly></div>';
                appendTemplateFields(fieldsContainer, templateConfig.fields);
            }
        });
        
        document.getElementById('template-title').innerText = 'Создание документа';
        document.getElementById('modal-template').classList.add('show');
    });
    
    document.getElementById('btn-export')?.addEventListener('click', function () {
        const searchText = (searchInput?.value || '').toLowerCase();
        const statusFilter = filterStatus?.value || '';
        const judgeFilter = filterJudge?.value || '';
        let filtered = casesDB.filter(item => {
            const matchSearch = (item.sender || '').toLowerCase().includes(searchText) ||
                (item.summary || '').toLowerCase().includes(searchText) ||
                (item.caseNum || '').toLowerCase().includes(searchText);
            const matchStatus = !statusFilter || item.status === statusFilter;
            let matchJudge = true;
            if (judgeFilter === '__none__') matchJudge = !item.judge;
            else if (judgeFilter) matchJudge = item.judge === judgeFilter;
            return matchSearch && matchStatus && matchJudge;
        });
        if (filtered.length === 0) { showAlert('Нет данных'); return; }
        const headers = ['Вх. №', 'Дата', 'Дело', 'Истец', 'Ответчик', 'Вид', 'Содержание', 'Статус', 'Судья', 'Автор'];
        const rows = filtered.map(item => [item.inNum || '', item.date || '', item.caseNum || '', item.sender || '', item.defendant || '', item.docType || '', item.summary || '', item.status || '', item.judge || 'Не назначен', item.author || '']);
        const escapeCsv = (val) => '"' + String(val).replace(/"/g, '""') + '"';
        const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(';')].concat(rows.map(r => r.map(escapeCsv).join(';'))).join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'amirs_journal_' + new Date().toISOString().slice(0, 10) + '.csv';
        link.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('btn-print')?.addEventListener('click', function () {
        const caseNumber = document.getElementById('case-number').innerText;
        const plaintiff = document.getElementById('case-plaintiff').innerText;
        const defendant = document.getElementById('case-defendant').innerText;
        const judge = document.getElementById('case-judge').innerText;
        const statusText = detailContent?.innerText || '';
        const logsHtml = document.getElementById('case-logs-list')?.innerHTML || '<p>Нет изменений.</p>';
        const participantsHtml = document.getElementById('participants-list')?.innerHTML || '';
        const html = '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Печать</title><style>' +
            'body{font-family:"Times New Roman",serif;padding:40px;color:#000;font-size:14px;line-height:1.6;}' +
            'h1{text-align:center;font-size:18px;margin-bottom:30px;}h2{font-size:16px;margin-top:25px;border-bottom:1px solid #000;padding-bottom:5px;}' +
            '.header-info{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:20px;}' +
            'table{width:100%;border-collapse:collapse;margin-top:10px;}th,td{border:1px solid #000;padding:8px;text-align:left;}th{background:#eee;}' +
            '.logs{font-size:12px;}.logs div{border-bottom:1px solid #ccc;padding:4px 0;}' +
            '.signature{margin-top:60px;display:flex;justify-content:space-between;}.signature div{width:45%;}' +
            '.signature-line{border-top:1px solid #000;margin-top:30px;padding-top:5px;text-align:center;font-size:12px;}' +
            '</style></head><body>' +
            '<h1>КАРТОЧКА ДЕЛА № ' + caseNumber + '</h1>' +
            '<div class="header-info"><div><strong>Истец:</strong> ' + plaintiff + '</div><div><strong>Ответчик:</strong> ' + defendant + '</div><div><strong>Номер дела:</strong> ' + caseNumber + '</div><div><strong>Судья:</strong> ' + judge + '</div></div>' +
            '<h2>Текущее состояние</h2><div>' + statusText.replace(/\n/g, '<br>') + '</div>' +
            '<h2>Участники</h2><table><thead><tr><th>Роль</th><th>ФИО</th></tr></thead><tbody>' + participantsHtml + '</tbody></table>' +
            '<h2>История изменений</h2><div class="logs">' + logsHtml.replace(/<h4[^>]*>.*?<\/h4>/g, '') + '</div>' +
            '<div class="signature"><div><div class="signature-line">Судья</div></div><div><div class="signature-line">Секретарь</div></div></div>' +
            '<p style="text-align:center;margin-top:40px;font-size:11px;color:#666;">Сформировано ' + new Date().toLocaleString('ru-RU') + '</p>' +
            '</body></html>';
        printHtml(html);
    });

    async function loadUsers() {
        const tbody = document.getElementById('users-body');
        if (!tbody) return;
        if (currentRole !== 'admin') {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;">Доступ только для администратора</td></tr>';
            return;
        }
        try {
            const res = await fetch(API_URL + '/users', { headers: { 'Authorization': 'Bearer ' + token } });
            if (!res.ok) return;
            const users = await res.json();
            tbody.innerHTML = '';
            users.forEach(user => {
                const isSystemAdmin = user.username === 'admin';
                const tr = document.createElement('tr');
                tr.innerHTML = '<td>' + user.id + '</td><td>' + user.username + '</td><td>' +
                    '<select class="input-control" ' + (isSystemAdmin ? 'disabled' : '') + ' onchange="changeUserRole(' + user.id + ', this.value)">' +
                    '<option value="user" ' + (user.role === 'user' ? 'selected' : '') + '>Пользователь</option>' +
                    '<option value="secretary" ' + (user.role === 'secretary' ? 'selected' : '') + '>Секретарь</option>' +
                    '<option value="judge" ' + (user.role === 'judge' ? 'selected' : '') + '>Судья</option>' +
                    '<option value="admin" ' + (user.role === 'admin' ? 'selected' : '') + '>Администратор</option>' +
                    '</select></td><td>' + (isSystemAdmin ? '<b style="color:#3b82f6;">Системный</b>' : 'Активен') + '</td><td>' +
                    (isSystemAdmin ? '—' : '<button class="btn btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="deleteUser(' + user.id + ')">Удалить</button>') + '</td>';
                tbody.appendChild(tr);
            });
        } catch (err) { console.error(err); }
    }

    window.changeUserRole = async function (userId, newRole) {
        if (currentRole !== 'admin') { showAlert('Только администратор'); return; }
        const res = await fetch(API_URL + '/users/' + userId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ role: newRole })
        });
        const data = await res.json();
        if (res.ok) showAlert('Роль обновлена'); else showAlert(data.error || 'Ошибка');
    };

    window.deleteUser = function (userId) {
        showConfirm('Удалить пользователя?', async function () {
            const res = await fetch(API_URL + '/users/' + userId, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            if (res.ok) { loadUsers(); showAlert('Удален'); } else { showAlert(data.error || 'Ошибка'); }
        });
    };

    async function loadAllLogs() {
        const tbody = document.getElementById('logs-body');
        if (!tbody) return;
        if (currentRole !== 'admin') {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#ef4444;">Доступ только для администратора</td></tr>';
            return;
        }
        try {
            const res = await fetch(API_URL + '/logs', { headers: { 'Authorization': 'Bearer ' + token } });
            if (!res.ok) return;
            const logs = await res.json();
            tbody.innerHTML = '';
            logs.forEach(log => {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td>' + log.id + '</td><td>' + log.timestamp + '</td><td>' + log.username + '</td><td>' + log.action + '</td>';
                tbody.appendChild(tr);
            });
        } catch (err) { console.error(err); }
    }

    async function loadStats() {
        const cards = document.getElementById('stats-cards');
        if (!cards) return;
        if (currentRole !== 'admin') {
            cards.innerHTML = '<div style="color:#ef4444;">Доступ только для администратора</div>';
            return;
        }
        try {
            const res = await fetch(API_URL + '/stats', { headers: { 'Authorization': 'Bearer ' + token } });
            if (!res.ok) return;
            const stats = await res.json();
            
            // Enhanced stat cards
            cards.innerHTML = 
                '<div class="stat-card"><div class="stat-number">' + stats.total + '</div><div class="stat-label">Входящая корреспонденция</div></div>' +
                '<div class="stat-card"><div class="stat-number">' + (stats.civilTotal || 0) + '</div><div class="stat-label">Гражданские дела</div></div>' +
                '<div class="stat-card"><div class="stat-number">' + (stats.adminTotal || 0) + '</div><div class="stat-label">Административные дела</div></div>' +
                '<div class="stat-card"><div class="stat-number">' + (stats.criminalTotal || 0) + '</div><div class="stat-label">Уголовные дела</div></div>' +
                '<div class="stat-card"><div class="stat-number">' + (stats.participantsTotal || 0) + '</div><div class="stat-label">Участники</div></div>' +
                stats.byStatus.map(s => '<div class="stat-card"><div class="stat-number">' + s.count + '</div><div class="stat-label">' + s.status + '</div></div>').join('');
            
            const maxStatus = Math.max.apply(null, stats.byStatus.map(s => s.count).concat([1]));
            const maxJudge = Math.max.apply(null, (stats.byJudge.length > 0 ? stats.byJudge.map(j => j.count) : [1]).concat([1]));
            
            document.getElementById('stats-status-chart').innerHTML = stats.byStatus.map(s =>
                '<div class="stat-bar"><div class="stat-bar-label">' + s.status + '</div><div class="stat-bar-track"><div class="stat-bar-fill" style="width: ' + (s.count / maxStatus) * 100 + '%"></div></div><div class="stat-bar-value">' + s.count + '</div></div>'
            ).join('');
            
            const judgeChart = document.getElementById('stats-judge-chart');
            if (stats.byJudge.length === 0) {
                judgeChart.innerHTML = '<div style="color: var(--text-muted);">Нет назначенных судей</div>';
            } else {
                judgeChart.innerHTML = stats.byJudge.map(j =>
                    '<div class="stat-bar"><div class="stat-bar-label">' + j.judge + '</div><div class="stat-bar-track"><div class="stat-bar-fill" style="width: ' + (j.count / maxJudge) * 100 + '%; background: #8b5cf6;"></div></div><div class="stat-bar-value">' + j.count + '</div></div>'
                ).join('');
            }
            
            document.getElementById('stats-recent-logs').innerHTML = stats.recentLogs.map(l =>
                '<div style="padding:6px 0;border-bottom:1px solid #eee;font-size:12px;"><b>' + l.username + '</b>: ' + l.action + ' <span style="color:#94a3b8;margin-left:10px;">' + l.timestamp + '</span></div>'
            ).join('');
        } catch (err) { console.error('Ошибка статистики:', err); }
    }

    const sideMenuItems = document.querySelectorAll('#side-menu li');
    const tabItems = document.querySelectorAll('.tabs .tab');
    const tabPanes = document.querySelectorAll('#content > .tab-pane');
    const tabsContainer = document.getElementById('tabs');

    function showContent(section) {
        tabPanes.forEach(pane => pane.style.display = 'none');
        const targetPane = document.getElementById('content-' + section);
        if (targetPane) targetPane.style.display = 'block';
        sideMenuItems.forEach(item => item.classList.toggle('active', item.dataset.section === section));
        
        // Hide tabs for single-section views
        const multiTabSections = ['journal', 'civil'];
        if (multiTabSections.includes(section)) {
            tabsContainer.style.display = 'flex';
            tabItems.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === section));
        } else {
            tabsContainer.style.display = 'none';
        }
        
        if (section === 'users') {
            loadUsers();
            // Setup add user button when users section is shown
            setTimeout(() => {
                const btnAddUser = document.getElementById('btn-add-user');
                if (btnAddUser && !btnAddUser.hasAttribute('data-listener-added')) {
                    btnAddUser.setAttribute('data-listener-added', 'true');
                    btnAddUser.addEventListener('click', function () {
                        if (currentRole !== 'admin') {
                            showAlert('Только администратор может добавлять пользователей');
                            return;
                        }
                        const modal = document.getElementById('modal-add-user');
                        if (modal) {
                            modal.classList.add('show');
                            document.getElementById('new-user-login').value = '';
                            document.getElementById('new-user-password').value = '';
                            document.getElementById('new-user-role').value = 'user';
                        }
                    });
                }
            }, 100);
        }
        if (section === 'logs') loadAllLogs();
        if (section === 'stats') loadStats();
        if (section === 'civil') loadCivilCases();
        if (section === 'admin') loadAdminCases();
        if (section === 'criminal') loadCriminalCases();
        if (section === 'search') initParticipantSearch();
        if (section === 'calendar') initCalendar();
        if (section === 'reference') initReference();
    }
    sideMenuItems.forEach(item => item.addEventListener('click', function () { showContent(this.dataset.section); }));
    tabItems.forEach(tab => tab.addEventListener('click', function () { showContent(this.dataset.tab); }));
    document.getElementById('btn-refresh')?.addEventListener('click', () => loadCases());
    
    // Установка обработчиков для модального окна добавления пользователя
    const saveNewUserBtn = document.getElementById('save-new-user-btn');
    const cancelNewUserBtn = document.getElementById('cancel-new-user-btn');
    const closeNewUserBtn = document.getElementById('add-user-close-btn');
    
    if (saveNewUserBtn) {
        saveNewUserBtn.addEventListener('click', async function () {
            const username = document.getElementById('new-user-login')?.value.trim();
            const password = document.getElementById('new-user-password')?.value;
            const role = document.getElementById('new-user-role')?.value;

            if (!username || username.length < 3) {
                showAlert('Логин должен содержать минимум 3 символа');
                return;
            }
            if (!password || password.length < 3) {
                showAlert('Пароль должен содержать минимум 3 символа');
                return;
            }

            try {
                const res = await fetch(API_URL + '/register', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await res.json();
                if (res.ok) {
                    // Update role if not default
                    if (role !== 'user') {
                        const usersRes = await fetch(API_URL + '/users', { 
                            headers: { 'Authorization': 'Bearer ' + token } 
                        });
                        if (usersRes.ok) {
                            const users = await usersRes.json();
                            const newUser = users.find(u => u.username === username);
                            if (newUser) {
                                await fetch(API_URL + '/users/' + newUser.id, {
                                    method: 'PUT',
                                    headers: { 
                                        'Content-Type': 'application/json', 
                                        'Authorization': 'Bearer ' + token 
                                    },
                                    body: JSON.stringify({ role })
                                });
                            }
                        }
                    }

                    const modal = document.getElementById('modal-add-user');
                    if (modal) modal.classList.remove('show');
                    showAlert('Пользователь успешно создан');
                    loadUsers();
                } else {
                    showAlert(data.error || 'Ошибка регистрации');
                }
            } catch (err) {
                console.error(err);
                showAlert('Ошибка соединения с сервером');
            }
        });
    }
    
    if (cancelNewUserBtn) {
        cancelNewUserBtn.addEventListener('click', function () {
            const modal = document.getElementById('modal-add-user');
            if (modal) modal.classList.remove('show');
        });
    }
    
    if (closeNewUserBtn) {
        closeNewUserBtn.addEventListener('click', function () {
            const modal = document.getElementById('modal-add-user');
            if (modal) modal.classList.remove('show');
        });
    }
    
    // === ГРАЖДАНСКИЕ ДЕЛА ===
    let civilCasesDB = [];
    async function loadCivilCases() {
        try {
            const res = await fetch(API_URL + '/civil-cases', { headers: { 'Authorization': 'Bearer ' + token } });
            if (res.status === 401 || res.status === 403) { btnLogout.click(); return; }
            civilCasesDB = await res.json();
            renderCivilTable();
        } catch (err) { console.error(err); }
    }

    function renderCivilTable() {
        const tbody = document.getElementById('civil-body');
        if (!tbody) return;
        const searchText = (document.getElementById('search-civil')?.value || '').toLowerCase();
        const statusFilter = document.getElementById('filter-civil-status')?.value || '';

        let filtered = civilCasesDB.filter(item => {
            const matchSearch = (item.plaintiff || '').toLowerCase().includes(searchText) ||
                (item.defendant || '').toLowerCase().includes(searchText) ||
                (item.caseNum || '').toLowerCase().includes(searchText);
            const matchStatus = !statusFilter || item.status === statusFilter;
            return matchSearch && matchStatus;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: #64748b;">Нет данных. Дела будут появляться здесь.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(item => 
            '<tr>' +
            '<td>' + (item.caseNum || '') + '</td>' +
            '<td>' + (item.plaintiff || '') + '</td>' +
            '<td>' + (item.defendant || '') + '</td>' +
            '<td>' + (item.category || '') + '</td>' +
            '<td>' + (item.dateOpened || '') + '</td>' +
            '<td>' + (item.judge || 'Не назначен') + '</td>' +
            '<td>' + (item.status || '') + '</td>' +
            '</tr>'
        ).join('');
    }

    document.getElementById('search-civil')?.addEventListener('input', renderCivilTable);
    document.getElementById('filter-civil-status')?.addEventListener('change', renderCivilTable);
    document.getElementById('btn-refresh-civil')?.addEventListener('click', loadCivilCases);

    // === АДМИНИСТРАТИВНЫЕ ДЕЛА ===
    let adminCasesDB = [];
    async function loadAdminCases() {
        try {
            const res = await fetch(API_URL + '/admin-cases', { headers: { 'Authorization': 'Bearer ' + token } });
            if (res.status === 401 || res.status === 403) { btnLogout.click(); return; }
            adminCasesDB = await res.json();
            renderAdminTable();
        } catch (err) { console.error(err); }
    }

    function renderAdminTable() {
        const tbody = document.getElementById('admin-body');
        if (!tbody) return;
        const searchText = (document.getElementById('search-admin')?.value || '').toLowerCase();
        const statusFilter = document.getElementById('filter-admin-status')?.value || '';

        let filtered = adminCasesDB.filter(item => {
            const matchSearch = (item.violator || '').toLowerCase().includes(searchText) ||
                (item.article || '').toLowerCase().includes(searchText) ||
                (item.caseNum || '').toLowerCase().includes(searchText);
            const matchStatus = !statusFilter || item.status === statusFilter;
            return matchSearch && matchStatus;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: #64748b;">Нет данных. Дела будут появляться здесь.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(item => 
            '<tr>' +
            '<td>' + (item.caseNum || '') + '</td>' +
            '<td>' + (item.violator || '') + '</td>' +
            '<td>' + (item.article || '') + '</td>' +
            '<td>' + (item.authority || '') + '</td>' +
            '<td>' + (item.dateOpened || '') + '</td>' +
            '<td>' + (item.judge || 'Не назначен') + '</td>' +
            '<td>' + (item.status || '') + '</td>' +
            '</tr>'
        ).join('');
    }

    document.getElementById('search-admin')?.addEventListener('input', renderAdminTable);
    document.getElementById('filter-admin-status')?.addEventListener('change', renderAdminTable);
    document.getElementById('btn-refresh-admin')?.addEventListener('click', loadAdminCases);

    // === УГОЛОВНЫЕ ДЕЛА ===
    let criminalCasesDB = [];
    async function loadCriminalCases() {
        try {
            const res = await fetch(API_URL + '/criminal-cases', { headers: { 'Authorization': 'Bearer ' + token } });
            if (res.status === 401 || res.status === 403) { btnLogout.click(); return; }
            criminalCasesDB = await res.json();
            renderCriminalTable();
        } catch (err) { console.error(err); }
    }

    function renderCriminalTable() {
        const tbody = document.getElementById('criminal-body');
        if (!tbody) return;
        const searchText = (document.getElementById('search-criminal')?.value || '').toLowerCase();
        const statusFilter = document.getElementById('filter-criminal-status')?.value || '';

        let filtered = criminalCasesDB.filter(item => {
            const matchSearch = (item.accused || '').toLowerCase().includes(searchText) ||
                (item.article || '').toLowerCase().includes(searchText) ||
                (item.caseNum || '').toLowerCase().includes(searchText);
            const matchStatus = !statusFilter || item.status === statusFilter;
            return matchSearch && matchStatus;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: #64748b;">Нет данных. Дела будут появляться здесь.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(item => 
            '<tr>' +
            '<td>' + (item.caseNum || '') + '</td>' +
            '<td>' + (item.accused || '') + '</td>' +
            '<td>' + (item.article || '') + '</td>' +
            '<td>' + (item.category || '') + '</td>' +
            '<td>' + (item.dateOpened || '') + '</td>' +
            '<td>' + (item.judge || 'Не назначен') + '</td>' +
            '<td>' + (item.status || '') + '</td>' +
            '</tr>'
        ).join('');
    }

    document.getElementById('search-criminal')?.addEventListener('input', renderCriminalTable);
    document.getElementById('filter-criminal-status')?.addEventListener('change', renderCriminalTable);
    document.getElementById('btn-refresh-criminal')?.addEventListener('click', loadCriminalCases);

    // === ПОИСК УЧАСТНИКОВ ===
    function initParticipantSearch() {
        const tbody = document.getElementById('participant-search-results');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #64748b;">Введите запрос и нажмите "Найти"</td></tr>';
        }
    }

    document.getElementById('btn-search-participant')?.addEventListener('click', async function () {
        const searchQuery = document.getElementById('participant-search-input')?.value.trim();
        if (!searchQuery || searchQuery.length < 2) {
            showAlert('Введите минимум 2 символа для поиска');
            return;
        }

        try {
            const res = await fetch(API_URL + '/participants/search?q=' + encodeURIComponent(searchQuery), {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) {
                showAlert('Ошибка поиска');
                return;
            }

            const results = await res.json();
            const tbody = document.getElementById('participant-search-results');
            
            if (results.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #64748b;">Ничего не найдено</td></tr>';
                return;
            }

            tbody.innerHTML = results.map(p => 
                '<tr>' +
                '<td>' + p.fullName + '</td>' +
                '<td>' + p.role + '</td>' +
                '<td>' + (p.caseNum || '—') + '</td>' +
                '<td>' + (p.phone || '—') + '</td>' +
                '<td>' + (p.email || '—') + '</td>' +
                '<td>' + (p.address || '—') + '</td>' +
                '</tr>'
            ).join('');
        } catch (err) {
            console.error(err);
            showAlert('Ошибка соединения с сервером');
        }
    });
    
    showContent('journal');

    // === КАЛЕНДАРЬ ЗАСЕДАНИЙ ===
    let currentCalendarDate = new Date();
    let selectedCalendarDate = null;
    let hearingsDB = [];

    function formatLocalDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    function hearingsLabel(count) {
        const n10 = count % 10;
        const n100 = count % 100;
        if (n10 === 1 && n100 !== 11) return count + ' заседание';
        if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return count + ' заседания';
        return count + ' заседаний';
    }

    function fillHearingCaseSelect(preferredId) {
        const select = document.getElementById('hearing-case');
        select.innerHTML = '<option value="">— Выберите дело —</option>';
        casesDB.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = '№' + c.caseNum + ' — ' + (c.sender || 'без истца');
            opt.dataset.casenum = c.caseNum || '';
            opt.dataset.judge = c.judge || '';
            if (preferredId && String(c.id) === String(preferredId)) opt.selected = true;
            select.appendChild(opt);
        });
    }

    function openHearingModal(preferredId) {
        if (!casesDB.length) {
            showAlert('Сначала создайте дело в журнале входящей корреспонденции');
            return;
        }
        fillHearingCaseSelect(preferredId);
        const dateInput = document.getElementById('hearing-date');
        dateInput.value = formatLocalDate(selectedCalendarDate || new Date());
        document.getElementById('hearing-time').value = document.getElementById('hearing-time').value || '10:00';
        document.getElementById('modal-hearing').classList.add('show');
    }

    async function loadHearings() {
        try {
            const res = await fetch(API_URL + '/hearings', { headers: { 'Authorization': 'Bearer ' + token } });
            if (res.ok) {
                hearingsDB = await res.json();
                renderCalendar();
                if (selectedCalendarDate) showHearingsForDate(selectedCalendarDate);
            }
        } catch (err) { console.error(err); }
    }

    function renderCalendar() {
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();
        
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        document.getElementById('calendar-month-title').innerText = monthNames[month] + ' ' + year;
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';
        
        // Заголовки дней недели
        const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        dayNames.forEach(name => {
            const header = document.createElement('div');
            header.className = 'calendar-header-day';
            header.innerText = name;
            header.style.textAlign = 'center';
            header.style.fontWeight = '600';
            header.style.color = 'var(--text-muted)';
            header.style.fontSize = '12px';
            header.style.padding = '10px';
            grid.appendChild(header);
        });
        
        // Дни предыдущего месяца
        const prevMonthDays = new Date(year, month, 0).getDate();
        for (let i = startDay - 1; i >= 0; i--) {
            const day = document.createElement('div');
            day.className = 'calendar-day other-month';
            day.innerHTML = '<div class="calendar-day-number">' + (prevMonthDays - i) + '</div>';
            grid.appendChild(day);
        }
        
        // Дни текущего месяца
        const today = new Date();
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const day = document.createElement('div');
            day.className = 'calendar-day';
            const currentDate = new Date(year, month, i);
            
            if (currentDate.toDateString() === today.toDateString()) {
                day.classList.add('today');
            }
            
            const dateStr = formatLocalDate(currentDate);
            const dayHearings = hearingsDB.filter(h => h.date === dateStr);
            
            if (dayHearings.length > 0) {
                day.classList.add('has-hearings');
                day.innerHTML = '<div class="calendar-day-number">' + i + '</div><div class="calendar-day-hearings">' + hearingsLabel(dayHearings.length) + '</div>';
            } else {
                day.innerHTML = '<div class="calendar-day-number">' + i + '</div>';
            }

            if (selectedCalendarDate && formatLocalDate(selectedCalendarDate) === dateStr) {
                day.classList.add('selected');
            }
            
            day.onclick = () => selectCalendarDate(currentDate, day);
            grid.appendChild(day);
        }
        
        // Дни следующего месяца
        const remainingCells = 42 - (startDay + lastDay.getDate());
        for (let i = 1; i <= remainingCells; i++) {
            const day = document.createElement('div');
            day.className = 'calendar-day other-month';
            day.innerHTML = '<div class="calendar-day-number">' + i + '</div>';
            grid.appendChild(day);
        }
    }

    function selectCalendarDate(date, dayEl) {
        selectedCalendarDate = date;
        document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
        if (dayEl) dayEl.classList.add('selected');
        showHearingsForDate(date);
    }

    function showHearingsForDate(date) {
        const dateStr = formatLocalDate(date);
        const dayHearings = hearingsDB.filter(h => h.date === dateStr);
        const list = document.getElementById('hearings-list');
        const title = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        
        if (dayHearings.length === 0) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">На ' + title + ' заседаний не назначено. Нажмите «Назначить заседание», чтобы поставить дело на этот день.</p>';
            return;
        }
        
        list.innerHTML = '<p style="margin: 0 0 12px; color: var(--text-muted);">' + title + '</p>' + dayHearings.map(h => 
            '<div class="hearing-item">' +
            '<h5><span class="hearing-time">' + (h.time || '') + '</span> Дело №' + (h.caseNum || '—') + '</h5>' +
            '<p><b>Зал:</b> ' + (h.room || 'Не указан') + '</p>' +
            '<p><b>Судья:</b> ' + (h.judge || 'Не назначен') + '</p>' +
            (h.note ? '<p><b>Примечание:</b> ' + h.note + '</p>' : '') +
            '<button class="btn btn-secondary btn-cancel-hearing" data-id="' + h.id + '" style="margin-top: 8px;">Отменить заседание</button>' +
            '</div>'
        ).join('');
    }

    document.getElementById('btn-prev-month')?.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('btn-next-month')?.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendar();
    });

    document.getElementById('btn-add-hearing')?.addEventListener('click', () => openHearingModal());
    document.getElementById('btn-refresh-calendar')?.addEventListener('click', () => loadHearings());

    document.getElementById('hearings-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-cancel-hearing');
        if (!btn) return;
        const hearingId = btn.dataset.id;
        showConfirm('Отменить это заседание?', async function () {
            const res = await fetch(API_URL + '/hearings/' + hearingId, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (res.ok) {
                showAlert('Заседание отменено');
                loadHearings();
            } else {
                showAlert('Не удалось отменить заседание');
            }
        });
    });

    document.getElementById('save-hearing-btn')?.addEventListener('click', async () => {
        const caseSelect = document.getElementById('hearing-case');
        const caseId = caseSelect.value;
        const caseNum = caseSelect.selectedOptions[0]?.dataset.casenum;
        const judge = caseSelect.selectedOptions[0]?.dataset.judge;
        const date = document.getElementById('hearing-date').value;
        const time = document.getElementById('hearing-time').value;
        const room = document.getElementById('hearing-room').value;
        const note = document.getElementById('hearing-note').value;
        
        if (!caseId || !date || !time) {
            showAlert('Заполните обязательные поля');
            return;
        }
        
        const res = await fetch(API_URL + '/hearings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ caseId, caseNum, judge, date, time, room, note })
        });
        
        if (res.ok) {
            document.getElementById('modal-hearing').classList.remove('show');
            showAlert('Заседание назначено');
            loadHearings();
        } else {
            const data = await res.json();
            showAlert(data.error || 'Ошибка');
        }
    });

    document.getElementById('cancel-hearing-btn')?.addEventListener('click', () => {
        document.getElementById('modal-hearing').classList.remove('show');
    });

    document.getElementById('hearing-close-btn')?.addEventListener('click', () => {
        document.getElementById('modal-hearing').classList.remove('show');
    });

    // === СПРАВОЧНИКИ ===
    const referenceData = {
        gpk: [
            { article: 'Статья 131', title: 'Форма и содержание искового заявления', text: 'Исковое заявление подается в суд в письменной форме. В исковом заявлении должны быть указаны: 1) наименование суда, в который подается заявление; 2) наименование истца, его место жительства или место нахождения...', note: 'Важно: Не забудьте приложить документы, подтверждающие обстоятельства иска' },
            { article: 'Статья 133', title: 'Принятие искового заявления', text: 'Судья в течение пяти дней со дня поступления искового заявления в суд обязан рассмотреть вопрос о его принятии к производству суда.', note: 'Срок: 5 дней с момента поступления' },
            { article: 'Статья 154', title: 'Сроки рассмотрения дела', text: 'Гражданские дела рассматриваются и разрешаются судом до истечения двух месяцев со дня поступления заявления в суд.', note: 'Общий срок: 2 месяца' },
            { article: 'Статья 167', title: 'Последствия неявки в судебное заседание', text: 'Лица, участвующие в деле, обязаны известить суд о причинах неявки и представить доказательства уважительности этих причин.', note: 'Внимание: Обязательно уведомите суд о причинах неявки' }
        ],
        kas: [
            { article: 'Статья 128', title: 'Сроки рассмотрения административных дел', text: 'Административные дела рассматриваются и разрешаются Верховным Судом Российской Федерации до истечения трех месяцев, а другими судами - до истечения двух месяцев со дня поступления административного искового заявления в суд.', note: 'Срок: 2-3 месяца' },
            { article: 'Статья 125', title: 'Форма и содержание административного искового заявления', text: 'Административное исковое заявление подается в суд в письменной форме и должно быть подписано административным истцом или его представителем.', note: 'Важно: Указывайте все требования к административному ответчику' }
        ],
        koap: [
            { article: 'Статья 29.6', title: 'Сроки рассмотрения дела об административном правонарушении', text: 'Дело об административном правонарушении рассматривается в пятнадцатидневный срок со дня получения судьей, правомочным рассмотреть дело, протокола об административном правонарушении и других материалов дела.', note: 'Срок: 15 дней' },
            { article: 'Статья 4.5', title: 'Давность привлечения к административной ответственности', text: 'Постановление по делу об административном правонарушении не может быть вынесено по истечении двух месяцев со дня совершения административного правонарушения.', note: 'Срок давности: 2 месяца (общий)' }
        ],
        upk: [
            { article: 'Статья 321', title: 'Участники судебного разбирательства', text: 'В судебном разбирательстве участвуют подсудимый, его защитник, государственный обвинитель, потерпевший, гражданский истец, гражданский ответчик и их представители, а также иные лица.', note: 'Важно: Обязательно участие всех лиц' },
            { article: 'Статья 233', title: 'Сроки предварительного следствия', text: 'Предварительное следствие по уголовному делу должно быть закончено в срок, не превышающий 2 месяцев со дня возбуждения уголовного дела.', note: 'Срок: 2 месяца' }
        ],
        deadlines: [
            { article: 'Подача искового заявления', title: 'Общий срок исковой давности', text: 'Общий срок исковой давности составляет три года со дня, определяемого в соответствии со статьей 200 ГК РФ (ст. 196 ГК РФ).', note: 'Срок: 3 года' },
            { article: 'Апелляционное обжалование', title: 'Срок подачи апелляционной жалобы', text: 'Апелляционные жалоба, представление могут быть поданы в течение месяца со дня принятия решения суда в окончательной форме (ст. 321 ГПК РФ).', note: 'Срок: 1 месяц' },
            { article: 'Кассационное обжалование', title: 'Срок кассационного обжалования', text: 'Кассационные жалоба, представление могут быть поданы в течение шести месяцев со дня вступления судебного постановления в законную силу (ст. 376 ГПК РФ).', note: 'Срок: 6 месяцев' }
        ]
    };

    function loadReference(category) {
        const content = document.getElementById('reference-content');
        const articles = referenceData[category] || [];
        
        if (articles.length === 0) {
            content.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px;">Данных пока нет</p>';
            return;
        }
        
        content.innerHTML = articles.map(art => 
            '<div class="reference-article">' +
            '<h4>' + art.article + '. ' + art.title + '</h4>' +
            '<p>' + art.text + '</p>' +
            (art.note ? '<div class="article-note">' + art.note + '</div>' : '') +
            '</div>'
        ).join('');
    }

    document.querySelectorAll('.ref-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.ref-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            loadReference(this.dataset.ref);
        });
    });

    document.getElementById('reference-search')?.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        document.querySelectorAll('.reference-article').forEach(art => {
            const text = art.innerText.toLowerCase();
            art.style.display = text.includes(query) ? 'block' : 'none';
        });
    });

    // === ШАБЛОНЫ ДОКУМЕНТОВ ===
    const TEMPLATE_FIELD_LABELS = {
        judgeName: 'ФИО судьи',
        courtDistrict: 'Номер участка',
        hearingDate: 'Дата заседания',
        hearingTime: 'Время заседания',
        room: 'Зал/Кабинет',
        decision: 'Резолютивная часть',
        reason: 'Основание отложения',
        secretary: 'Секретарь',
        appeared: 'Явившиеся лица',
        decisionDate: 'Дата решения',
        amount: 'Сумма взыскания',
        debtor: 'Должник',
        recoverer: 'Взыскатель'
    };

    function displayDate(value) {
        if (!value) return '[дата]';
        const parts = String(value).split('-');
        if (parts.length === 3 && parts[0].length === 4) return parts[2] + '.' + parts[1] + '.' + parts[0];
        return value;
    }

    function appendTemplateFields(container, fields) {
        if (!container || !fields) return;
        fields.forEach(field => {
            const div = document.createElement('div');
            div.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = TEMPLATE_FIELD_LABELS[field] || field;
            div.appendChild(label);

            let input;
            if (field === 'decision' || field === 'reason' || field === 'appeared') {
                input = document.createElement('textarea');
                input.rows = 4;
            } else {
                input = document.createElement('input');
                if (field === 'hearingDate' || field === 'decisionDate') input.type = 'date';
                else if (field === 'hearingTime') input.type = 'time';
                else input.type = 'text';
            }
            input.id = 'field-' + field;
            input.className = 'input-control';
            if (field === 'courtDistrict') input.value = '9';
            if (field === 'hearingTime') input.value = '10:00';
            if (field === 'hearingDate' && selectedCalendarDate) input.value = formatLocalDate(selectedCalendarDate);
            div.appendChild(input);
            container.appendChild(div);
        });
    }

    function fillTemplateCaseSelect(preferredId) {
        const select = document.getElementById('template-case');
        select.innerHTML = '<option value="">— Выберите дело —</option>';
        casesDB.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = '№' + c.caseNum + ' — ' + (c.sender || 'без истца');
            if (preferredId && String(c.id) === String(preferredId)) opt.selected = true;
            select.appendChild(opt);
        });
    }

    function resetTemplatePreview() {
        const preview = document.getElementById('template-preview');
        const downloadBtn = document.getElementById('download-template-btn');
        const printBtn = document.getElementById('print-template-btn');
        if (preview) preview.style.display = 'none';
        if (downloadBtn) downloadBtn.style.display = 'none';
        if (printBtn) printBtn.style.display = 'none';
    }

    function openTemplateModal(templateType, preferredCaseId) {
        const templateConfig = templates[templateType];
        if (!templateConfig) {
            showAlert('Шаблон пока недоступен');
            return;
        }
        if (!casesDB.length) {
            showAlert('Сначала создайте дело в журнале входящей корреспонденции');
            return;
        }
        fillTemplateCaseSelect(preferredCaseId);
        const fieldsContainer = document.getElementById('template-fields');
        fieldsContainer.innerHTML = '';
        appendTemplateFields(fieldsContainer, templateConfig.fields);
        const judgeInput = document.getElementById('field-judgeName');
        if (judgeInput && preferredCaseId) {
            const selected = casesDB.find(c => String(c.id) === String(preferredCaseId));
            if (selected && selected.judge) judgeInput.value = selected.judge;
        }
        document.getElementById('template-title').innerText = templateConfig.title;
        const modal = document.getElementById('modal-template');
        modal.dataset.template = templateType;
        resetTemplatePreview();
        modal.classList.add('show');
    }

    function buildWordHtml(title, text) {
        const safe = String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>' +
            title + '</title></head><body style="font-family: Times New Roman, serif; font-size: 14pt; white-space: pre-wrap;">' +
            safe + '</body></html>';
    }

    const templates = {
        definition: {
            title: 'Определение о принятии',
            fields: ['judgeName', 'courtDistrict', 'hearingDate', 'hearingTime'],
            generate: (caseData, fields) => `
ОПРЕДЕЛЕНИЕ
о принятии искового заявления к производству

${new Date().toLocaleDateString('ru-RU')}                                          Дело № ${caseData.caseNum}

Мировой судья судебного участка № ${fields.courtDistrict || '9'}
${fields.judgeName || '[ФИО судьи]'}

рассмотрев заявление ${caseData.sender}
к ${caseData.defendant || '[ответчик]'}
о ${caseData.summary},

УСТАНОВИЛ:

${new Date().toLocaleDateString('ru-RU')} в мировой суд поступило исковое заявление ${caseData.sender} к ${caseData.defendant || '[ответчик]'} о ${caseData.summary}.

При рассмотрении вопроса о принятии заявления к производству суд установил, что заявление подано с соблюдением требований статей 131, 132 ГПК РФ.

Руководствуясь статьями 133, 147, 150 ГПК РФ,

ОПРЕДЕЛИЛ:

1. Принять исковое заявление ${caseData.sender} к производству.
2. Назначить предварительное судебное заседание на ${displayDate(fields.hearingDate)} в ${fields.hearingTime || '[время]'}.
3. Вызвать в судебное заседание: истца, ответчика.

Мировой судья                                                    ${fields.judgeName || '[подпись]'}
            `
        },
        summons: {
            title: 'Судебная повестка',
            fields: ['judgeName', 'hearingDate', 'hearingTime', 'room'],
            generate: (caseData, fields) => `
СУДЕБНАЯ ПОВЕСТКА

Дело № ${caseData.caseNum}
Судебный участок № 9

Вам надлежит явиться ${displayDate(fields.hearingDate)} в ${fields.hearingTime || '[время]'}
в помещение мирового судьи судебного участка № 9
${fields.room ? 'Зал/кабинет: ' + fields.room : ''}

Слушается дело: ${caseData.summary}

Истец: ${caseData.sender}
Ответчик: ${caseData.defendant || '[указать]'}

При неявке в судебное заседание дело может быть рассмотрено в Ваше отсутствие (ст. 167 ГПК РФ).

При себе иметь: паспорт, документы, относящиеся к делу.

Мировой судья                                                    ${fields.judgeName || '[подпись]'}
            `
        },
        decision: {
            title: 'Решение суда',
            fields: ['judgeName', 'courtDistrict', 'secretary', 'decision'],
            generate: (caseData, fields) => `
РЕШЕНИЕ

Именем Российской Федерации

${new Date().toLocaleDateString('ru-RU')}                                          Дело № ${caseData.caseNum}

Мировой судья судебного участка № ${fields.courtDistrict || '9'}
${fields.judgeName || '[ФИО судьи]'}

при секретаре ${fields.secretary || '[ФИО секретаря]'},
рассмотрев в открытом судебном заседании гражданское дело по иску ${caseData.sender}
к ${caseData.defendant || '[ответчик]'}
о ${caseData.summary},

УСТАНОВИЛ:

Суд, исследовав материалы дела, выслушав объяснения сторон, приходит к следующему.

Руководствуясь статьями 194–199 ГПК РФ, суд

РЕШИЛ:

${fields.decision || '[резолютивная часть]'}

Решение может быть обжаловано в апелляционном порядке в течение месяца со дня принятия решения в окончательной форме.

Мировой судья                                                    ${fields.judgeName || '[подпись]'}
            `
        },
        ruling: {
            title: 'Определение об отложении',
            fields: ['judgeName', 'hearingDate', 'hearingTime', 'room', 'reason'],
            generate: (caseData, fields) => `
ОПРЕДЕЛЕНИЕ
об отложении судебного разбирательства

${new Date().toLocaleDateString('ru-RU')}                                          Дело № ${caseData.caseNum}

Мировой судья судебного участка № 9
${fields.judgeName || '[ФИО судьи]'}

рассмотрев в судебном заседании гражданское дело по иску ${caseData.sender}
к ${caseData.defendant || '[ответчик]'}
о ${caseData.summary},

УСТАНОВИЛ:

Судебное разбирательство подлежит отложению по следующему основанию:
${fields.reason || '[указать основание: неявка лица, истребование доказательств и т.п.]'}

Руководствуясь статьями 167, 169 ГПК РФ,

ОПРЕДЕЛИЛ:

Отложить судебное разбирательство по делу № ${caseData.caseNum} на ${displayDate(fields.hearingDate)} в ${fields.hearingTime || '[время]'}${fields.room ? ', ' + fields.room : ''}.
Известить лиц, участвующих в деле, о времени и месте нового заседания.

Мировой судья                                                    ${fields.judgeName || '[подпись]'}
            `
        },
        protocol: {
            title: 'Протокол заседания',
            fields: ['judgeName', 'secretary', 'hearingDate', 'hearingTime', 'room', 'appeared'],
            generate: (caseData, fields) => `
ПРОТОКОЛ
судебного заседания

Дело № ${caseData.caseNum}
${displayDate(fields.hearingDate)} ${fields.hearingTime || ''}
${fields.room || 'Зал судебного заседания'}

Мировой судья судебного участка № 9 ${fields.judgeName || '[ФИО судьи]'}
при секретаре ${fields.secretary || '[ФИО секретаря]'}

рассмотрел в открытом судебном заседании гражданское дело по иску
${caseData.sender} к ${caseData.defendant || '[ответчик]'} о ${caseData.summary}.

Явились:
${fields.appeared || '[указать явившихся лиц]'}

Суд разъяснил лицам, участвующим в деле, их процессуальные права и обязанности.
Заслушаны объяснения сторон, исследованы материалы дела.

Протокол составлен ${new Date().toLocaleDateString('ru-RU')}.

Мировой судья                                                    ${fields.judgeName || '[подпись]'}
Секретарь                                                        ${fields.secretary || '[подпись]'}
            `
        },
        writ: {
            title: 'Исполнительный лист',
            fields: ['judgeName', 'decisionDate', 'recoverer', 'debtor', 'amount'],
            generate: (caseData, fields) => `
ИСПОЛНИТЕЛЬНЫЙ ЛИСТ

Дело № ${caseData.caseNum}
Судебный участок № 9

${displayDate(fields.decisionDate)} мировым судьей ${fields.judgeName || '[ФИО судьи]'}
вынесено решение по иску ${caseData.sender} к ${caseData.defendant || '[ответчик]'}
о ${caseData.summary}.

Взыскатель: ${fields.recoverer || caseData.sender}
Должник: ${fields.debtor || caseData.defendant || '[должник]'}

Резолютивная часть решения подлежит исполнению.
Сумма взыскания: ${fields.amount || '[сумма]'}

Исполнительный лист выдан ${new Date().toLocaleDateString('ru-RU')} для предъявления к исполнению.

Мировой судья                                                    ${fields.judgeName || '[подпись]'}
            `
        }
    };

    document.querySelectorAll('.btn-generate-template').forEach(btn => {
        btn.addEventListener('click', function() {
            const card = this.closest('.template-card');
            openTemplateModal(card.dataset.template);
        });
    });

    document.getElementById('generate-template-btn')?.addEventListener('click', function() {
        const templateType = document.getElementById('modal-template').dataset.template;
        const templateConfig = templates[templateType];
        const caseSelect = document.getElementById('template-case');
        const caseId = caseSelect.value;
        
        if (!templateConfig) {
            showAlert('Выберите тип документа');
            return;
        }
        if (!caseId) {
            showAlert('Заполните все поля');
            return;
        }
        
        const caseData = casesDB.find(c => c.id == caseId);
        if (!caseData) {
            showAlert('Дело не найдено');
            return;
        }
        const fields = {};
        let missingField = false;
        
        if (templateConfig.fields) {
            templateConfig.fields.forEach(field => {
                const input = document.getElementById('field-' + field);
                fields[field] = input ? input.value.trim() : '';
                if (!fields[field]) missingField = true;
            });
        }
        if (missingField) {
            showAlert('Заполните все поля');
            return;
        }
        
        const documentText = templateConfig.generate(caseData, fields).trim();
        
        const preview = document.getElementById('template-preview');
        const previewContent = document.getElementById('template-preview-content');
        previewContent.innerText = documentText;
        preview.style.display = 'block';
        preview.scrollIntoView({ block: 'nearest' });
        
        const downloadBtn = document.getElementById('download-template-btn');
        const printBtn = document.getElementById('print-template-btn');
        downloadBtn.style.display = 'inline-block';
        printBtn.style.display = 'inline-block';
        downloadBtn.onclick = () => {
            const blob = new Blob(['\ufeff' + buildWordHtml(templateConfig.title, documentText)], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = templateConfig.title + ' - ' + caseData.caseNum + '.doc';
            link.click();
            URL.revokeObjectURL(url);
        };
        printBtn.onclick = () => {
            printHtml(buildWordHtml(templateConfig.title, documentText));
        };
    });

    function closeTemplateModal() {
        document.getElementById('modal-template').classList.remove('show');
        resetTemplatePreview();
    }

    document.getElementById('close-template-btn')?.addEventListener('click', closeTemplateModal);
    document.getElementById('template-close-btn')?.addEventListener('click', closeTemplateModal);

    // Инициализация при открытии разделов
    function initCalendar() {
        loadHearings();
        if (!selectedCalendarDate) {
            const list = document.getElementById('hearings-list');
            if (list && !list.innerHTML) {
                list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Выберите день в календаре или нажмите «Назначить заседание»</p>';
            }
        }
    }

    function initReference() {
        loadReference('gpk');
    }
});
