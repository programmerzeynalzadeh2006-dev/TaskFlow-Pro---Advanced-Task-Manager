// =============== متغیرهای اصلی ===============
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
let currentFilter = 'همه';
let currentCategory = 'همه';
let currentSort = 'newest';
let searchQuery = '';
let selectedTasks = new Set();
let settings = JSON.parse(localStorage.getItem('taskflow_settings')) || {
    autoSave: true,
    notifications: true,
    confirmDelete: true,
    sound: 'on',
    theme: 'light'
};

// =============== عناصر DOM ===============
const elements = {
    // ورودی‌ها
    taskInput: document.getElementById('task-input'),
    categorySelect: document.getElementById('category-select'),
    taskDate: document.getElementById('task-date'),
    taskTime: document.getElementById('task-time'),
    searchInput: document.getElementById('search-input'),
    sortSelect: document.getElementById('sort-select'),
    
    // دکمه‌ها
    addTaskBtn: document.getElementById('add-task-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    
    // فیلترها
    filterBtns: document.querySelectorAll('.filter-btn'),
    categoryBtns: document.querySelectorAll('.category-btn'),
    
    // لیست‌ها
    tasksContainer: document.getElementById('tasks-container'),
    emptyState: document.getElementById('empty-state'),
    
    // آمار
    totalTasks: document.getElementById('total-tasks'),
    completedTasks: document.getElementById('completed-tasks'),
    todayTasks: document.getElementById('today-tasks'),
    
    // عملیات گروهی
    bulkActions: document.getElementById('bulk-actions'),
    selectedCount: document.getElementById('selected-count'),
    markCompletedBtn: document.getElementById('mark-completed'),
    markImportantBtn: document.getElementById('mark-important'),
    deleteSelectedBtn: document.getElementById('delete-selected'),
    
    // مدال
    settingsModal: document.getElementById('settings-modal'),
    closeModalBtn: document.querySelector('.close-modal'),
    
    // تنظیمات
    autoSave: document.getElementById('auto-save'),
    notifications: document.getElementById('notifications'),
    confirmDelete: document.getElementById('confirm-delete'),
    soundSelect: document.getElementById('sound-select'),
    clearAllBtn: document.getElementById('clear-all'),
    
    // خروجی
    exportPdf: document.getElementById('export-pdf'),
    exportJson: document.getElementById('export-json'),
    lastSave: document.getElementById('last-save'),
    
    // اعلان
    notification: document.getElementById('notification')
};

// =============== کلاس Task ===============
class Task {
    constructor(text, category = 'عمومی', date = null, time = null) {
        this.id = Date.now() + Math.random().toString(36).substr(2, 9);
        this.text = text;
        this.category = category;
        this.date = date;
        this.time = time;
        this.completed = false;
        this.important = false;
        this.createdAt = new Date().toISOString();
        this.completedAt = null;
    }
    
    get isToday() {
        if (!this.date) return false;
        const taskDate = new Date(this.date);
        const today = new Date();
        return taskDate.toDateString() === today.toDateString();
    }
    
    get isOverdue() {
        if (this.completed || !this.date) return false;
        const taskDate = new Date(this.date);
        const now = new Date();
        return taskDate < now && !this.completed;
    }
    
    get displayTime() {
        if (!this.date) return 'بدون تاریخ';
        
        const date = new Date(this.date);
        const options = { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            calendar: 'persian'
        };
        
        let result = date.toLocaleDateString('fa-IR', options);
        
        if (this.time) {
            const [hours, minutes] = this.time.split(':');
            result += ` - ${hours}:${minutes}`;
        }
        
        return result;
    }
}

// =============== مدیریت کارها ===============
function addTask() {
    const text = elements.taskInput.value.trim();
    if (!text) {
        showNotification('لطفا متن کار را وارد کنید', 'warning');
        elements.taskInput.focus();
        return;
    }
    
    const task = new Task(
        text,
        elements.categorySelect.value,
        elements.taskDate.value || null,
        elements.taskTime.value || null
    );
    
    tasks.unshift(task);
    saveTasks();
    renderTasks();
    clearInputs();
    showNotification('کار با موفقیت اضافه شد', 'success');
    playSound('add');
}

function deleteTask(taskId) {
    if (settings.confirmDelete && !confirm('آیا از حذف این کار مطمئنید؟')) {
        return;
    }
    
    tasks = tasks.filter(task => task.id !== taskId);
    saveTasks();
    renderTasks();
    showNotification('کار حذف شد', 'info');
    playSound('delete');
}

function toggleTaskCompletion(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.completed = !task.completed;
        task.completedAt = task.completed ? new Date().toISOString() : null;
        saveTasks();
        renderTasks();
        playSound(task.completed ? 'complete' : 'undo');
    }
}

function toggleTaskImportance(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.important = !task.important;
        saveTasks();
        renderTasks();
        playSound('important');
    }
}

function updateTask(taskId, updates) {
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
        tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
        saveTasks();
        renderTasks();
    }
}

// =============== فیلتر و مرتب‌سازی ===============
function filterTasks() {
    let filtered = [...tasks];
    
    // فیلتر بر اساس وضعیت
    switch(currentFilter) {
        case 'انجام شده':
            filtered = filtered.filter(task => task.completed);
            break;
        case 'انجام نشده':
            filtered = filtered.filter(task => !task.completed);
            break;
        case 'مهم':
            filtered = filtered.filter(task => task.important);
            break;
        case 'دیرکرد':
            filtered = filtered.filter(task => task.isOverdue);
            break;
    }
    
    // فیلتر بر اساس دسته‌بندی
    if (currentCategory !== 'همه') {
        if (currentCategory === 'امروز') {
            filtered = filtered.filter(task => task.isToday);
        } else {
            filtered = filtered.filter(task => task.category === currentCategory);
        }
    }
    
    // جستجو
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(task => 
            task.text.toLowerCase().includes(query) ||
            task.category.toLowerCase().includes(query)
        );
    }
    
    // مرتب‌سازی
    filtered.sort((a, b) => {
        switch(currentSort) {
            case 'newest':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'oldest':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'priority':
                if (a.important && !b.important) return -1;
                if (!a.important && b.important) return 1;
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'date':
                if (!a.date && b.date) return 1;
                if (a.date && !b.date) return -1;
                if (!a.date && !b.date) return 0;
                return new Date(a.date) - new Date(b.date);
            default:
                return 0;
        }
    });
    
    return filtered;
}

// =============== رندر لیست کارها ===============
function renderTasks() {
    const filteredTasks = filterTasks();
    
    if (filteredTasks.length === 0) {
        elements.emptyState.style.display = 'block';
        elements.tasksContainer.innerHTML = '';
        elements.tasksContainer.appendChild(elements.emptyState);
        return;
    }
    
    elements.emptyState.style.display = 'none';
    
    elements.tasksContainer.innerHTML = filteredTasks.map(task => `
        <div class="task-card ${task.completed ? 'completed' : ''} 
                ${task.important ? 'important' : ''} 
                ${task.isOverdue ? 'overdue' : ''}"
             data-id="${task.id}">
            
            <div class="task-header">
                <div class="task-title">
                    <input type="checkbox" 
                           class="task-checkbox" 
                           ${task.completed ? 'checked' : ''}
                           ${selectedTasks.has(task.id) ? 'checked' : ''}
                           onchange="handleCheckboxChange('${task.id}')">
                    
                    <span class="task-text ${task.completed ? 'completed' : ''}">
                        ${escapeHtml(task.text)}
                    </span>
                </div>
                
                <div class="task-actions">
                    <button class="task-action-btn important-btn ${task.important ? 'active' : ''}"
                            onclick="toggleTaskImportance('${task.id}')"
                            title="${task.important ? 'حذف علامت مهم' : 'علامت‌گذاری مهم'}">
                        <i class="fas fa-star"></i>
                    </button>
                    
                    <button class="task-action-btn delete-btn"
                            onclick="deleteTask('${task.id}')"
                            title="حذف کار">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            
            <div class="task-details">
                <span class="task-category category-${task.category}">
                    <i class="fas fa-tag"></i>
                    ${getCategoryIcon(task.category)} ${task.category}
                </span>
                
                <span class="task-time ${task.isOverdue ? 'overdue' : ''}">
                    <i class="fas fa-clock"></i>
                    ${task.displayTime}
                    ${task.isOverdue ? ' (دیرکرد)' : ''}
                </span>
            </div>
        </div>
    `).join('');
    
    updateStats();
    updateBulkActions();
}

// =============== عملیات گروهی ===============
function handleCheckboxChange(taskId) {
    if (selectedTasks.has(taskId)) {
        selectedTasks.delete(taskId);
    } else {
        selectedTasks.add(taskId);
    }
    
    updateBulkActions();
}

function updateBulkActions() {
    const count = selectedTasks.size;
    
    if (count > 0) {
        elements.bulkActions.style.display = 'flex';
        elements.selectedCount.textContent = count;
    } else {
        elements.bulkActions.style.display = 'none';
    }
}

function markSelectedAsCompleted() {
    selectedTasks.forEach(taskId => {
        const task = tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            task.completed = true;
            task.completedAt = new Date().toISOString();
        }
    });
    
    saveTasks();
    renderTasks();
    selectedTasks.clear();
    showNotification(`${selectedTasks.size} کار به عنوان انجام شده علامت‌گذاری شد`, 'success');
}

function markSelectedAsImportant() {
    selectedTasks.forEach(taskId => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            task.important = !task.important;
        }
    });
    
    saveTasks();
    renderTasks();
    showNotification('وضعیت اهمیت کارها به‌روزرسانی شد', 'info');
}

function deleteSelectedTasks() {
    if (!confirm(`آیا از حذف ${selectedTasks.size} کار انتخاب شده مطمئنید؟`)) {
        return;
    }
    
    tasks = tasks.filter(task => !selectedTasks.has(task.id));
    saveTasks();
    renderTasks();
    selectedTasks.clear();
    showNotification('کارهای انتخاب شده حذف شدند', 'info');
}

// =============== مدیریت ذخیره‌سازی ===============
function saveTasks() {
    if (settings.autoSave) {
        localStorage.setItem('tasks', JSON.stringify(tasks));
        updateLastSaveTime();
        playSound('save');
    }
}

function updateLastSaveTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    elements.lastSave.textContent = `آخرین ذخیره: ${timeString}`;
}

function clearAllTasks() {
    if (!confirm('آیا از حذف تمام کارها مطمئنید؟ این عمل قابل برگشت نیست!')) {
        return;
    }
    
    tasks = [];
    saveTasks();
    renderTasks();
    showNotification('تمامی کارها حذف شدند', 'warning');
}

// =============== ابزارها ===============
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getCategoryIcon(category) {
    const icons = {
        'عمومی': '🏷️',
        'کار': '💼',
        'شخصی': '👤',
        'خرید': '🛒',
        'سلامتی': '❤️',
        'تحصیل': '🎓'
    };
    return icons[category] || '🏷️';
}

function showNotification(message, type = 'info') {
    if (!settings.notifications) return;
    
    elements.notification.textContent = message;
    elements.notification.style.background = {
        'success': '#2ed573',
        'error': '#ff4757',
        'warning': '#ffa502',
        'info': '#1e90ff'
    }[type];
    
    elements.notification.style.display = 'block';
    
    setTimeout(() => {
        elements.notification.style.display = 'none';
    }, 3000);
}

function playSound(type) {
    if (settings.sound !== 'on') return;
    
    const sounds = {
        'add': 'https://assets.mixkit.co/sfx/preview/mixkit-unlock-game-notification-253.mp3',
        'delete': 'https://assets.mixkit.co/sfx/preview/mixkit-trash-notification-alert-2473.mp3',
        'complete': 'https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3',
        'important': 'https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3',
        'save': 'https://assets.mixkit.co/sfx/preview/mixkit-plastic-bubble-click-1124.mp3',
        'undo': 'https://assets.mixkit.co/sfx/preview/mixkit-retro-game-emergency-alarm-1000.mp3'
    };
    
    if (sounds[type]) {
        const audio = new Audio(sounds[type]);
        audio.volume = 0.3;
        audio.play().catch(() => {});
    }
}

// =============== خروجی ===============
function exportToJson() {
    const dataStr = JSON.stringify(tasks, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `tasks-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showNotification('خروجی JSON با موفقیت دانلود شد', 'success');
}

function exportToPdf() {
    showNotification('در حال آماده‌سازی خروجی PDF...', 'info');
    
    // شبیه‌سازی تولید PDF
    setTimeout(() => {
        const docDefinition = {
            content: [
                { text: 'لیست کارها - TaskFlow Pro', style: 'header' },
                { text: `تاریخ تولید: ${new Date().toLocaleDateString('fa-IR')}`, style: 'subheader' },
                { text: '\n\n' },
                {
                    table: {
                        headerRows: 1,
                        widths: ['*', 'auto', 'auto', 'auto'],
                        body: [
                            ['کار', 'دسته‌بندی', 'وضعیت', 'تاریخ'],
                            ...tasks.map(task => [
                                task.text,
                                task.category,
                                task.completed ? '✅ انجام شده' : '⏳ در انتظار',
                                task.displayTime
                            ])
                        ]
                    }
                }
            ],
            styles: {
                header: { fontSize: 18, bold: true, alignment: 'center', margin: [0, 0, 0, 10] },
                subheader: { fontSize: 12, alignment: 'center', margin: [0, 0, 0, 20] }
            },
            defaultStyle: { font: 'Vazirmatn' }
        };
        
        // در واقعیت از pdfmake استفاده می‌کنیم
        showNotification('برای خروجی PDF واقعی، pdfmake را نصب کنید', 'warning');
    }, 1000);
}

// =============== تنظیمات ===============
function loadSettings() {
    elements.autoSave.checked = settings.autoSave;
    elements.notifications.checked = settings.notifications;
    elements.confirmDelete.checked = settings.confirmDelete;
    elements.soundSelect.value = settings.sound;
    
    // اعمال تم
    document.body.setAttribute('data-theme', settings.theme);
}

function saveSettings() {
    settings = {
        autoSave: elements.autoSave.checked,
        notifications: elements.notifications.checked,
        confirmDelete: elements.confirmDelete.checked,
        sound: elements.soundSelect.value,
        theme: document.body.getAttribute('data-theme') || 'light'
    };
    
    localStorage.setItem('taskflow_settings', JSON.stringify(settings));
    showNotification('تنظیمات ذخیره شد', 'success');
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.body.setAttribute('data-theme', newTheme);
    settings.theme = newTheme;
    saveSettings();
    showNotification(`تم ${newTheme === 'light' ? 'روشن' : 'تاریک'} فعال شد`, 'info');
}

// =============== آمار ===============
function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(task => task.completed).length;
    const today = tasks.filter(task => task.isToday).length;
    
    elements.totalTasks.textContent = total;
    elements.completedTasks.textContent = completed;
    elements.todayTasks.textContent = today;
}

// =============== راه‌اندازی اولیه ===============
function init() {
    // تنظیم تاریخ پیش‌فرض به امروز
    const today = new Date().toISOString().split('T')[0];
    elements.taskDate.min = today;
    elements.taskDate.value = today;
    
    // تنظیم زمان پیش‌فرض
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = (now.getMinutes() + 30).toString().padStart(2, '0');
    elements.taskTime.value = `${hours}:${minutes}`;
    
    // بارگذاری تنظیمات
    loadSettings();
    
    // رندر اولیه
    renderTasks();
    
    // بروزرسانی زمان ذخیره
    updateLastSaveTime();
}

// =============== Event Listeners ===============
document.addEventListener('DOMContentLoaded', () => {
    init();
    
    // اضافه کردن کار
    elements.addTaskBtn.addEventListener('click', addTask);
    elements.taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });
    
    // تغییر تم
    elements.themeToggle.addEventListener('click', toggleTheme);
    
    // فیلترها
    elements.filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });
    
    // دسته‌بندی‌ها
    elements.categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.categoryBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            renderTasks();
        });
    });
    
    // جستجو
    elements.searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderTasks();
    });
    
    // مرتب‌سازی
    elements.sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderTasks();
    });
    
    // عملیات گروهی
    elements.markCompletedBtn.addEventListener('click', markSelectedAsCompleted);
    elements.markImportantBtn.addEventListener('click', markSelectedAsImportant);
    elements.deleteSelectedBtn.addEventListener('click', deleteSelectedTasks);
    
    // تنظیمات
    elements.autoSave.addEventListener('change', saveSettings);
    elements.notifications.addEventListener('change', saveSettings);
    elements.confirmDelete.addEventListener('change', saveSettings);
    elements.soundSelect.addEventListener('change', saveSettings);
    elements.clearAllBtn.addEventListener('click', clearAllTasks);
    
    // خروجی
    elements.exportJson.addEventListener('click', exportToJson);
    elements.exportPdf.addEventListener('click', exportToPdf);
    
    // مدال
    elements.closeModalBtn.addEventListener('click', () => {
        elements.settingsModal.style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            elements.settingsModal.style.display = 'none';
        }
    });
    
    // Placeholder متحرک
    const placeholders = [
        "یادگیری React.js...",
        "خرید هدیه تولد...",
        "تماس با مشتری...",
        "ورزش صبحگاهی...",
        "خواندن کتاب جدید..."
    ];
    
    let placeholderIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    
    function typePlaceholder() {
        const currentText = placeholders[placeholderIndex];
        
        if (!isDeleting && charIndex <= currentText.length) {
            elements.taskInput.placeholder = currentText.substring(0, charIndex);
            charIndex++;
            setTimeout(typePlaceholder, 100);
        } else if (isDeleting && charIndex >= 0) {
            elements.taskInput.placeholder = currentText.substring(0, charIndex);
            charIndex--;
            setTimeout(typePlaceholder, 50);
        } else {
            isDeleting = !isDeleting;
            if (!isDeleting) {
                placeholderIndex = (placeholderIndex + 1) % placeholders.length;
            }
            setTimeout(typePlaceholder, 1000);
        }
    }
    
    typePlaceholder();
});

// =============== توابع عمومی برای HTML ===============
window.handleCheckboxChange = handleCheckboxChange;
window.toggleTaskCompletion = toggleTaskCompletion;
window.toggleTaskImportance = toggleTaskImportance;
window.deleteTask = deleteTask;

// تابع کمکی برای پاک کردن ورودی‌ها
function clearInputs() {
    elements.taskInput.value = '';
    elements.taskInput.focus();
}