class ImageCaptioner {
    constructor() {
        this.images = [];
        this.currentMatches = [];
        this.currentMatchIndex = 0;
        this.allTagsWithCounts = new Map();
        this.setupEventListeners();
        this.loadImages(); // Load images from the server on startup
    }

    setupEventListeners() {
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');
        const sidePanelToggleBtn = document.getElementById('btn_sidePanelToggle');
        const clearAllBtns = document.querySelectorAll('[id^="clearAllBtn"]');
        const downloadDatasetBtns = document.querySelectorAll('[id^="downloadDatasetBtn"]');

        fileInput.addEventListener('change', async (e) => {
            await this.handleFileUpload(e.target.files);
        });

        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', async (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            await this.handleFileUpload(e.dataTransfer.files);
        });

        if (sidePanelToggleBtn) {
            sidePanelToggleBtn.addEventListener('click', () => {
                const sidePanel = document.getElementById('sidePanel');
                sidePanel.classList.toggle('open');
            });
        }

        clearAllBtns.forEach(btn => btn.addEventListener('click', () => this.clearAll()));
        downloadDatasetBtns.forEach(btn => btn.addEventListener('click', () => this.downloadDataset()));
    }

    async loadImages() {
        try {
            const response = await fetch('/api/images');
            if (!response.ok) {
                throw new Error('Failed to fetch images from the server.');
            }
            // console.log( response.json() )

            this.images = await response.json();
            this.images.sort((a, b) => a._id - b._id);
            this.updateUI();
        } catch (error) {
            console.error("Error loading images:", error);
            this.showNotification('Failed to load images from the server.', 'error');
        }
    }

    async handleFileUpload(files) {
        const formData = new FormData();
        const filesArray = Array.from(files);
        const imageFiles = filesArray.filter(f => f.type.startsWith('image/'));
        const captionFiles = filesArray.filter(f => f.name.endsWith('.txt'));
        const captionsMap = new Map();
        const captionPromises = [];

        if (imageFiles.length === 0) {
            this.showNotification('No images were uploaded.', 'error');
            return;
        }

        captionFiles.forEach(file => {
            const reader = new FileReader();
            const promise = new Promise(resolve => {
                reader.onload = (e) => {
                    const baseName = file.name.replace(/\.txt$/, '');
                    captionsMap.set(baseName, e.target.result);
                    resolve();
                };
                reader.readAsText(file);
            });
            captionPromises.push(promise);
        });

        await Promise.all(captionPromises);

        for (const file of imageFiles) {
            const baseName = file.name.replace(/\.[^.]+$/, '');
            const caption = captionsMap.get(baseName) || '';
            formData.append('images', file);
            formData.append('captions', caption);
        }

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) throw new Error('Upload failed');

            this.showNotification('Upload complete! Refreshing gallery...', 'success');
            await this.loadImages();
        } catch (error) {
            console.error(error);
            this.showNotification('Failed to upload files', 'error');
        }
    }

    async updateCaption(imageId, caption) {

        const image = this.images.find(img => img._id === imageId);
        if (image && image.caption === caption) {
            // FIX: If the caption is the same, exit early to prevent unnecessary server call 
            // and the destructive loadImages/updateUI/renderGallery cycle.
            return;
        }

        try {
            const response = await fetch(`/api/images/${imageId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption }),
            });
            if (!response.ok) {
                throw new Error('Failed to update caption.');
            }
            await this.loadImages();
        } catch (error) {
            console.error("Error updating caption:", error);
            this.showNotification('Failed to update caption.', 'error');
        }
    }

    async deleteImage(imageId) {
        if (!imageId) return console.error('No imageId provided');

        try {
            const response = await fetch(`/api/images/${imageId}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                throw new Error('Failed to delete image.');
            }
            this.showNotification('Image deleted!', 'success');
            await this.loadImages();
        } catch (error) {
            console.error("Error deleting image:", error);
            this.showNotification('Failed to delete image.', 'error');
        }
    }


    async clearAll() {
        console.log( 'clear all button clicked')
        if (this.images.length === 0) return;
        if (!confirm('Are you sure you want to clear all images and captions? This cannot be undone.')) {
            return;
        }
        try {
            const response = await fetch('/api/images', {
                method: 'DELETE',
            });
            if (!response.ok) {
                throw new Error('Failed to clear all data.');
            }
            this.showNotification('All data cleared!', 'success');
            await this.loadImages();
        } catch (error) {
            console.error("Error clearing all data:", error);
            this.showNotification('Failed to clear all data.', 'error');
        }
    }

    async downloadDataset() {
        if (this.images.length === 0) {
            this.showNotification('No images to download', 'error');
            return;
        }

        this.showNotification('Preparing download...', 'info');
        const zip = new JSZip();

        for (const image of this.images) {
            try {
                const response = await fetch(image.filepath);
                const blob = await response.blob();
                zip.file(image.filename, blob);

                if (image.caption && image.caption.trim()) {
                    const baseName = image.filename.replace(/\.[^.]+$/, '');
                    zip.file(`${baseName}.txt`, image.caption);
                }
            } catch (error) {
                console.error(`Failed to add image ${image.filename} to zip:`, error);
            }
        }

        try {
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `captioned_dataset_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showNotification('Dataset download started!', 'success');
        } catch (error) {
            console.error("Failed to generate or download zip:", error);
            this.showNotification('Failed to download dataset.', 'error');
        }
    }

    updateUI() {
        console.log('UI updated!!')
        const gallery = document.getElementById('gallery');
        const emptyState = document.getElementById('emptyState');

        this.updateAllTagsWithCounts();

        if (this.images.length === 0) {
            gallery.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            gallery.style.display = 'grid';
            emptyState.style.display = 'none';
            this.renderGallery();
        }

        this.updateProgress();
        this.renderSidePanel();
    }

    updateAllTagsWithCounts() {
        this.allTagsWithCounts = new Map();
        const nonEmptyCaptionImages = this.images.filter(img => img.caption && img.caption.trim());

        nonEmptyCaptionImages.forEach(img => {
            const tags = img.caption.split(',').map(s => s.trim()).filter(s => s.length > 0);
            const addedTagsForImage = new Set();
            tags.forEach(tag => {
                if (tag.length > 1 && !addedTagsForImage.has(tag)) {
                    this.allTagsWithCounts.set(tag, (this.allTagsWithCounts.get(tag) || 0) + 1);
                    addedTagsForImage.add(tag);
                }
            });
        });
    }

    renderGallery() {
        const gallery = document.getElementById('gallery');
        gallery.innerHTML = '';
        const maxCount = Math.max(1, ...Array.from(this.allTagsWithCounts.values()));

        this.images.forEach(image => {
            const card = document.createElement('div');
            card.className = 'image-card';
            card.setAttribute('data-image-id', image._id);

            card.innerHTML = `
                <div class="image-container">
                    <img src="/api/images/${image._id}" alt="${image.filename}" loading="lazy">
                    <div class="image-info">${this.formatFileSize(image.size)}</div>
                </div>
                <textarea
                    class="caption-area"
                    placeholder="Enter detailed caption for this image..."
                >${image.caption}</textarea>
                <div class="image-tags-container"></div>
                <div class="image-actions">
                    <button class="delete-btn">
                        Delete
                    </button>
                    <div class="char-count">
                        <span>${image.caption ? image.caption.length : 0}</span> characters
                    </div>
                </div>
            `;

            const textarea = card.querySelector('.caption-area');
            textarea.addEventListener('blur', (e) => {
                // alert('blur event fired')

                this.updateCaption(image._id, e.target.value);
                card.querySelector('.char-count span').textContent = e.target.value.length;
                this.updateAllTagsWithCounts();
                this.renderSidePanel();
            });

            
            // add ctrl + Enter key event to blur() and updateAllUIElements
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey){
                    console.log('ctrl + Enter key')
                    this.UpdateAllUIElements(e)
                    e.target.blur()
                }
            })
            textarea.addEventListener('click', (e) => {
                e.preventDefault();
                
                setTimeout(() => {
                    e.target.focus();
                }, 1);
            });

            card.querySelector('.delete-btn').addEventListener('click', () => {
                this.deleteImage(image._id);
            });

            const imageTagsContainer = card.querySelector('.image-tags-container');
            this.createTagButtonsForImage(image, maxCount).forEach(button => {
                imageTagsContainer.appendChild(button);
            });

            gallery.appendChild(card);
        });
    }

    createTagButtonsForImage(image, maxCount) {
        const tags = image.caption ? image.caption.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
        const uniqueTags = [...new Set(tags)];
        const buttons = [];
        uniqueTags.forEach(tag => {
            const count = this.allTagsWithCounts.get(tag) || 0;
            const size = 15 + (count / maxCount) * 15;

            const button = document.createElement('button');
            button.className = 'image-tag-btn';
            button.innerHTML = `${tag} <span class="tag-count-bubble" style="width: ${size}px; height: ${size}px; font-size: ${size * 0.5}px; line-height: ${size}px;">${count}</span>`;
            button.onclick = () => this.selectCaptionTag(tag);
            buttons.push(button);
        });
        return buttons;
    }

    updateProgress() {
        const totalImages = this.images.length;
        const captionedImages = this.images.filter(img => img.caption && img.caption.trim()).length;
        const progress = totalImages > 0 ? (captionedImages / totalImages) * 100 : 0;

        document.getElementById('imageCount').textContent = `${totalImages} images`;
        document.getElementById('captionedCount').textContent = `${captionedImages} captioned`;
        document.getElementById('progressFill').style.width = `${progress}%`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showNotification(message, type) {
        const notification = document.getElementById('notification');
        if (!notification) {
            const notif = document.createElement('div');
            notif.id = 'notification';
            document.body.appendChild(notif);
        }
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');

        clearTimeout(this.notificationTimeout);
        this.notificationTimeout = setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    renderSidePanel() {
        const list = document.getElementById('captionList');
        list.innerHTML = '';
        const allTags = Array.from(this.allTagsWithCounts, ([tag, count]) => ({ tag, count }));
        
        allTags.sort((a, b) => {
            const countDifference = b.count - a.count;
            if (countDifference !== 0) {
                return countDifference;
            }
            return a.tag.localeCompare(b.tag);
        });

        allTags.forEach(item => {
            const li = document.createElement('li');
            li.setAttribute('data-tag', item.tag);
            li.innerHTML = `
                <span class="tag-text">${item.tag} <span class="tag-count">${item.count}</span></span>
                <input type="text" class="tag-edit-input" style="display: none;">
                <div class="tag-actions">
                    <button class="modify-btn">Modify</button>
                    <button class="delete-tag-btn">Delete</button>
                </div>
            `;
            li.onclick = () => this.selectCaptionTag(item.tag);

            const modifyBtn = li.querySelector('.modify-btn');
            const deleteBtn = li.querySelector('.delete-tag-btn');
            const tagTextSpan = li.querySelector('.tag-text');
            const editInput = li.querySelector('.tag-edit-input');
            const tagActionsDiv = li.querySelector('.tag-actions');

            li.addEventListener('mouseenter', () => tagActionsDiv.style.display = 'flex');
            li.addEventListener('mouseleave', () => tagActionsDiv.style.display = 'none');


            modifyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                tagTextSpan.style.display = 'none';
                tagActionsDiv.style.display = 'none';
                editInput.style.display = 'block';
                editInput.value = item.tag;
                editInput.focus();
            });

            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteTagFromAllCaptions(item.tag);
            });

            editInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            editInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const newTag = editInput.value.trim();
                    if (newTag && newTag !== item.tag) {
                        this.applyTagModification(item.tag, newTag);
                    }
                    tagTextSpan.style.display = 'block';
                    tagActionsDiv.style.display = 'flex';
                    editInput.style.display = 'none';
                }
            });

            editInput.addEventListener('blur', () => {
                tagTextSpan.style.display = 'block';
                tagActionsDiv.style.display = 'flex';
                editInput.style.display = 'none';
            });

            list.appendChild(li);
        });

        this.addSearchReplacePanel();
        this.addBulkPanel();
        this.addAppendPrependPanel();
        this.addDeletePanel();
    }
    
    async deleteTagFromAllCaptions(tagToDelete) {
        if (!confirm(`Are you sure you want to delete "${tagToDelete}" from all captions? This cannot be undone.`)) {
            this.showNotification('Tag deletion cancelled.', 'info');
            return;
        }
        
        const updates = [];
        this.images.forEach(img => {
            let tags = img.caption ? img.caption.split(',').map(s => s.trim()) : [];
            const newTags = tags.filter(tag => tag !== tagToDelete);
            if (newTags.length !== tags.length) {
                updates.push(this.updateCaption(img._id, newTags.join(', ')));
            }
        });
        await Promise.all(updates);
        this.showNotification(`Deleted "${tagToDelete}" from all captions.`, 'success');
    }

    async applyTagModification(oldTag, newTag) {
        const updates = [];
        this.images.forEach(img => {
            let tags = img.caption ? img.caption.split(',').map(s => s.trim()) : [];
            const tagIndex = tags.indexOf(oldTag);
            if (tagIndex !== -1) {
                tags[tagIndex] = newTag;
                updates.push(this.updateCaption(img._id, tags.join(', ')));
            }
        });
        await Promise.all(updates);
        this.showNotification(`Modified captions for tag "${oldTag}".`, 'success');
    }

    async appendCommonCaption() {
        const commonCaptionTextarea = document.getElementById('bulkCaptions');
        if (!commonCaptionTextarea) {
            this.showNotification('Caption textarea not found.', 'error');
            return;
        }

        if (this.images.length === 0) {
            this.showNotification('No images available to add captions.', 'error');
            return;
        }

        const commonCaption = commonCaptionTextarea.value.trim();
        if (commonCaption.length === 0) {
            this.showNotification('Please enter a non-empty caption.', 'error');
            return;
        }

        if (!confirm(`The caption "${commonCaption}" will be appended to all ${this.images.length} existing captions. Continue?`)) {
            this.showNotification('Caption application cancelled.', 'info');
            return;
        }
        
        const updates = [];
        for (const image of this.images) {
            const existingCaption = image.caption ? image.caption.trim() : '';

            let separator = '';
            if (existingCaption.length > 0 && !existingCaption.endsWith(',')) {
                separator = ', ';
            } else if (existingCaption.length > 0 && existingCaption.endsWith(',')) {
                separator = ' ';
            }

            const newCaption = existingCaption + separator + commonCaption;
            updates.push(this.updateCaption(image._id, newCaption));
        }

        await Promise.all(updates);
        this.showNotification(`Appended caption to all images successfully!`, 'success');
        commonCaptionTextarea.value = '';
    }

    async findAndModifyCaptions(operation) {
        const targetTextInput = operation === 'delete' 
            ? document.getElementById('targetTextInputDelete') 
            : document.getElementById('targetTextInput');
        
        const newTagInput = document.getElementById('newTagInput');
        const regexRadio = document.getElementById('regexRadio');
        const prependRadio = document.getElementById('prependRadio');
        
        const targetText = targetTextInput.value;
        const newTag = newTagInput ? newTagInput.value.trim() : '';
        const useRegex = operation === 'delete' 
            ? document.getElementById('regexRadioDelete').checked
            : regexRadio.checked;

        if (operation !== 'delete' && (!newTag || !targetText)) {
            this.showNotification('Both "New Tag" and "Target Text" fields are required.', 'error');
            return;
        }
        if (operation === 'delete' && !targetText) {
            this.showNotification('The "Target Text" field is required to delete.', 'error');
            return;
        }

        let regex;
        if (useRegex) {
            try {
                regex = new RegExp(targetText, 'gi');
            } catch (e) {
                this.showNotification(`Invalid regular expression: ${e.message}`, 'error');
                return;
            }
        }

        const imagesToModify = this.images.filter(img => {
            const currentCaption = img.caption;
            if (useRegex) {
                return regex.test(currentCaption);
            } else {
                return currentCaption.includes(targetText);
            }
        });

        if (imagesToModify.length === 0) {
            this.showNotification(`No images found with the target text or pattern.`, 'info');
            return;
        }

        const actionText = operation === 'delete' ? 'delete from' : 'modify';
        if (!confirm(`This will ${actionText} the captions of ${imagesToModify.length} images. Continue?`)) {
            this.showNotification('Caption modification cancelled.', 'info');
            return;
        }
        
        const updates = [];
        imagesToModify.forEach(img => {
            let newCaption = img.caption;
            if (operation === 'delete') {
                if (useRegex) {
                    newCaption = newCaption.replace(regex, '');
                } else {
                    const escapedTargetText = targetText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const wordBoundaryRegex = new RegExp(`\\b${escapedTargetText}\\b`, 'gi');
                    newCaption = newCaption.replace(wordBoundaryRegex, '');
                }

                newCaption = newCaption.replace(/,\s*,/g, ',').replace(/^,\s*|\s*,$/g, '').trim();

            } else {
                const prepend = prependRadio.checked;
                let targetIndex = -1;
                let foundText = '';
                if (useRegex) {
                    const match = newCaption.match(regex);
                    if (match) {
                        foundText = match[0];
                        targetIndex = newCaption.indexOf(foundText);
                    }
                } else {
                    foundText = targetText;
                    targetIndex = newCaption.indexOf(foundText);
                }

                if (targetIndex !== -1) {
                    if (prepend) {
                        newCaption = newCaption.slice(0, targetIndex) + newTag + ' ' + newCaption.slice(targetIndex);
                    } else {
                        newCaption = newCaption.slice(0, targetIndex + foundText.length) + ' ' + newTag + newCaption.slice(targetIndex + foundText.length);
                    }
                }
            }
            if (img.caption !== newCaption) {
                updates.push(this.updateCaption(img._id, newCaption));
            }
        });

        await Promise.all(updates);
        this.showNotification(`Modified captions for ${updates.length} image${updates.length === 1 ? '' : 's'}`, 'success');
    }

    async searchAndReplaceInCaptions() {
        const searchInput = document.getElementById('searchReplaceSearchInput');
        const replaceInput = document.getElementById('searchReplaceReplaceInput');
        const regexCheckbox = document.getElementById('searchReplaceRegex');
        const caseSensitiveCheckbox = document.getElementById('searchReplaceCaseSensitive');

        const searchText = searchInput.value;
        const replaceText = replaceInput.value;
        const useRegex = regexCheckbox.checked;
        const caseSensitive = caseSensitiveCheckbox.checked;

        if (!searchText) {
            this.showNotification('Search text is required.', 'error');
            return;
        }

        let searchPattern;
        if (useRegex) {
            try {
                const flags = caseSensitive ? 'g' : 'gi';
                searchPattern = new RegExp(searchText, flags);
            } catch (e) {
                this.showNotification(`Invalid regular expression: ${e.message}`, 'error');
                return;
            }
        } else {
            const escapedSearchText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const flags = caseSensitive ? 'g' : 'gi';
            searchPattern = new RegExp(escapedSearchText, flags);
        }

        // Find images that contain the search text
        const imagesToModify = this.images.filter(img => {
            return img.caption && searchPattern.test(img.caption);
        });

        if (imagesToModify.length === 0) {
            this.showNotification('No captions found containing the search text.', 'info');
            return;
        }

        // Show confirmation dialog
        const searchDisplayText = searchText.length > 50 ? searchText.substring(0, 50) + '...' : searchText;
        const replaceDisplayText = replaceText.length > 50 ? replaceText.substring(0, 50) + '...' : replaceText;
        
        if (!confirm(`Replace "${searchDisplayText}" with "${replaceDisplayText}" in ${imagesToModify.length} caption${imagesToModify.length === 1 ? '' : 's'}? This cannot be undone.`)) {
            this.showNotification('Search and replace cancelled.', 'info');
            return;
        }

        // Perform the replacements
        const updates = [];
        let totalReplacements = 0;

        imagesToModify.forEach(img => {
            const originalCaption = img.caption;
            const newCaption = originalCaption.replace(searchPattern, replaceText);
            
            if (originalCaption !== newCaption) {
                // Count how many replacements were made in this caption
                const matches = originalCaption.match(searchPattern);
                if (matches) {
                    totalReplacements += matches.length;
                }
                updates.push(this.updateCaption(img._id, newCaption));
            }
        });

        if (updates.length > 0) {
            await Promise.all(updates);
            this.showNotification(`Replaced ${totalReplacements} occurrence${totalReplacements === 1 ? '' : 's'} in ${updates.length} caption${updates.length === 1 ? '' : 's'}.`, 'success');
            
            // Clear the form
            searchInput.value = '';
            replaceInput.value = '';
        } else {
            this.showNotification('No replacements were made.', 'info');
        }
    }

    selectCaptionTag(text) {
        this.currentMatches = this.images
            .map((img, idx) => ({ img, idx }))
            .filter(x => x.img.caption && x.img.caption.split(',').map(s => s.trim()).includes(text));

        if (!this.currentMatches.length) return;
        this.currentMatchIndex = 0;
        this.focusMatch(text);
    }

    focusMatch(textToHighlight) {
        // FIX 1: Remove highlighting and navigation controls from ALL cards before proceeding.
        document.querySelectorAll('.image-card').forEach(card => {
            card.classList.remove('highlighted');
            const oldNav = card.querySelector('.nav-controls');
            if (oldNav) {
                // Ensure old navigation buttons and their stale event listeners are removed.
                oldNav.remove();
            }
        });

        const { img } = this.currentMatches[this.currentMatchIndex];
        const card = document.querySelector(`[data-image-id="${img._id}"]`);

        if (card) {
            card.classList.add('highlighted');
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });

            const textarea = card.querySelector('.caption-area');
            textarea.focus();

            if (textToHighlight) {
                const captionText = textarea.value;
                const startIndex = captionText.indexOf(textToHighlight);

                if (startIndex !== -1) {
                    textarea.setSelectionRange(startIndex, startIndex + textToHighlight.length);
                }
            }

            // FIX 2: Recreate the navigation controls every time for the focused card.
            // This ensures fresh listeners with the current tag context are attached.
            const nav = document.createElement('div');
            nav.className = 'nav-controls';
            nav.innerHTML = `
                <button class="nav-btn" data-action="prev">▲</button>
                <span class="nav-info">${this.currentMatchIndex + 1} / ${this.currentMatches.length}</span>
                <button class="nav-btn" data-action="next">▼</button>
            `;
            card.appendChild(nav);
            
            // Attach fresh listeners to the newly created buttons
            nav.querySelector('[data-action="prev"]').addEventListener('click', () => this.prevMatch(textToHighlight));
            nav.querySelector('[data-action="next"]').addEventListener('click', () => this.nextMatch(textToHighlight));
        }
    }

    nextMatch(textToHighlight) {
        if (!this.currentMatches.length) return;
        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.currentMatches.length;
        this.focusMatch(textToHighlight);
    }

    prevMatch(textToHighlight) {
        if (!this.currentMatches.length) return;
        this.currentMatchIndex = (this.currentMatchIndex - 1 + this.currentMatches.length) % this.currentMatches.length;
        this.focusMatch(textToHighlight);
    }

    addSearchReplacePanel() {
        const sidePanel = document.getElementById('sidePanel');
        let searchReplacePanel = sidePanel.querySelector('.search-replace-panel');
        
        if (this.images.length > 0) {
            if (!searchReplacePanel) {
                searchReplacePanel = document.createElement('div');
                searchReplacePanel.className = 'search-replace-panel';
                searchReplacePanel.innerHTML = `
                    <h4>Search and Replace</h4>
                    <div class="search-replace-inputs">
                        <input type="text" id="searchReplaceSearchInput" placeholder="Search for..." class="search-replace-input">
                        <input type="text" id="searchReplaceReplaceInput" placeholder="Replace with..." class="search-replace-input">
                    </div>
                    <div class="search-replace-options">
                        <label class="search-replace-option">
                            <input type="checkbox" id="searchReplaceRegex"> Use Regex
                        </label>
                        <label class="search-replace-option">
                            <input type="checkbox" id="searchReplaceCaseSensitive"> Case Sensitive
                        </label>
                    </div>
                    <button class="btn btn-primary" id="searchReplaceBtn">Replace All</button>
                `;
                // Insert at the top of the side panel, before other panels
                const firstPanel = sidePanel.querySelector('.bulk-caption-panel') || 
                                 sidePanel.querySelector('.append-prepend-panel') || 
                                 sidePanel.querySelector('.delete-panel') ||
                                 sidePanel.querySelector('.controls-panel');
                sidePanel.insertBefore(searchReplacePanel, firstPanel);
                
                document.getElementById('searchReplaceBtn').addEventListener('click', () => this.searchAndReplaceInCaptions());
            }
        } else if (searchReplacePanel) {
            searchReplacePanel.remove();
        }
    }

    addBulkPanel() {
        const sidePanel = document.getElementById('sidePanel');
        let bulkPanel = sidePanel.querySelector('.bulk-caption-panel');
        if (this.images.length > 0) {
            if (!bulkPanel) {
                bulkPanel = document.createElement('div');
                bulkPanel.className = 'bulk-caption-panel';
                bulkPanel.innerHTML = `
                    <h4>Add Common Caption</h4>
                    <textarea id="bulkCaptions" placeholder="Enter a caption to append to all images..."></textarea>
                    <button class="btn btn-primary" id="applyBulkBtn">Append to All</button>
                `;
                const nextPanel = sidePanel.querySelector('.append-prepend-panel') || 
                                sidePanel.querySelector('.delete-panel') ||
                                sidePanel.querySelector('.controls-panel');
                sidePanel.insertBefore(bulkPanel, nextPanel);
                document.getElementById('applyBulkBtn').addEventListener('click', () => this.appendCommonCaption());
            }
        } else if (bulkPanel) {
            bulkPanel.remove();
        }
    }

    addAppendPrependPanel() {
        const sidePanel = document.getElementById('sidePanel');
        let appendPrependPanel = sidePanel.querySelector('.append-prepend-panel');
        if (this.images.length > 0) {
            if (!appendPrependPanel) {
                appendPrependPanel = document.createElement('div');
                appendPrependPanel.className = 'append-prepend-panel';
                appendPrependPanel.innerHTML = `
                    <h4>Append/Prepend Text</h4>
                    <div class="radio-group">
                        <label>
                            <input type="radio" name="targetType" id="textRadio" value="text" checked> Text
                        </label>
                        <label>
                            <input type="radio" name="targetType" id="regexRadio" value="regex"> Regex
                        </label>
                    </div>
                    <input type="text" id="targetTextInput" placeholder="Target text/pattern">
                    <input type="text" id="newTagInput" placeholder="New tag/sentence">
                    <div class="radio-group">
                        <label>
                            <input type="radio" name="position" id="prependRadio" value="prepend" checked> Prepend
                        </label>
                        <label>
                            <input type="radio" name="position" id="appendRadio" value="append"> Append
                        </label>
                    </div>
                    <button class="btn btn-secondary" id="addToTargetBtn">Add to Target</button>
                `;
                const deletePanel = sidePanel.querySelector('.delete-panel');
                const nextPanel = deletePanel || sidePanel.querySelector('.controls-panel');
                sidePanel.insertBefore(appendPrependPanel, nextPanel);
                document.getElementById('addToTargetBtn').addEventListener('click', () => this.findAndModifyCaptions('add'));
            }
        } else if (appendPrependPanel) {
            appendPrependPanel.remove();
        }
    }

    addDeletePanel() {
        const sidePanel = document.getElementById('sidePanel');
        let deletePanel = sidePanel.querySelector('.delete-panel');
        if (this.images.length > 0) {
            if (!deletePanel) {
                deletePanel = document.createElement('div');
                deletePanel.className = 'delete-panel';
                deletePanel.innerHTML = `
                    <h4>Delete Text</h4>
                    <div class="radio-group">
                        <label>
                            <input type="radio" name="targetTypeDelete" id="textRadioDelete" value="text" checked> Text
                        </label>
                        <label>
                            <input type="radio" name="targetTypeDelete" id="regexRadioDelete" value="regex"> Regex
                        </label>
                    </div>
                    <input type="text" id="targetTextInputDelete" placeholder="Target text/pattern to delete">
                    <button class="btn btn-danger" id="deleteTargetBtn">Delete</button>
                `;
                sidePanel.insertBefore(deletePanel, sidePanel.querySelector('.controls-panel'));
                document.getElementById('deleteTargetBtn').addEventListener('click', () => this.findAndModifyCaptions('delete'));
            }
        } else if (deletePanel) {
            deletePanel.remove();
        }
    }
    UpdateAllUIElements(e){
        const cards = document.querySelectorAll('.image-card')
        
        // update char count
        Array.from(this.images).map((image, i)=>{
            const card = cards[i]
            const caption = card.querySelector('textarea').value

            this.updateCaption(image._id, caption);
            card.querySelector('.char-count span').textContent = e.target.value.length;
        })
        this.updateAllTagsWithCounts();
        this.renderSidePanel();
    }
}

// SidePanel resizing
const sidePanelHandle = document.querySelector('#sidePanelHandle')
const sidePanel = document.querySelector('#sidePanel')
let isResizing = false;

sidePanelHandle.addEventListener('mousedown', (e) => {
    e.preventDefault(); 
    document.body.style.userSelect = 'none';
    isResizing = true;
});

document.addEventListener('mousemove', (e) => {
    e.preventDefault()

    if (isResizing) {
        const newWidth = sidePanel.getBoundingClientRect().right - e.clientX;

        sidePanel.style.width = `${newWidth}px`;
    }
});

document.addEventListener('mouseup', () => {
    isResizing = false;
    // Use setTimeout(..., 0) to ensure the style reset is processed
    // after the mouse events have fully completed, reliably re-enabling selection.
    setTimeout(() => {
        document.body.style.userSelect = 'auto';
    }, 0);
});



let captioner;
document.addEventListener('DOMContentLoaded', () => {
    captioner = new ImageCaptioner();
    
});