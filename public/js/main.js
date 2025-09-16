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

    // Update the showUploadProgress method to show file count
    showUploadProgress(loaded, total, currentFile, currentFileIndex, totalFiles) {
        const progressContainer = document.getElementById('uploadProgressContainer');
        const progressBar = document.getElementById('uploadProgressBar');
        const progressText = document.getElementById('uploadProgressText');
        const fileInfo = document.getElementById('uploadFileInfo');

        if (progressContainer) {
            progressContainer.style.display = 'block';
        }

        const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${percentage}%`;
        }
        
        if (fileInfo) {
            if (currentFileIndex !== undefined && totalFiles !== undefined) {
                fileInfo.textContent = `File ${currentFileIndex + 1} of ${totalFiles}: ${currentFile}`;
            } else {
                fileInfo.textContent = currentFile;
            }
        }
    }

    hideUploadProgress() {
        const progressContainer = document.getElementById('uploadProgressContainer');
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
        
        // Reset progress bar
        const progressBar = document.getElementById('uploadProgressBar');
        const progressText = document.getElementById('uploadProgressText');
        const fileInfo = document.getElementById('uploadFileInfo');
        
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        if (fileInfo) fileInfo.textContent = '';
    }

    // Complete client-side upload methods - replace the existing methods in your main.js

async handleFileUpload(files) {
    const filesArray = Array.from(files);
    const imageFiles = filesArray.filter(f => f.type.startsWith('image/'));
    const captionFiles = filesArray.filter(f => f.name.endsWith('.txt'));
    const captionsMap = new Map();

    
    // console.log( ` in handleFileUpload` )

    if (imageFiles.length === 0) {
        this.showNotification('No images were uploaded.', 'error');
        return;
    }

    // Process caption files first
    for (const file of captionFiles) {
        const text = await file.text();
        const baseName = file.name.replace(/\.txt$/, '');
        captionsMap.set(baseName, text.trim()); // Ensure we trim the caption
    }

    console.log(`Found ${captionFiles.length} caption files`);
    console.log(`Caption map size: ${captionsMap.size}`);
    
    // Debug: Log first few caption mappings
    let debugCount = 0;
    for (let [key, value] of captionsMap) {
        if (debugCount < 3) {
            console.log(`Caption mapping: "${key}" -> "${value}"`);
            debugCount++;
        }
    }

    // Determine if we need to chunk the upload
    const CHUNK_SIZE = 50;
    const shouldChunk = imageFiles.length > CHUNK_SIZE;

    if (shouldChunk) {
        await this.handleChunkedUpload(imageFiles, captionsMap, CHUNK_SIZE);
    } else {
        await this.handleSingleUpload(imageFiles, captionsMap);
    }
}

async handleChunkedUpload(imageFiles, captionsMap, chunkSize) {
    const totalFiles = imageFiles.length;
    const chunks = [];
    
    // Create chunks
    for (let i = 0; i < totalFiles; i += chunkSize) {
        chunks.push(imageFiles.slice(i, i + chunkSize));
    }

    this.showNotification(`Uploading ${totalFiles} images in ${chunks.length} batches...`, 'info');
    console.log(`Starting chunked upload: ${chunks.length} chunks of up to ${chunkSize} files each`);

    try {
        let totalCaptionedImages = 0;
        
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            const startIndex = chunkIndex * chunkSize;
            
            // Show progress for current chunk
            this.showUploadProgress(
                startIndex, 
                totalFiles, 
                `Batch ${chunkIndex + 1}/${chunks.length}`,
                startIndex,
                totalFiles
            );

            const response = await this.uploadChunk(chunk, captionsMap, chunkIndex + 1, chunks.length);
            
            // Track captioned images if response includes the count
            if (response && response.captionedCount !== undefined) {
                totalCaptionedImages += response.captionedCount;
            }
            
            // Brief pause between chunks to prevent overwhelming the server
            if (chunkIndex < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        this.showNotification(
            `Successfully uploaded ${totalFiles} images${totalCaptionedImages > 0 ? ` (${totalCaptionedImages} with captions)` : ''}!`, 
            'success'
        );
        await this.loadImages();
    } catch (error) {
        this.showNotification(`Upload failed: ${error.message}`, 'error');
        console.error('Chunked upload error:', error);
    } finally {
        this.hideUploadProgress();
    }
}

async uploadChunk(imageFiles, captionsMap, chunkNumber, totalChunks) {
    const formData = new FormData();
    

    console.log( `@@@@@@@@@@@@@@ uploadChunk` )
    
    // console.log(`Preparing chunk ${chunkNumber} with ${imageFiles.length} files`);
    
    // Build arrays to maintain order
    const chunkCaptions = [];
    
    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const baseName = file.name.replace(/\.[^.]+$/, ''); // Remove extension
        const caption = captionsMap.get(baseName) || '';


         console.log( `@@@@@@caption@@@@@@ ${caption} @@@@@@@@@@` )
        
        
         // Debug: Log first few files in each chunk
        if (i < 3) {
            console.log(`Chunk ${chunkNumber}, File ${i}: "${file.name}" -> baseName: "${baseName}" -> caption: "${caption}"`);
        }
        
        formData.append('images', file);
        chunkCaptions.push(caption);
    }
    
    // Append all captions to FormData
    chunkCaptions.forEach(caption => {
        formData.append('captions', caption);
    });
    
    console.log(`Chunk ${chunkNumber}: ${imageFiles.length} images, ${chunkCaptions.length} captions`);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                this.showUploadProgress(
                    e.loaded, 
                    e.total, 
                    `Batch ${chunkNumber}/${totalChunks}`,
                    chunkNumber - 1,
                    totalChunks
                );
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    console.log(`Chunk ${chunkNumber} response:`, response);
                    resolve(response);
                } catch (parseError) {
                    console.log(`Chunk ${chunkNumber} completed (couldn't parse response)`);
                    resolve({ captionedCount: 0 }); // Return default object
                }
            } else {
                reject(new Error(`Batch ${chunkNumber} failed with status ${xhr.status}`));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error(`Network error in batch ${chunkNumber}`));
        });

        xhr.addEventListener('timeout', () => {
            reject(new Error(`Timeout in batch ${chunkNumber}`));
        });

        xhr.timeout = 300000; // 5 minutes
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
    });
}

async handleSingleUpload(imageFiles, captionsMap) {
    const formData = new FormData();
    const allCaptions = [];
    
    console.log(`Preparing single upload with ${imageFiles.length} files`);
    
    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const caption = captionsMap.get(baseName) || '';
        
        // Debug: Log first few files
        if (i < 5) {
            console.log(`File ${i}: "${file.name}" -> baseName: "${baseName}" -> caption: "${caption}"`);
        }
        
        formData.append('images', file);
        allCaptions.push(caption);
    }
    
    // Append all captions
    allCaptions.forEach(caption => {
        formData.append('captions', caption);
    });
    
    console.log(`Single upload: ${imageFiles.length} images, ${allCaptions.length} captions`);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                this.showUploadProgress(e.loaded, e.total, 'Uploading...');
            }
        });

        xhr.addEventListener('load', async () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    console.log('Upload response:', response);
                    
                    if (response.captionedCount !== undefined) {
                        this.showNotification(
                            `Upload complete! ${response.count} images uploaded, ${response.captionedCount} with captions. Refreshing gallery...`, 
                            'success'
                        );
                    } else {
                        this.showNotification('Upload complete! Refreshing gallery...', 'success');
                    }
                    
                    await this.loadImages();
                    resolve(response);
                } catch (parseError) {
                    console.error('Response parsing error:', parseError);
                    this.showNotification('Upload completed! Refreshing gallery...', 'success');
                    await this.loadImages();
                    resolve();
                }
            } else {
                this.showNotification('Upload failed', 'error');
                reject(new Error('Upload failed'));
            }
            this.hideUploadProgress();
        });

        xhr.addEventListener('error', () => {
            this.showNotification('Upload failed', 'error');
            this.hideUploadProgress();
            reject(new Error('Upload failed'));
        });

        xhr.addEventListener('abort', () => {
            this.showNotification('Upload cancelled', 'info');
            this.hideUploadProgress();
            reject(new Error('Upload cancelled'));
        });

        xhr.timeout = 600000; // 10 minutes
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
    });
}





    async updateCaption(imageId, caption) {
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
        // console.log('clear all button clicked')
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
                this.updateCaption(image._id, e.target.value);
                card.querySelector('.char-count span').textContent = e.target.value.length;
                this.updateAllTagsWithCounts();
                this.renderSidePanel();
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

    selectCaptionTag(text) {
        this.currentMatches = this.images
            .map((img, idx) => ({ img, idx }))
            .filter(x => x.img.caption && x.img.caption.split(',').map(s => s.trim()).includes(text));

        if (!this.currentMatches.length) return;
        this.currentMatchIndex = 0;
        this.focusMatch(text);
    }

    focusMatch(textToHighlight) {
        document.querySelectorAll('.image-card').forEach(card => card.classList.remove('highlighted'));

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
});


// Drag to resize side panel
const sidePanel = document.getElementById('sidePanel');
const handle = document.getElementById('sidePanelHandle');
let isResizing = false;

handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'ew-resize';
});

document.addEventListener('mousemove', (e) => {
    e.preventDefault();
    if (isResizing) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= 200 && newWidth <= 600) { // Set min and max width
            sidePanel.style.width = `${newWidth}px`;
        }
    }
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = 'default';
    }
});