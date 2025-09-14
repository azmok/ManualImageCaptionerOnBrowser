class ImageCaptioner {
    constructor() {
        this.images = [];
        this.currentMatches = [];
        this.currentMatchIndex = 0;
        this.allTagsWithCounts = new Map();
        this.setupEventListeners();
        this.loadProgress(); // Automatically load progress on startup
    }

    setupEventListeners() {
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');

        fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
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

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleFileUpload(e.dataTransfer.files);
        });

        // Event listeners for the buttons in the side panel
        document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAll());
        document.getElementById('downloadDatasetBtn').addEventListener('click', () => this.downloadDataset());
        
        // This button now saves to localStorage
        document.getElementById('saveProgressBtn').addEventListener('click', () => {
            this.saveProgress();
            this.showNotification('Progress saved automatically!', 'success');
        });

        // New button to load from localStorage
        document.getElementById('loadProgressBtn').addEventListener('click', () => {
            if (this.images.length > 0) {
                if (!confirm('Loading will overwrite your current session. Continue?')) {
                    return;
                }
            }
            this.loadProgress();
        });

        // Event listeners for the buttons in the main content area
        const clearAllBtnMain = document.getElementById('clearAllBtn_main');
        if (clearAllBtnMain) {
            clearAllBtnMain.addEventListener('click', () => this.clearAll());
        }
        const downloadDatasetBtnMain = document.getElementById('downloadDatasetBtn_main');
        if (downloadDatasetBtnMain) {
            downloadDatasetBtnMain.addEventListener('click', () => this.downloadDataset());
        }
        const saveProgressBtnMain = document.getElementById('saveProgressBtn_main');
        if (saveProgressBtnMain) {
            saveProgressBtnMain.addEventListener('click', () => {
                this.saveProgress();
                this.showNotification('Progress saved automatically!', 'success');
            });
        }
        const loadProgressBtnMain = document.getElementById('loadProgressBtn_main');
        if (loadProgressBtnMain) {
            loadProgressBtnMain.addEventListener('click', () => {
                if (this.images.length > 0) {
                    if (!confirm('Loading will overwrite your current session. Continue?')) {
                        return;
                    }
                }
                this.loadProgress();
            });
        }
    }

    async handleFileUpload(files) {
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

        // Process images and store the file object
        const processedImages = [];
        for (const file of imageFiles) {
            const baseName = file.name.replace(/\.[^.]+$/, '');
            const dataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
            processedImages.push({
                id: Date.now() + Math.random(),
                name: file.name,
                size: file.size,
                file: file, // Store the original file object
                dataUrl: dataUrl,
                caption: captionsMap.get(baseName) || ''
            });
        }
        
        this.images = [...this.images, ...processedImages];
        this.saveProgress(); // Auto-save after upload
        this.updateUI();
        this.showNotification(`${imageFiles.length} images uploaded and ready!`, 'success');
    }

    updateImageTags(image) {
        const card = document.querySelector(`[data-image-id="${image.id}"]`);
        if (!card) return;

        const imageTagsContainer = card.querySelector('.image-tags-container');
        if (!imageTagsContainer) return;

        // Clear old buttons
        imageTagsContainer.innerHTML = '';

        // Recalculate tag counts
        this.updateAllTagsWithCounts();

        const maxCount = Math.max(1, ...Array.from(this.allTagsWithCounts.values()));

        // Add updated buttons for this image
        this.createTagButtonsForImage(image, maxCount).forEach(button => {
            imageTagsContainer.appendChild(button);
        });
    }


    updateCaption(imageId, caption) {
        const image = this.images.find(img => img.id === imageId);
        if (image) {
            image.caption = caption;

            this.saveProgress(); // save to localStorage

            // Update tags for this image without re-rendering gallery
            this.updateImageTags(image);
            this.renderSidePanel(); // optional: update side panel counts
        }
    }


    deleteImage(imageId) {
        this.images = this.images.filter(img => img.id !== imageId);
        this.saveProgress(); // Auto-save on delete
        this.updateUI();
        this.showNotification('Image deleted', 'success');
    }

    clearAll() {
        if (this.images.length === 0) return;
        if (confirm('Are you sure you want to clear all images and captions? This cannot be undone.')) {
            this.images = [];
            this.saveProgress(); // Auto-save empty array
            this.updateUI();
            this.showNotification('All data cleared', 'success');
        }
    }

    async downloadDataset() {
        if (this.images.length === 0) {
            this.showNotification('No images to download', 'error');
            return;
        }

        const zip = new JSZip();
        for (const image of this.images) {
            try {
                // Use the original file object to add to the zip
                zip.file(image.name, image.file);
                
                if (image.caption.trim()) {
                    const baseName = image.name.replace(/\.[^.]+$/, '');
                    zip.file(`${baseName}.txt`, image.caption);
                }
            } catch (error) {
                console.error(`Failed to add image ${image.name} to zip:`, error);
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

    saveProgress() {
        const progressData = this.images.map(img => ({
            id: img.id,
            name: img.name,
            size: img.size,
            caption: img.caption,
            // The file object is not serializable, so we don't save it.
            dataUrl: img.dataUrl
        }));
        localStorage.setItem('captioningProgress', JSON.stringify(progressData));
    }

    loadProgress() {
        const savedData = localStorage.getItem('captioningProgress');
        if (savedData) {
            try {
                const loadedImages = JSON.parse(savedData);
                this.images = loadedImages.map(img => ({
                    ...img,
                    file: null // The file object cannot be saved and will be null here
                }));
                this.updateUI();
                this.showNotification('Session loaded from last backup!', 'info');
                // IMPORTANT: Warn the user that they cannot download a dataset from a loaded session
                this.showNotification('Note: You cannot download the dataset from a loaded session. Please re-upload your files if you need to download them.', 'warning');
                return true;
            } catch (error) {
                console.error("Failed to load progress from localStorage:", error);
                this.showNotification('Failed to load saved session.', 'error');
            }
        } else {
            this.showNotification('No saved session found.', 'info');
        }
        return false;
    }
    
    updateUI() {
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
        const nonEmptyCaptionImages = this.images.filter(img => img.caption.trim());

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
            card.setAttribute('data-image-id', image.id);

            card.innerHTML = `
                <div class="image-container">
                    <img src="${image.dataUrl}" alt="${image.name}" loading="lazy">
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
                        <span>${image.caption.length}</span> characters
                    </div>
                </div>
            `;

            const textarea = card.querySelector('.caption-area');
            textarea.addEventListener('input', (e) => {
                this.updateCaption(image.id, e.target.value);
                card.querySelector('.char-count span').textContent = e.target.value.length;
                this.updateAllTagsWithCounts(); // Optional: update tag counts
                this.renderSidePanel(); // Optional: update side panel
            });

            card.querySelector('.delete-btn').addEventListener('click', () => {
                this.deleteImage(image.id);
            });

            const imageTagsContainer = card.querySelector('.image-tags-container');
            this.createTagButtonsForImage(image, maxCount).forEach(button => {
                imageTagsContainer.appendChild(button);
            });

            gallery.appendChild(card);
        });
    }

    createTagButtonsForImage(image, maxCount) {
        const tags = image.caption.split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
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
        const captionedImages = this.images.filter(img => img.caption.trim()).length;
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
        allTags.sort((a, b) => b.count - a.tag.localeCompare(b.tag));

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

            // Prevent the parent LI's click event from firing when clicking on the input
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

            // Add a blur event listener to exit edit mode when the input loses focus
            editInput.addEventListener('blur', () => {
                tagTextSpan.style.display = 'block';
                tagActionsDiv.style.display = 'flex';
                editInput.style.display = 'none';
            });

            list.appendChild(li);
        });

        this.addBulkPanel();
        this.addAppendPrependPanel();
        this.addDeletePanel();
    }
    
    deleteTagFromAllCaptions(tagToDelete) {
        if (!confirm(`Are you sure you want to delete "${tagToDelete}" from all captions? This cannot be undone.`)) {
            this.showNotification('Tag deletion cancelled.', 'info');
            return;
        }

        let modifiedCount = 0;
        this.images.forEach(img => {
            let tags = img.caption.split(',').map(s => s.trim());
            const initialTagCount = tags.length;
            tags = tags.filter(tag => tag !== tagToDelete);
            
            if (tags.length !== initialTagCount) {
                img.caption = tags.join(', ');
                modifiedCount++;
            }
        });

        if (modifiedCount > 0) {
            this.updateUI();
            this.saveProgress();
            this.showNotification(`Deleted "${tagToDelete}" from ${modifiedCount} caption${modifiedCount === 1 ? '' : 's'}.`, 'success');
        } else {
            this.showNotification(`No captions found with the tag "${tagToDelete}".`, 'info');
        }
    }

    applyTagModification(oldTag, newTag) {
        let modifiedCount = 0;
        this.images.forEach(img => {
            let tags = img.caption.split(',').map(s => s.trim());
            const tagIndex = tags.indexOf(oldTag);
            if (tagIndex !== -1) {
                tags[tagIndex] = newTag;
                img.caption = tags.join(', ');
                modifiedCount++;
            }
        });

        if (modifiedCount > 0) {
            this.updateUI();
            this.saveProgress();
            this.showNotification(`Modified "${oldTag}" to "${newTag}" in ${modifiedCount} caption${modifiedCount === 1 ? '' : 's'}.`, 'success');
        } else {
            this.showNotification('No captions found with the tag "${oldTag}".', 'info');
        }
    }

    appendCommonCaption() {
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

        const hasExistingCaptions = this.images.some(img => img.caption.trim());
        if (hasExistingCaptions) {
            if (!confirm(`The caption "${commonCaption}" will be appended to all ${this.images.length} existing captions. Continue?`)) {
                this.showNotification('Caption application cancelled.', 'info');
                return;
            }
        }

        let applied = 0;
        for (let i = 0; i < this.images.length; i++) {
            const existingCaption = this.images[i].caption.trim();

            let separator = '';
            if (existingCaption.length > 0 && !existingCaption.endsWith(',')) {
                separator = ', ';
            } else if (existingCaption.length > 0 && existingCaption.endsWith(',')) {
                separator = ' ';
            }

            this.images[i].caption = existingCaption + separator + commonCaption;
            applied++;
        }

        if (applied > 0) {
            this.updateUI();
            this.saveProgress();
            const message = `Appended caption to ${applied} image${applied === 1 ? '' : 's'} successfully!`;
            this.showNotification(message, 'success');
            commonCaptionTextarea.value = '';
        } else {
            this.showNotification('No captions were applied.', 'error');
        }
    }

    findAndModifyCaptions(operation) {
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

        let modifiedCount = 0;
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
                img.caption = newCaption;
                modifiedCount++;
            }
        });

        if (modifiedCount > 0) {
            this.updateUI();
            this.saveProgress();
            const message = `Modified ${modifiedCount} caption${modifiedCount === 1 ? '' : 's'} successfully!`;
            this.showNotification(message, 'success');
        } else {
            this.showNotification('No captions were modified.', 'error');
        }
    }

    selectCaptionTag(text) {
        this.currentMatches = this.images
            .map((img, idx) => ({ img, idx }))
            .filter(x => x.img.caption.split(',').map(s => s.trim()).includes(text));

        if (!this.currentMatches.length) return;
        this.currentMatchIndex = 0;
        this.focusMatch(text);
    }

    focusMatch(textToHighlight) {
        document.querySelectorAll('.image-card').forEach(card => card.classList.remove('highlighted'));

        const { img, idx } = this.currentMatches[this.currentMatchIndex];
        const card = document.querySelector(`[data-image-id="${img.id}"]`);

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

            let nav = card.querySelector('.nav-controls');
            if (!nav) {
                nav = document.createElement('div');
                nav.className = 'nav-controls';
                nav.innerHTML = `
                    <button class="nav-btn" data-action="prev">▲</button>
                    <span class="nav-info">${this.currentMatchIndex + 1} / ${this.currentMatches.length}</span>
                    <button class="nav-btn" data-action="next">▼</button>
                `;
                card.appendChild(nav);
                nav.querySelector('[data-action="prev"]').addEventListener('click', () => this.prevMatch(textToHighlight));
                nav.querySelector('[data-action="next"]').addEventListener('click', () => this.nextMatch(textToHighlight));
            } else {
                nav.querySelector('.nav-info').textContent = `${this.currentMatchIndex + 1} / ${this.currentMatches.length}`;
            }
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
                sidePanel.insertBefore(bulkPanel, sidePanel.querySelector('.controls-panel'));
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
                sidePanel.insertBefore(appendPrependPanel, deletePanel ? deletePanel.nextElementSibling : sidePanel.querySelector('.controls-panel'));
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
}

let captioner;
document.addEventListener('DOMContentLoaded', () => {
    captioner = new ImageCaptioner();
    
    btn_sidePanelToggle.addEventListener('click', (e) => {
      e.preventDefault()
      console.log("hi")
   })
});