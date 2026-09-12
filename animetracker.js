// Anime Tracker Application

// Build number, read from the ?v= on this script's own tag. Lets us tell at a
// glance whether the phone is running the version we just published.
const APP_BUILD = (() => {
    const src = (document.currentScript && document.currentScript.src) || '';
    const match = src.match(/[?&]v=(\d+)/);
    return match ? match[1] : '?';
})();

class AnimeTracker {
    constructor() {
        this.animeList = [];
        this.filteredList = [];
        this.searchTerm = '';
        this.theme = localStorage.getItem('animeTrackerTheme') || 'light';
        this.sortType = localStorage.getItem('animeTrackerSortType') || 'alphabetical';
        this.isRandomized = false;
        this.pendingImageData = null;
        this.editPendingImageData = null;
        this.editingAnimeId = null;

        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.applyTheme();
        // Never let a cosmetic label stop init(): the rest of this method is
        // what puts the user's list on screen.
        const buildLabel = document.getElementById('buildLabel');
        if (buildLabel) buildLabel.textContent = 'build ' + APP_BUILD;
        // Set sort select value
        document.getElementById('sortSelect').value = this.sortType;
        this.updateDisplay();
        this.checkExpiredFlags();
    }

    setupEventListeners() {
        // Add anime modal
        document.getElementById('addAnimeBtn').addEventListener('click', () => this.openAddModal());
        document.getElementById('closeAddModal').addEventListener('click', () => this.closeAddModal());
        document.getElementById('cancelAddBtn').addEventListener('click', () => this.closeAddModal());
        document.getElementById('addModal').addEventListener('click', (e) => {
            if (e.target.id === 'addModal') {
                this.closeAddModal();
            }
        });

        // Add anime
        document.getElementById('addBtn').addEventListener('click', () => {
            this.addAnime();
            this.closeAddModal();
        });
        document.getElementById('animeNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addAnime();
                this.closeAddModal();
            }
        });
        document.getElementById('episodeInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addAnime();
                this.closeAddModal();
            }
        });
        document.getElementById('imageUrlInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addAnime();
                this.closeAddModal();
            }
        });

        // Image file selection for add
        document.getElementById('imageFileInput').addEventListener('change', (e) => {
            this.handleImageFileSelect(e, 'add');
        });

        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.updateDisplay();
        });

        // Sort
        document.getElementById('sortSelect').addEventListener('change', (e) => {
            this.sortType = e.target.value;
            localStorage.setItem('animeTrackerSortType', this.sortType);
            this.updateDisplay();
        });

        // Randomize button
        document.getElementById('randomBtn').addEventListener('click', () => {
            this.sortType = 'random';
            document.getElementById('sortSelect').value = 'random';
            localStorage.setItem('animeTrackerSortType', this.sortType);
            this.updateDisplay();
        });

        // Stats modal
        document.getElementById('statsBtn').addEventListener('click', () => this.openStatsModal());
        document.getElementById('closeStatsModal').addEventListener('click', () => this.closeStatsModal());
        document.getElementById('statsModal').addEventListener('click', (e) => {
            if (e.target.id === 'statsModal') {
                this.closeStatsModal();
            }
        });
        document.getElementById('optimizeBtn').addEventListener('click', () => this.optimizeAllImages());

        // Backup: export / import / send to PC
        document.getElementById('exportBtn').addEventListener('click', () => this.exportBackup());
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFileInput').click();
        });
        document.getElementById('importFileInput').addEventListener('change', (e) => {
            this.importBackupFile(e.target.files[0]);
            e.target.value = '';
        });
        document.getElementById('sendPcBtn').addEventListener('click', () => this.sendBackupToPC());

        // Edit modal
        document.getElementById('closeEditModal').addEventListener('click', () => this.closeEditModal());
        document.getElementById('cancelEditBtn').addEventListener('click', () => this.closeEditModal());
        document.getElementById('editModal').addEventListener('click', (e) => {
            if (e.target.id === 'editModal') {
                this.closeEditModal();
            }
        });
        document.getElementById('saveEditBtn').addEventListener('click', () => this.saveEditAnime());
        document.getElementById('removeImageBtn').addEventListener('click', () => this.removeImageFromEdit());
        document.getElementById('editImageFile').addEventListener('change', (e) => {
            this.handleImageFileSelect(e, 'edit');
        });

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
    }

    openAddModal() {
        document.getElementById('animeNameInput').value = '';
        document.getElementById('episodeInput').value = '';
        document.getElementById('imageUrlInput').value = '';
        document.getElementById('imageFileInput').value = '';
        document.getElementById('imagePreview').innerHTML = '';
        this.pendingImageData = null;
        document.getElementById('addModal').classList.add('show');
        document.getElementById('animeNameInput').focus();
    }

    closeAddModal() {
        document.getElementById('addModal').classList.remove('show');
        // Don't clear fields here, let user see what they entered if they reopen
    }

    addAnime() {
        const nameInput = document.getElementById('animeNameInput');
        const episodeInput = document.getElementById('episodeInput');
        const imageUrlInput = document.getElementById('imageUrlInput');
        const imageFileInput = document.getElementById('imageFileInput');
        const imagePreview = document.getElementById('imagePreview');

        const name = nameInput.value.trim();
        const episode = parseInt(episodeInput.value) || 0;
        let imageUrl = imageUrlInput.value.trim();

        if (!name) {
            return;
        }

        // Check if anime already exists
        if (this.animeList.some(anime => anime.name.toLowerCase() === name.toLowerCase())) {
            return;
        }

        // Use file if selected, otherwise use URL
        if (this.pendingImageData) {
            imageUrl = this.pendingImageData;
            this.pendingImageData = null;
        }

        const anime = {
            id: Date.now(),
            name: name,
            episode: episode,
            status: 'normal', // normal, up-to-date, completed
            upToDateTimestamp: null,
            createdAt: Date.now(),
            imageUrl: imageUrl || null
        };

        this.animeList.push(anime);

        if (this.saveData()) {
            nameInput.value = '';
            episodeInput.value = '';
            imageUrlInput.value = '';
            imageFileInput.value = '';
            imagePreview.innerHTML = '';

            this.updateDisplay();
        } else {
            this.animeList.pop(); // Remove the unsaved item
        }
    }

    handleImageFileSelect(event, mode) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            // Show error message
            const errorMsg = document.createElement('div');
            errorMsg.style.color = 'var(--danger-color)';
            errorMsg.style.fontSize = '0.85rem';
            errorMsg.style.marginTop = '5px';
            errorMsg.textContent = 'Please select an image file';

            const preview = mode === 'add'
                ? document.getElementById('imagePreview')
                : document.getElementById('editImagePreview');

            // Remove existing error if any
            const existingError = preview.querySelector('.error-msg');
            if (existingError) existingError.remove();

            errorMsg.className = 'error-msg';
            preview.appendChild(errorMsg);

            setTimeout(() => {
                errorMsg.remove();
            }, 3000);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const imageData = this.compressImage(img);

                if (mode === 'add') {
                    this.pendingImageData = imageData;
                    const preview = document.getElementById('imagePreview');
                    preview.innerHTML = `<img src="${imageData}" alt="Preview" style="max-width: 100px; max-height: 60px; border-radius: 4px; margin-top: 5px;">`;
                } else if (mode === 'edit') {
                    this.editPendingImageData = imageData;
                    const preview = document.getElementById('editImagePreview');
                    preview.innerHTML = `<img src="${imageData}" alt="Preview" style="max-width: 200px; max-height: 120px; border-radius: 4px; margin-top: 5px;">`;
                    document.getElementById('editImageUrl').value = '';
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    compressImage(img) {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 400;

        if (width > height) {
            if (width > MAX_SIZE) {
                height *= MAX_SIZE / width;
                width = MAX_SIZE;
            }
        } else {
            if (height > MAX_SIZE) {
                width *= MAX_SIZE / height;
                height = MAX_SIZE;
            }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to JPEG with 0.7 quality to save space
        return canvas.toDataURL('image/jpeg', 0.7);
    }

    updateEpisode(animeId, change) {
        const anime = this.animeList.find(a => a.id === animeId);
        if (!anime) return;

        const newEpisode = Math.max(0, anime.episode + change);
        anime.episode = newEpisode;

        // If status was up-to-date and episode changes, reset status
        if (anime.status === 'up-to-date') {
            anime.status = 'normal';
            anime.upToDateTimestamp = null;
        }

        this.saveData();
        this.updateDisplay();
    }

    setEpisode(animeId, value) {
        const anime = this.animeList.find(a => a.id === animeId);
        if (!anime) return;

        const episode = Math.max(0, parseInt(value) || 0);
        anime.episode = episode;

        // If status was up-to-date and episode changes, reset status
        if (anime.status === 'up-to-date') {
            anime.status = 'normal';
            anime.upToDateTimestamp = null;
        }

        this.saveData();
        this.updateDisplay();
    }

    toggleUpToDate(animeId) {
        const anime = this.animeList.find(a => a.id === animeId);
        if (!anime) return;

        if (anime.status === 'up-to-date') {
            anime.status = 'normal';
            anime.upToDateTimestamp = null;
            // Reset randomization when changing status back to normal
            this.isRandomized = false;
        } else {
            anime.status = 'up-to-date';
            anime.upToDateTimestamp = Date.now();
        }

        this.saveData();
        this.updateDisplay();
    }

    toggleCompleted(animeId) {
        const anime = this.animeList.find(a => a.id === animeId);
        if (!anime) return;

        if (anime.status === 'completed') {
            anime.status = 'normal';
            // Reset randomization when changing status back to normal
            this.isRandomized = false;
        } else {
            anime.status = 'completed';
            anime.upToDateTimestamp = null;
        }

        this.saveData();
        this.updateDisplay();
    }

    deleteAnime(animeId) {
        const deletedAnime = this.animeList.find(a => a.id === animeId);
        this.animeList = this.animeList.filter(a => a.id !== animeId);
        // Reset randomization if we deleted a normal anime (might affect order)
        if (deletedAnime && deletedAnime.status === 'normal') {
            this.isRandomized = false;
        }
        this.saveData();
        this.updateDisplay();
    }

    editAnimeName(animeId, newName) {
        const anime = this.animeList.find(a => a.id === animeId);
        if (!anime) return;

        const trimmedName = newName.trim();
        if (!trimmedName) return;

        // Check if name already exists (excluding current anime)
        if (this.animeList.some(a => a.id !== animeId && a.name.toLowerCase() === trimmedName.toLowerCase())) {
            return;
        }

        anime.name = trimmedName;
        this.saveData();
        this.updateDisplay();
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    checkExpiredFlags() {
        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        let updated = false;

        this.animeList.forEach(anime => {
            if (anime.status === 'up-to-date' && anime.upToDateTimestamp) {
                if (now - anime.upToDateTimestamp >= sevenDays) {
                    anime.status = 'normal';
                    anime.upToDateTimestamp = null;
                    updated = true;
                }
            }
        });

        if (updated) {
            this.saveData();
            this.updateDisplay();
        }
    }

    getDaysUntilExpiry(timestamp) {
        if (!timestamp) return null;
        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        const remaining = sevenDays - (now - timestamp);
        const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
        return days > 0 ? days : 0;
    }

    filterAnime() {
        if (!this.searchTerm) {
            this.filteredList = [...this.animeList];
        } else {
            this.filteredList = this.animeList.filter(anime =>
                anime.name.toLowerCase().includes(this.searchTerm)
            );
        }
    }

    sortAnime() {
        // First, separate by status
        const normalAnime = this.filteredList.filter(a => a.status === 'normal');
        const upToDateAnime = this.filteredList.filter(a => a.status === 'up-to-date');
        const completedAnime = this.filteredList.filter(a => a.status === 'completed');

        // Sort each group based on sortType
        const sortFunction = (a, b) => {
            switch (this.sortType) {
                case 'alphabetical':
                    return a.name.localeCompare(b.name);

                case 'alphabetical-desc':
                    return b.name.localeCompare(a.name);

                case 'date-added':
                    const dateA = a.createdAt || a.id; // Fallback to id if createdAt doesn't exist
                    const dateB = b.createdAt || b.id;
                    return dateA - dateB;

                case 'date-added-desc':
                    const dateADesc = a.createdAt || a.id;
                    const dateBDesc = b.createdAt || b.id;
                    return dateBDesc - dateADesc;

                case 'episode':
                    return a.episode - b.episode;

                case 'episode-desc':
                    return b.episode - a.episode;

                case 'random':
                    // For random, we'll shuffle the entire filtered list
                    return Math.random() - 0.5;

                default:
                    return a.name.localeCompare(b.name);
            }
        };

        // Sort each group
        normalAnime.sort(sortFunction);
        upToDateAnime.sort(sortFunction);
        completedAnime.sort(sortFunction);

        // If random sort, shuffle each group separately
        if (this.sortType === 'random') {
            this.filteredList = [
                ...this.shuffleArray(normalAnime),
                ...this.shuffleArray(upToDateAnime),
                ...this.shuffleArray(completedAnime)
            ];
        } else {
            // Combine: normal first, then up-to-date, then completed
            this.filteredList = [...normalAnime, ...upToDateAnime, ...completedAnime];
        }
    }

    updateDisplay() {
        this.filterAnime();
        this.sortAnime();
        this.updateStats();
        this.renderAnimeList();
    }

    updateStats() {
        const total = this.animeList.length;
        const watching = this.animeList.filter(a => a.status === 'normal').length;
        const upToDate = this.animeList.filter(a => a.status === 'up-to-date').length;
        const completed = this.animeList.filter(a => a.status === 'completed').length;

        document.getElementById('totalCount').textContent = total;
        document.getElementById('watchingCount').textContent = watching;
        document.getElementById('upToDateCount').textContent = upToDate;
        document.getElementById('completedCount').textContent = completed;
    }

    renderAnimeList() {
        const listContainer = document.getElementById('animeList');
        listContainer.innerHTML = '';

        if (this.filteredList.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'anime-item';
            emptyMsg.textContent = this.searchTerm ? 'No anime found matching your search.' : 'No anime added yet. Add your first anime above!';
            emptyMsg.style.textAlign = 'center';
            emptyMsg.style.color = 'var(--text-secondary)';
            listContainer.appendChild(emptyMsg);
            return;
        }

        this.filteredList.forEach(anime => {
            const item = this.createAnimeItem(anime);
            listContainer.appendChild(item);
        });
    }

    createAnimeItem(anime) {
        const item = document.createElement('div');
        item.className = `anime-item ${anime.status}`;
        item.dataset.animeId = anime.id;

        // Set background image if available
        if (anime.imageUrl) {
            item.style.backgroundImage = `url(${anime.imageUrl})`;
            item.style.backgroundSize = 'cover';
            item.style.backgroundPosition = 'center';
            item.style.backgroundRepeat = 'no-repeat';
            item.classList.add('has-image');
        }

        // Main content wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'anime-content-wrapper';

        // Name with colored background when image is present
        const nameContainer = document.createElement('div');
        nameContainer.className = 'anime-name-container';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'anime-name';
        nameSpan.textContent = anime.name;
        nameSpan.addEventListener('dblclick', () => this.startEditingName(anime.id));

        nameContainer.appendChild(nameSpan);

        // Episode controls (horizontal layout)
        const episodeControls = document.createElement('div');
        episodeControls.className = 'episode-controls';

        const minusBtn = document.createElement('button');
        minusBtn.className = 'episode-btn';
        minusBtn.textContent = '−';
        minusBtn.addEventListener('click', () => this.updateEpisode(anime.id, -1));

        const episodeInput = document.createElement('input');
        episodeInput.type = 'number';
        episodeInput.className = 'episode-input';
        episodeInput.value = anime.episode;
        episodeInput.min = 0;
        episodeInput.placeholder = 'Ep';
        episodeInput.addEventListener('change', (e) => this.setEpisode(anime.id, e.target.value));
        episodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        });

        const plusBtn = document.createElement('button');
        plusBtn.className = 'episode-btn';
        plusBtn.textContent = '+';
        plusBtn.addEventListener('click', () => this.updateEpisode(anime.id, 1));

        episodeControls.appendChild(minusBtn);
        episodeControls.appendChild(episodeInput);
        episodeControls.appendChild(plusBtn);

        // Action buttons
        const actionButtons = document.createElement('div');
        actionButtons.className = 'anime-action-buttons';

        const upToDateBtn = document.createElement('button');
        upToDateBtn.className = `btn btn-warning btn-icon ${anime.status === 'up-to-date' ? 'active' : ''}`;
        upToDateBtn.innerHTML = anime.status === 'up-to-date' ? '⭐' : '☆';
        upToDateBtn.title = anime.status === 'up-to-date' ? 'Up to date' : 'Mark up to date';
        upToDateBtn.addEventListener('click', () => this.toggleUpToDate(anime.id));

        const completedBtn = document.createElement('button');
        completedBtn.className = `btn btn-danger btn-icon ${anime.status === 'completed' ? 'active' : ''}`;
        completedBtn.innerHTML = anime.status === 'completed' ? '✓' : '○';
        completedBtn.title = anime.status === 'completed' ? 'Completed' : 'Mark completed';
        completedBtn.addEventListener('click', () => this.toggleCompleted(anime.id));

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary btn-icon';
        editBtn.innerHTML = '✏️';
        editBtn.title = 'Edit';
        editBtn.addEventListener('click', () => this.openEditModal(anime.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-icon';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Delete';
        deleteBtn.addEventListener('click', () => this.deleteAnime(anime.id));

        actionButtons.appendChild(upToDateBtn);
        actionButtons.appendChild(completedBtn);
        actionButtons.appendChild(editBtn);
        actionButtons.appendChild(deleteBtn);

        // Assemble horizontal layout
        contentWrapper.appendChild(nameContainer);
        contentWrapper.appendChild(episodeControls);
        contentWrapper.appendChild(actionButtons);

        item.appendChild(contentWrapper);

        // Add expiry info for up-to-date items
        if (anime.status === 'up-to-date' && anime.upToDateTimestamp) {
            const daysLeft = this.getDaysUntilExpiry(anime.upToDateTimestamp);
            if (daysLeft !== null && daysLeft > 0) {
                const flagInfo = document.createElement('div');
                flagInfo.className = 'flag-info';
                flagInfo.textContent = `${daysLeft}d`;
                contentWrapper.appendChild(flagInfo);
            }
        }

        return item;
    }

    startEditingName(animeId) {
        const anime = this.animeList.find(a => a.id === animeId);
        if (!anime) return;

        const item = document.querySelector(`[data-anime-id="${animeId}"]`);
        const nameContainer = item.querySelector('.anime-name-container');
        const nameSpan = item.querySelector('.anime-name');

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'anime-name editing';
        input.value = anime.name;
        input.maxLength = 100;

        const finishEditing = () => {
            this.editAnimeName(animeId, input.value);
        };

        input.addEventListener('blur', finishEditing);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                finishEditing();
            }
        });

        nameSpan.replaceWith(input);
        input.focus();
        input.select();
    }

    openStatsModal() {
        document.getElementById('statsModal').classList.add('show');
    }

    closeStatsModal() {
        document.getElementById('statsModal').classList.remove('show');
    }

    openEditModal(animeId) {
        const anime = this.animeList.find(a => a.id === animeId);
        if (!anime) return;

        this.editingAnimeId = animeId;
        document.getElementById('editAnimeName').value = anime.name;
        document.getElementById('editEpisode').value = anime.episode;
        document.getElementById('editImageUrl').value = anime.imageUrl || '';
        document.getElementById('editImageFile').value = '';
        document.getElementById('editImagePreview').innerHTML = '';
        this.editPendingImageData = null;

        // Show preview if image exists
        if (anime.imageUrl) {
            const preview = document.getElementById('editImagePreview');
            preview.innerHTML = `<img src="${anime.imageUrl}" alt="Current image" style="max-width: 200px; max-height: 120px; border-radius: 4px; margin-top: 5px;">`;
        }

        document.getElementById('editModal').classList.add('show');
    }

    closeEditModal() {
        document.getElementById('editModal').classList.remove('show');
        this.editingAnimeId = null;
        this.editPendingImageData = null;
    }

    saveEditAnime() {
        if (!this.editingAnimeId) return;

        const anime = this.animeList.find(a => a.id === this.editingAnimeId);
        if (!anime) return;

        const name = document.getElementById('editAnimeName').value.trim();
        const episode = parseInt(document.getElementById('editEpisode').value) || 0;
        let imageUrl = document.getElementById('editImageUrl').value.trim();

        if (!name) {
            return;
        }

        // Check if name already exists (excluding current anime)
        if (this.animeList.some(a => a.id !== this.editingAnimeId && a.name.toLowerCase() === name.toLowerCase())) {
            return;
        }

        // Use file if selected, otherwise use URL
        if (this.editPendingImageData) {
            imageUrl = this.editPendingImageData;
            this.editPendingImageData = null;
        }

        anime.name = name;
        anime.episode = episode;
        anime.imageUrl = imageUrl || null;

        anime.imageUrl = imageUrl || null;

        if (this.saveData()) {
            this.closeEditModal();
            this.updateDisplay();
        }
    }

    removeImageFromEdit() {
        if (!this.editingAnimeId) return;

        const anime = this.animeList.find(a => a.id === this.editingAnimeId);
        if (!anime) return;

        anime.imageUrl = null;
        document.getElementById('editImageUrl').value = '';
        document.getElementById('editImageFile').value = '';
        document.getElementById('editImagePreview').innerHTML = '';
        this.editPendingImageData = null;

        this.saveData();
        this.updateDisplay();
    }

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('animeTrackerTheme', this.theme);
        this.applyTheme();
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        const themeToggle = document.getElementById('themeToggle');
        themeToggle.textContent = this.theme === 'light' ? '🌙' : '☀️';
    }

    saveData() {
        try {
            localStorage.setItem('animeTrackerData', JSON.stringify(this.animeList));
            return true;
        } catch (e) {
            console.error('Save failed:', e);
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                alert('Storage Limit Exceeded! \nCannot save changes. Please remove some images or delete old anime to free up space.');
            } else {
                alert('Error saving data: ' + e.message);
            }
            return false;
        }
    }

    // ---- Backup: export / import ----------------------------------------

    backupStatus(message, kind) {
        const el = document.getElementById('backupStatus');
        if (!el) return;
        el.textContent = message;
        el.style.color = kind === 'ok' ? 'var(--success-color)'
            : kind === 'error' ? 'var(--danger-color)'
            : 'var(--text-secondary)';
    }

    buildBackup() {
        const withImages = this.animeList.filter(a => a.imageUrl).length;
        return {
            app: 'animetracker',
            format: 1,
            exportedAt: new Date().toISOString(),
            origin: location.origin,
            counts: { anime: this.animeList.length, withImages: withImages },
            settings: { theme: this.theme, sortType: this.sortType },
            anime: this.animeList
        };
    }

    backupFileName() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `animetracker-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
    }

    exportBackup() {
        try {
            const payload = this.buildBackup();
            const json = JSON.stringify(payload);
            const sizeMB = (json.length / (1024 * 1024)).toFixed(2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.backupFileName();
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            this.backupStatus(`Saved ${payload.counts.anime} anime, ${payload.counts.withImages} with images (${sizeMB} MB).`, 'ok');
        } catch (e) {
            this.backupStatus('Export failed: ' + e.message, 'error');
        }
    }

    async sendBackupToPC() {
        const port = 8777;
        const payload = this.buildBackup();
        const json = JSON.stringify(payload);
        const sizeMB = (json.length / (1024 * 1024)).toFixed(2);
        const url = `http://localhost:${port}/backup`;

        this.backupStatus('Sending to PC...', null);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: json
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.backupStatus(`Sent ${payload.counts.anime} anime, ${payload.counts.withImages} with images (${sizeMB} MB).`, 'ok');
            return;
        } catch (e) {
            // A WebView built with the default mixed-content policy refuses an
            // http request coming from an https page. A form submit is a
            // top-level navigation instead, which that policy does not cover.
            this.backupStatus('Direct send refused, submitting a form instead...', null);
        }

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        form.enctype = 'text/plain';
        const field = document.createElement('input');
        field.type = 'hidden';
        field.name = 'data';
        field.value = json;
        form.appendChild(field);
        document.body.appendChild(form);
        form.submit();
    }

    parseBackup(text) {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed
            : Array.isArray(parsed.anime) ? parsed.anime
            : null;
        if (!list) throw new Error('unrecognised file');
        list.forEach(a => {
            if (typeof a !== 'object' || a === null || typeof a.name !== 'string') {
                throw new Error('unrecognised entries');
            }
        });
        return { list: list, settings: (parsed && parsed.settings) || null };
    }

    applyBackup(parsed) {
        const previous = this.animeList;
        this.animeList = parsed.list;
        if (!this.saveData()) {
            this.animeList = previous;
            this.backupStatus('Import failed: not enough storage. Nothing changed.', 'error');
            return false;
        }
        if (parsed.settings) {
            if (parsed.settings.theme) {
                this.theme = parsed.settings.theme;
                localStorage.setItem('animeTrackerTheme', this.theme);
                this.applyTheme();
            }
            if (parsed.settings.sortType) {
                this.sortType = parsed.settings.sortType;
                localStorage.setItem('animeTrackerSortType', this.sortType);
                document.getElementById('sortSelect').value = this.sortType;
            }
        }
        this.loadData();
        this.updateDisplay();
        return true;
    }

    importBackupFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            let parsed;
            try {
                parsed = this.parseBackup(reader.result);
            } catch (e) {
                this.backupStatus('Import failed: ' + e.message, 'error');
                return;
            }
            const ok = confirm(
                `Import ${parsed.list.length} anime?\n\n` +
                `This replaces the ${this.animeList.length} currently saved here.`
            );
            if (!ok) {
                this.backupStatus('Import cancelled.', null);
                return;
            }
            if (this.applyBackup(parsed)) {
                this.backupStatus(`Imported ${parsed.list.length} anime.`, 'ok');
            }
        };
        reader.onerror = () => this.backupStatus('Import failed: cannot read the file.', 'error');
        reader.readAsText(file);
    }

    async optimizeAllImages() {
        const statusEl = document.getElementById('optimizeStatus');
        const btn = document.getElementById('optimizeBtn');

        if (this.animeList.length === 0) {
            statusEl.textContent = 'No anime to optimize.';
            return;
        }

        btn.disabled = true;
        statusEl.textContent = 'Analyzing images...';

        let processedCount = 0;
        let savedBytes = 0;
        const originalTotalSize = JSON.stringify(this.animeList).length;

        const promises = this.animeList.map(anime => {
            return new Promise((resolve) => {
                if (!anime.imageUrl || !anime.imageUrl.startsWith('data:image')) {
                    resolve(false);
                    return;
                }

                const img = new Image();
                img.onload = () => {
                    const originalLength = anime.imageUrl.length;

                    // Always try to compress, the compressImage function handles resizing logic
                    const newImageData = this.compressImage(img);

                    // Only update if we actually saved space (or if it wasn't a jpeg before, logic handled by size check implies meaningful change)
                    if (newImageData.length < originalLength) {
                        anime.imageUrl = newImageData;
                        savedBytes += (originalLength - newImageData.length);
                        processedCount++;
                    }
                    resolve(true);
                };
                img.onerror = () => resolve(false);
                img.src = anime.imageUrl;
            });
        });

        try {
            statusEl.textContent = 'Optimizing... Please wait.';
            await Promise.all(promises);

            if (this.saveData()) {
                const savedMB = (savedBytes / (1024 * 1024)).toFixed(2);
                const percent = ((savedBytes / originalTotalSize) * 100).toFixed(1);
                statusEl.textContent = `Done! Optimized ${processedCount} images. Saved ${savedMB} MB (${percent}%).`;
                statusEl.style.color = 'var(--success-color)';
                this.updateDisplay();
            } else {
                statusEl.textContent = 'Optimization done, but save failed (still too full?). Try deleting some items.';
                statusEl.style.color = 'var(--danger-color)';
            }
        } catch (err) {
            console.error(err);
            statusEl.textContent = 'Error during optimization.';
            statusEl.style.color = 'var(--danger-color)';
        } finally {
            btn.disabled = false;
        }
    }

    loadData() {
        const saved = localStorage.getItem('animeTrackerData');
        if (saved) {
            try {
                this.animeList = JSON.parse(saved);
                // Ensure all anime have required properties
                this.animeList.forEach(anime => {
                    if (!anime.hasOwnProperty('status')) {
                        anime.status = 'normal';
                    }
                    if (!anime.hasOwnProperty('upToDateTimestamp')) {
                        anime.upToDateTimestamp = null;
                    }
                    // Add createdAt if missing (use id as fallback for old entries)
                    if (!anime.hasOwnProperty('createdAt')) {
                        anime.createdAt = anime.id;
                    }
                    // Add imageUrl if missing
                    if (!anime.hasOwnProperty('imageUrl')) {
                        anime.imageUrl = null;
                    }
                });
            } catch (e) {
                console.error('Error loading data:', e);
                this.animeList = [];
            }
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.animeTracker = new AnimeTracker();

    // Check for expired flags every hour
    setInterval(() => {
        if (window.animeTracker) {
            window.animeTracker.checkExpiredFlags();
        }
    }, 60 * 60 * 1000);
});

