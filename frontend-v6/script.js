// ==============================
// 🔧 CONFIGURATION
// ==============================
const BACKEND_DEFAULT_PORT = 7861;

function resolveApiBase() {
  const trim = (value) => (value ? value.replace(/\/+$/, "") : value);

  const globalCfg = window.__HELIO_CONFIG__ || window.HELIO_CONFIG || {};
  const inlineBase = globalCfg.API_BASE || globalCfg.apiBase || window.HELIO_API_BASE;
  if (inlineBase) return trim(inlineBase);

  const metaBase = document.querySelector('meta[name="api-base"]')?.getAttribute("content");
  if (metaBase) return trim(metaBase);

  if (window.location?.origin?.startsWith("http")) {
    const { protocol, hostname, port } = window.location;
    if (!port || port === "80" || port === "443" || Number(port) === BACKEND_DEFAULT_PORT) {
      return trim(`${protocol}//${hostname}${port ? `:${port}` : ""}`);
    }
    return trim(`${protocol}//${hostname}:${BACKEND_DEFAULT_PORT}`);
  }

  return `http://127.0.0.1:${BACKEND_DEFAULT_PORT}`;
}

const CONFIG = {
  API_BASE: resolveApiBase(),
  get BACKEND_FRAMES() {
    return `${this.API_BASE}/frames`;
  },
  get CONTEXT_API() {
    return `${this.API_BASE}/api/context`;
  },
  get SEARCH_API() {
    return `${this.API_BASE}/api/search`;
  }
};

// ==============================
// 📦 DOM ELEMENTS
// ==============================
const DOM = {
  form: document.getElementById("searchForm"),
  mainQuery: document.getElementById("mainQuery"),
  nextQueries: document.getElementById("nextQueries"),
  expandedPrompt: document.getElementById("expandedPrompt"),
  
  resultsGrid: document.getElementById("resultsGrid"),
  resultCount: document.getElementById("resultCount"),
  loadingState: document.getElementById("loadingState"),
  emptyState: document.getElementById("emptyState"),
  
  ocrQuery: document.getElementById("ocrQuery"),
  audioQuery: document.getElementById("audioQuery"),
  
  objectFilterToggle: document.getElementById("objectFilterToggle"),
  objectFilterContent: document.getElementById("objectFilterContent"),
  objectInput: document.getElementById("objectInput"),
  objectDropdown: document.getElementById("objectDropdown"),
  objectList: document.getElementById("objectList"),
  selectedTags: document.getElementById("selectedTags"),
  objectFilters: document.getElementById("objectFilters"),
  
  uploadArea: document.getElementById("uploadArea"),
  uploadImage: document.getElementById("uploadImage"),
  uploadPlaceholder: document.getElementById("uploadPlaceholder"),
  uploadPreview: document.getElementById("uploadPreview"),
  previewImg: document.getElementById("previewImg"),
  removeImage: document.getElementById("removeImage"),
  
  topkSlider: document.getElementById("topkSlider"),
  topkValue: document.getElementById("topkValue"),
  topkInput: document.getElementById("topkInput"),
  
  statusBadge: document.getElementById("statusBadge"),
  
  // DRES elements
  quickPaste: document.getElementById("quickPaste"),
  parseBtn: document.getElementById("parseBtn"),
  kisVideoId: document.getElementById("kisVideoId"),
  kisFrameId: document.getElementById("kisFrameId"),
  qaVideoId: document.getElementById("qaVideoId"),
  qaFrameId: document.getElementById("qaFrameId"),
  qaAnswer: document.getElementById("qaAnswer"),
  trakeFrameIds: document.getElementById("trakeFrameIds"),
  
  // Gemini elements
  refineInput: document.getElementById("refineInput"),
  refineBtn: document.getElementById("refineBtn"),
  refinedText: document.getElementById("refinedText"),
  refineOutput: document.getElementById("refineOutput"),
  refineLoading: document.getElementById("refineLoading"),
};

// ==============================
// 🗃️ STATE
// ==============================
const STATE = {
  currentResults: [],
  selectedObjects: [],
  allObjects: [],
  uploadedFile: null,
  objectFilterEnabled: true
};

// ==============================
// 🎨 UI UTILITIES
// ==============================
const UI = {
  showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    const icons = {
      success: "fa-check-circle",
      error: "fa-exclamation-circle",
      warning: "fa-exclamation-triangle",
      info: "fa-info-circle"
    };
    
    const rendered = (typeof message === 'string' ? message : String(message)).replace(/\n/g, '<br>');
    toast.innerHTML = `
      <i class="fas ${icons[type]}"></i>
      <span class="toast-message" style="white-space: pre-wrap">${rendered}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = "slideOutRight 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  updateStatus(text, color = "#10b981") {
    DOM.statusBadge.innerHTML = `<i class="fas fa-circle" style="color: ${color}"></i> ${text}`;
  },

  showLoading() {
    DOM.loadingState.style.display = "flex";
    DOM.emptyState.style.display = "none";
    DOM.resultsGrid.style.display = "none";
    this.updateStatus("Searching...", "#f59e0b");
  },

  showResults(count) {
    DOM.loadingState.style.display = "none";
    DOM.emptyState.style.display = "none";
    DOM.resultsGrid.style.display = "grid";
    DOM.resultCount.textContent = `${count} kết quả`;
    this.updateStatus("Ready", "#10b981");
  },

  showEmpty() {
    DOM.loadingState.style.display = "none";
    DOM.emptyState.style.display = "flex";
    DOM.resultsGrid.style.display = "none";
    DOM.resultCount.textContent = "0 kết quả";
    this.updateStatus("Ready", "#10b981");
  }
};

// ==============================
// 📋 COPY TO CLIPBOARD
// ==============================
const Clipboard = {
  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      // Silent copy, no toast notification
    } catch (err) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      // Silent copy, no toast notification
    }
  }
};

// Helper: fill sidebar KIS/QA forms from parsed frame id
function fillSidebarFormsFromFrameId(frameIdString) {
  const parsed = DRES.parseFrameId(frameIdString || "");
  if (!parsed) return false;
  const { videoId, frameId } = parsed;
  const kisVideoId = document.getElementById("kisVideoId");
  const kisFrameId = document.getElementById("kisFrameId");
  const qaVideoId = document.getElementById("qaVideoId");
  const qaFrameId = document.getElementById("qaFrameId");
  if (kisVideoId) kisVideoId.value = videoId;
  if (kisFrameId) kisFrameId.value = frameId;
  if (qaVideoId) qaVideoId.value = videoId;
  if (qaFrameId) qaFrameId.value = frameId;
  return true;
}

// ==============================
// 🔍 IMAGE ZOOM
// ==============================
const ImageZoom = {
  currentFrames: [],
  currentIndex: 0,

  init() {
    const modal = document.getElementById("imageZoomModal");
    const overlay = modal.querySelector(".zoom-modal-overlay");
    const closeBtn = document.getElementById("zoomClose");
    const prevBtn = document.getElementById("zoomPrev");
    const nextBtn = document.getElementById("zoomNext");
    const frameIdEl = document.getElementById("zoomFrameId");
    
    closeBtn.addEventListener("click", () => this.close());
    overlay.addEventListener("click", () => this.close());
    
    prevBtn.addEventListener("click", () => this.navigate(-1));
    nextBtn.addEventListener("click", () => this.navigate(1));
    
    // Copy frame ID on click
    frameIdEl.addEventListener("click", () => {
      const frameId = frameIdEl.textContent;
      if (frameId) Clipboard.copy(frameId);
    });
    
    // Keyboard navigation
    document.addEventListener("keydown", (e) => {
      if (modal.style.display === "flex") {
        if (e.key === "Escape") {
          this.close();
        } else if (e.key === "ArrowLeft") {
          this.navigate(-1);
        } else if (e.key === "ArrowRight") {
          this.navigate(1);
        }
      }
    });
    
    // Add TRAKE button - đồng bộ với context viewer
    const addTrakeBtn = document.getElementById("zoomAddTrakeBtn");
    if (addTrakeBtn) {
      addTrakeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const frameId = addTrakeBtn.getAttribute("data-frame-id");
        if (frameId) {
          const addToInput = (input) => {
            if (input) {
              const currentValue = input.value.trim();
              if (currentValue) {
                // Kiểm tra xem frame ID đã có chưa
                const frameIds = currentValue.split(",").map(id => id.trim());
                if (!frameIds.includes(frameId)) {
                  input.value = currentValue + ", " + frameId;
                }
              } else {
                input.value = frameId;
              }
            }
          };
          
          // Thêm vào cả zoom modal và context viewer
          const zoomTrakeInput = document.getElementById("zoomTrakeIds");
          const contextTrakeInput = document.getElementById("contextTrakeIds");
          addToInput(zoomTrakeInput);
          addToInput(contextTrakeInput);
        }
      });
    }
  },

  open(frames, currentIndex = 0) {
    this.currentFrames = frames;
    this.currentIndex = currentIndex;
    this.render();
    
    // Đồng bộ nội dung TRAKE IDs từ context viewer
    const contextTrakeInput = document.getElementById("contextTrakeIds");
    const zoomTrakeInput = document.getElementById("zoomTrakeIds");
    if (contextTrakeInput && zoomTrakeInput) {
      zoomTrakeInput.value = contextTrakeInput.value;
      // Thiết lập đồng bộ 2 chiều
      syncTrakeInputs();
    }
    
    const modal = document.getElementById("imageZoomModal");
    modal.style.display = "flex";
  },

  navigate(direction) {
    const newIndex = this.currentIndex + direction;
    
    if (newIndex >= 0 && newIndex < this.currentFrames.length) {
      this.currentIndex = newIndex;
      this.render();
    }
  },

  render() {
    const img = document.getElementById("zoomImg");
    const frameIdEl = document.getElementById("zoomFrameId");
    const progressEl = document.getElementById("zoomProgress");
    const prevBtn = document.getElementById("zoomPrev");
    const nextBtn = document.getElementById("zoomNext");
    
    const currentFrame = this.currentFrames[this.currentIndex];
    
    if (currentFrame) {
      img.src = currentFrame.imageUrl;
      const frameId = currentFrame.frameId || "";
      frameIdEl.textContent = frameId;
      progressEl.textContent = `${this.currentIndex + 1} / ${this.currentFrames.length}`;
      
      // Parse frame ID to extract video ID and frame number
      const parts = frameId.split("_");
      if (parts.length >= 3) {
        const videoId = parts.slice(0, -1).join("_"); // Everything except last part
        const frameNum = parts[parts.length - 1]; // Last part
        
        // Update submit form fields
        const videoIdInput = document.getElementById("zoomVideoId");
        const frameIdInput = document.getElementById("zoomFrameId2");
        if (videoIdInput) videoIdInput.value = videoId;
        if (frameIdInput) frameIdInput.value = frameNum;
      }
      
      // Update add TRAKE button data attribute
      const addTrakeBtn = document.getElementById("zoomAddTrakeBtn");
      if (addTrakeBtn) {
        addTrakeBtn.setAttribute("data-frame-id", frameId);
      }
    }
    
    // Update button states
    prevBtn.disabled = this.currentIndex === 0;
    nextBtn.disabled = this.currentIndex === this.currentFrames.length - 1;
  },

  close() {
    const modal = document.getElementById("imageZoomModal");
    modal.style.display = "none";
    this.currentFrames = [];
    this.currentIndex = 0;
  }
};

// ==============================
// 🎯 OBJECT FILTER
// ==============================
const ObjectFilter = {
  init() {
    // Toggle filter on/off
    DOM.objectFilterToggle.addEventListener("change", (e) => {
      STATE.objectFilterEnabled = e.target.checked;
      if (STATE.objectFilterEnabled) {
        DOM.objectFilterContent.classList.remove("disabled");
      } else {
        DOM.objectFilterContent.classList.add("disabled");
        // Clear filters when disabled
        ObjectFilter.clearAll();
      }
    });

    // Show dropdown on click
    DOM.objectInput.addEventListener("click", () => {
      if (STATE.objectFilterEnabled) {
        this.showDropdown();
      }
    });

    // Filter as typing
    DOM.objectInput.addEventListener("input", (e) => {
      if (STATE.objectFilterEnabled) {
        this.filterList(e.target.value);
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!DOM.objectInput.contains(e.target) && !DOM.objectDropdown.contains(e.target)) {
        DOM.objectDropdown.classList.remove("show");
      }
    });
  },

  showDropdown() {
    this.renderList();
    DOM.objectDropdown.classList.add("show");
  },

  hideDropdown() {
    DOM.objectDropdown.classList.remove("show");
  },

  filterList(query) {
    const lowerQuery = query.toLowerCase().trim();
    
    if (lowerQuery.length === 0) {
      this.renderList();
      return;
    }
    
    const matches = STATE.allObjects.filter(obj => 
      obj.name.toLowerCase().includes(lowerQuery)
    );
    
    this.renderList(matches, lowerQuery);
  },

  renderList(objects = STATE.allObjects, query = "") {
    DOM.objectList.innerHTML = objects.map(obj => {
      const isSelected = STATE.selectedObjects.includes(obj.name);
      let displayName = obj.name;
      
      if (query) {
        displayName = obj.name.replace(
          new RegExp(query, 'gi'),
          match => `<mark>${match}</mark>`
        );
      }
      
      return `
        <div class="object-item ${isSelected ? 'selected' : ''}" data-value="${obj.name}">
          ${displayName} <span style="color: var(--gray-400);">(${obj.count})</span>
        </div>
      `;
    }).join("");

    // Add click handlers
    DOM.objectList.querySelectorAll(".object-item").forEach(item => {
      item.addEventListener("click", () => {
        const objectName = item.dataset.value;
        if (STATE.selectedObjects.includes(objectName)) {
          this.removeObject(objectName);
        } else {
          this.addObject(objectName);
        }
      });
    });
  },

  addObject(objectName) {
    if (STATE.selectedObjects.includes(objectName)) return;
    
    STATE.selectedObjects.push(objectName);
    this.updateUI();
  },

  removeObject(objectName) {
    STATE.selectedObjects = STATE.selectedObjects.filter(obj => obj !== objectName);
    this.updateUI();
  },

  clearAll() {
    STATE.selectedObjects = [];
    this.updateUI();
  },

  updateUI() {
    // Update tags
    DOM.selectedTags.innerHTML = STATE.selectedObjects.map(obj => `
      <div class="tag">
        <span>${obj}</span>
        <span class="tag-remove" data-value="${obj}">
          <i class="fas fa-times"></i>
        </span>
      </div>
    `).join("");
    
    // Add remove handlers
    DOM.selectedTags.querySelectorAll(".tag-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        this.removeObject(btn.dataset.value);
      });
    });
    
    // Update hidden input
    DOM.objectFilters.value = STATE.selectedObjects.join("\n");
    
    // Update dropdown if visible
    if (DOM.objectDropdown.classList.contains("show")) {
      this.filterList(DOM.objectInput.value);
    }
  },

  async loadObjects() {
    try {
      const res = await fetch("object_list.csv");
      const text = await res.text();
      const lines = text.trim().split("\n");
      
      const hasHeader = lines[0].toLowerCase().includes("object");
      const dataLines = hasHeader ? lines.slice(1) : lines;
      
      STATE.allObjects = dataLines.map(line => {
        const [name, count] = line.split(",");
        return { name: name.trim(), count: count || 0 };
      }).filter(obj => obj.name);
      
    } catch (err) {
      console.error("Error loading objects:", err);
    }
  }
};

// ==============================
// 🖼️ IMAGE UPLOAD
// ==============================
const ImageUpload = {
  init() {
    DOM.uploadPlaceholder.addEventListener("click", () => DOM.uploadImage.click());
    DOM.uploadImage.addEventListener("change", (e) => this.handleFile(e.target.files[0]));
    DOM.removeImage.addEventListener("click", () => this.removeImage());
    
    DOM.uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      DOM.uploadArea.classList.add("dragover");
    });
    
    DOM.uploadArea.addEventListener("dragleave", () => {
      DOM.uploadArea.classList.remove("dragover");
    });
    
    DOM.uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      DOM.uploadArea.classList.remove("dragover");
      
      const imageUrl = e.dataTransfer.getData("image-url");
      const frameId = e.dataTransfer.getData("frame-id");
      
      if (imageUrl && frameId) {
        this.loadImageFromUrl(imageUrl, frameId);
        return;
      }
      
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        this.handleFile(file);
      } else {
        UI.showToast("Chỉ chấp nhận file ảnh!", "error");
      }
    });
  },

  handleFile(file) {
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      UI.showToast("File quá lớn! Tối đa 10MB", "error");
      return;
    }
    
    STATE.uploadedFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      DOM.previewImg.src = e.target.result;
      DOM.uploadPlaceholder.style.display = "none";
      DOM.uploadPreview.style.display = "block";
      UI.showToast("Đã tải ảnh lên!", "success");
    };
    reader.readAsDataURL(file);
    
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    DOM.uploadImage.files = dataTransfer.files;
  },

  async loadImageFromUrl(url, frameId) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], `${frameId}.jpg`, { type: blob.type });
      
      this.handleFile(file);
      UI.showToast(`Đã tải ảnh từ ${frameId}`, "success");
    } catch (err) {
      console.error("Error loading image:", err);
      UI.showToast("Lỗi khi tải ảnh", "error");
    }
  },

  removeImage() {
    STATE.uploadedFile = null;
    DOM.uploadImage.value = "";
    DOM.uploadPlaceholder.style.display = "block";
    DOM.uploadPreview.style.display = "none";
    DOM.previewImg.src = "";
    UI.showToast("Đã xóa ảnh", "info");
  }
};

// ==============================
// 🔍 SEARCH
// ==============================
const Search = {
  async submit(e) {
    e.preventDefault();
    
    // Check if we have at least one search criteria
    const hasMainQuery = DOM.mainQuery.value.trim().length > 0;
    const hasNextQueries = DOM.nextQueries.value.trim().length > 0;
    const hasOCR = DOM.ocrQuery.value.trim().length > 0;
    const hasAudio = DOM.audioQuery.value.trim().length > 0;
    const hasObjects = STATE.selectedObjects.length > 0 && STATE.objectFilterEnabled;
    const hasImage = STATE.uploadedFile !== null;
    
    if (!hasMainQuery && !hasNextQueries && !hasOCR && !hasAudio && !hasObjects && !hasImage) {
      UI.showToast("Vui lòng nhập ít nhất 1 điều kiện tìm kiếm", "warning");
      return;
    }
    
    UI.showLoading();
    
    const formData = new FormData(DOM.form);
    formData.set("topk", DOM.topkSlider.value);
    
    try {
      const res = await fetch(CONFIG.SEARCH_API, {
        method: "POST",
        body: formData
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      
      if (data.status === "ok" && data.results && data.results.length > 0) {
        STATE.currentResults = data.results;
        Results.render(data.results);
        UI.showResults(data.results.length);
        UI.showToast(`Tìm thấy ${data.results.length} kết quả`, "success");
      } else {
        STATE.currentResults = [];
        UI.showEmpty();
        UI.showToast("Không tìm thấy kết quả", "warning");
      }
    } catch (err) {
      console.error("Search error:", err);
      UI.showEmpty();
      UI.showToast("Lỗi khi tìm kiếm: " + err.message, "error");
    }
  }
};

// ==============================
// 📊 RESULTS
// ==============================
const Results = {
  render(results) {
    DOM.resultsGrid.innerHTML = "";
    
    results.forEach((result, index) => {
      const card = this.createCard(result, index);
      DOM.resultsGrid.appendChild(card);
    });
  },

  createCard(result, index) {
    const card = document.createElement("div");
    card.className = "result-card";
    card.dataset.index = index;
    
    let framePath = result.path || "";
    framePath = framePath.replace(/^.*Videos_/, "Videos_");
    const imageUrl = `${CONFIG.BACKEND_FRAMES}/${framePath}`;
    
    const hasOCR = result.ocr_text && result.ocr_text.trim();
    const frameId = result.frame_id || "Frame";
    
    // Use similarity field like v7 (fallback to combined_score if similarity not available)
    const similarity = result.similarity !== undefined ? result.similarity : (result.combined_score || 0);
    const scorePercent = (similarity * 100).toFixed(1);
    
    card.innerHTML = `
      <div class="result-card-image">
        <img class="frame-img"
             src="${imageUrl}" 
             alt="${frameId}"
             loading="lazy"
             decoding="async"
             draggable="true"
             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27200%27 height=%27140%27%3E%3Crect width=%27200%27 height=%27140%27 fill=%27%23f3f4f6%27/%3E%3Ctext x=%2750%25%27 y=%2750%25%27 text-anchor=%27middle%27 fill=%27%239ca3af%27 font-size=%2711%27 dy=%27.3em%27%3ENo Image%3C/text%3E%3C/svg%3E';">
        ${hasOCR ? `<div class="ocr-badge"><i class="fas fa-font"></i> OCR</div>` : ""}
      </div>
      <div class="result-card-body">
        <div class="frame-id" data-frame-id="${frameId}">
          <strong>${frameId}</strong>
          <button class="copy-btn" title="Copy">
            <i class="fas fa-copy"></i>
          </button>
        </div>
        <div class="result-score">
          <span>${scorePercent}%</span>
          <div class="score-bar">
            <div class="score-fill" style="width: ${scorePercent}%"></div>
          </div>
        </div>
        ${hasOCR ? `<small title="${result.ocr_text}">📝 ${result.ocr_text.substring(0, 30)}${result.ocr_text.length > 30 ? "..." : ""}</small>` : ""}
        <div class="result-actions">
          <button class="btn-result btn-context" data-frame-id="${frameId}">
            <i class="fas fa-th"></i> Context
          </button>
          <button class="btn-result btn-submit-kis" data-frame-id="${frameId}">
            <i class="fas fa-paper-plane"></i> Submit
          </button>
        </div>
      </div>
    `;
    
    this.setupCardInteractions(card, result);
    
    return card;
  },

  setupCardInteractions(card, result) {
    const img = card.querySelector(".frame-img");
    const frameIdEl = card.querySelector(".frame-id");
    const copyBtn = card.querySelector(".copy-btn");
    const contextBtn = card.querySelector(".btn-context");
    const submitKisBtn = card.querySelector(".btn-submit-kis");
    
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Copy to clipboard
      Clipboard.copy(result.frame_id);
      
      // Parse frame ID and fill into KIS and QA forms
      const parsed = DRES.parseFrameId(result.frame_id);
      if (parsed) {
        // Fill KIS form
        const kisVideoId = document.getElementById("kisVideoId");
        const kisFrameId = document.getElementById("kisFrameId");
        if (kisVideoId) kisVideoId.value = parsed.videoId;
        if (kisFrameId) kisFrameId.value = parsed.frameId;
        
        // Fill QA form
        const qaVideoId = document.getElementById("qaVideoId");
        const qaFrameId = document.getElementById("qaFrameId");
        if (qaVideoId) qaVideoId.value = parsed.videoId;
        if (qaFrameId) qaFrameId.value = parsed.frameId;
      }
    });
    
    frameIdEl.addEventListener("click", (e) => {
      if (e.target === copyBtn || copyBtn.contains(e.target)) return;
      // Copy to clipboard
      Clipboard.copy(result.frame_id);
      
      // Parse frame ID and fill into KIS and QA forms
      const parsed = DRES.parseFrameId(result.frame_id);
      if (parsed) {
        // Fill KIS form
        const kisVideoId = document.getElementById("kisVideoId");
        const kisFrameId = document.getElementById("kisFrameId");
        if (kisVideoId) kisVideoId.value = parsed.videoId;
        if (kisFrameId) kisFrameId.value = parsed.frameId;
        
        // Fill QA form
        const qaVideoId = document.getElementById("qaVideoId");
        const qaFrameId = document.getElementById("qaFrameId");
        if (qaVideoId) qaVideoId.value = parsed.videoId;
        if (qaFrameId) qaFrameId.value = parsed.frameId;
      }
    });
    
    img.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("image-url", img.src);
      e.dataTransfer.setData("frame-id", result.frame_id);
    });
    
    // Click vào ảnh -> mở zoom modal với tất cả kết quả
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      // Tạo frames array từ tất cả currentResults
      const frames = STATE.currentResults.map(r => {
        let framePath = r.path || "";
        framePath = framePath.replace(/^.*Videos_/, "Videos_");
        const imageUrl = `${CONFIG.BACKEND_FRAMES}/${framePath}`;
        return {
          imageUrl: imageUrl,
          frameId: r.frame_id,
          path: r.path
        };
      });
      
      // Tìm index của result hiện tại
      const currentIndex = STATE.currentResults.findIndex(r => r.frame_id === result.frame_id);
      const index = currentIndex >= 0 ? currentIndex : 0;
      
      ImageZoom.open(frames, index);
    });
    
    // Click vào nút Context -> mở context viewer
    contextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      Context.open(result.frame_id);
    });
    
    // Click vào nút Submit KIS -> submit KIS
    submitKisBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const frameId = result.frame_id || "";
      const parts = frameId.split("_");
      if (parts.length >= 3) {
        const videoId = parts.slice(0, -1).join("_");
        const frameNum = parts[parts.length - 1];
        
        const btn = submitKisBtn;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        
        try {
          await DRES.submitKIS(videoId, frameNum);
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
        }
      } else {
        UI.showToast("❌ Invalid frame ID format", "error");
      }
    });
  }
};

// ==============================
// 🧩 CONTEXT VIEWER
// ==============================
const Context = {
  async open(frameId) {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content">
        <div class="close-btn">&times;</div>
        <h3>🧩 Context frames cho <strong>${frameId}</strong></h3>
        <div class="context-grid" id="contextGrid">
          <p style="color:#9ca3af; grid-column: 1/-1; text-align:center;">Đang tải...</p>
        </div>
        <div class="context-submit-section">
          <input type="text" id="contextTrakeIds" placeholder="Frame IDs (phân cách bằng dấu phẩy)" class="context-trake-input" />
          <button type="button" id="contextSubmitTrake" class="btn-submit-trake-context">
            <i class="fas fa-upload"></i> Submit TRAKE
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector(".close-btn").onclick = () => this.close(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.close(modal);
    });
    
    // Submit TRAKE button
    const submitTrakeBtn = modal.querySelector("#contextSubmitTrake");
    if (submitTrakeBtn) {
      submitTrakeBtn.addEventListener("click", async () => {
        const trakeInput = modal.querySelector("#contextTrakeIds");
        const frameIds = trakeInput ? trakeInput.value.trim() : "";
        if (!frameIds) {
          UI.showToast("❌ Vui lòng nhập Frame IDs", "error");
          return;
        }
        try {
          await DRES.submitTRAKE(frameIds);
        } catch (error) {
          console.error("TRAKE submission error:", error);
        }
      });
    }
    
    await this.loadFrames(frameId);
    
    // Thiết lập đồng bộ TRAKE IDs với zoom modal
    syncTrakeInputs();
  },

  close(modal) {
    modal.style.animation = "fadeOut 0.2s ease";
    setTimeout(() => modal.remove(), 200);
  },

  async loadFrames(frameId) {
    const grid = document.getElementById("contextGrid");
    
    try {
      const res = await fetch(`${CONFIG.CONTEXT_API}/${frameId}`);
      const data = await res.json();
      
      if (data.status === "ok" && data.neighbors.length) {
        grid.innerHTML = "";
        const neighbors = data.neighbors;
        
        // Prepare frames for zoom navigation
        const frames = neighbors.slice(0, 25).map(neighbor => {
          let path = neighbor.path ? neighbor.path.replace(/^.*Videos_/, "Videos_") : "";
          return {
            imageUrl: path ? `${CONFIG.BACKEND_FRAMES}/${path}` : "",
            frameId: neighbor.frame_id || ""
          };
        });
        
        for (let i = 0; i < 25; i++) {
          const neighbor = neighbors[i] || {};
          const cell = this.createContextCell(neighbor, frameId, frames, i);
          grid.appendChild(cell);
        }
      } else {
        grid.innerHTML = '<p style="color:#ef4444; grid-column: 1/-1; text-align:center;">Không tìm thấy frame lân cận</p>';
      }
    } catch (err) {
      console.error(err);
      grid.innerHTML = '<p style="color:#ef4444; grid-column: 1/-1; text-align:center;">Lỗi khi tải context</p>';
    }
  },

  createContextCell(neighbor, currentFrameId, frames, index) {
    const cell = document.createElement("div");
    cell.className = "context-cell";
    
    let imgSrc = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23f3f4f6'/%3E%3C/svg%3E";
    
    if (neighbor.path) {
      let path = neighbor.path.replace(/^.*Videos_/, "Videos_");
      imgSrc = `${CONFIG.BACKEND_FRAMES}/${path}`;
    }
    
    const frameId = neighbor.frame_id || "";
    
    cell.innerHTML = `
      <div class="context-cell-image">
        <img src="${imgSrc}" alt="${frameId}" 
             loading="lazy"
             decoding="async"
             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27100%27 height=%27100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23f3f4f6%27/%3E%3C/svg%3E';">
        <div class="context-cell-actions">
          <button class="context-action-btn add-trake-btn" title="Thêm vào TRAKE" data-frame-id="${frameId}">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
      <div class="context-cell-text">
        <small>${frameId}</small>
        ${frameId ? `<button class="context-copy-btn" title="Copy"><i class="fas fa-copy"></i></button>` : ''}
      </div>
    `;
    
    if (neighbor.frame_id === currentFrameId) {
      cell.classList.add("current");
    }
    
    // Click vào ảnh -> mở zoom modal
    const cellImg = cell.querySelector("img");
    if (cellImg && imgSrc) {
      cellImg.addEventListener("click", (e) => {
        e.stopPropagation();
        ImageZoom.open(frames, index);
      });
    }
    
    // Click vào nút cộng -> thêm frame ID vào TRAKE IDs (đồng bộ với zoom modal)
    const addTrakeBtn = cell.querySelector(".add-trake-btn");
    if (addTrakeBtn && frameId) {
      addTrakeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const addToInput = (input) => {
          if (input) {
            const currentValue = input.value.trim();
            if (currentValue) {
              // Kiểm tra xem frame ID đã có chưa
              const frameIds = currentValue.split(",").map(id => id.trim());
              if (!frameIds.includes(frameId)) {
                input.value = currentValue + ", " + frameId;
              }
            } else {
              input.value = frameId;
            }
          }
        };
        
        // Thêm vào cả context viewer và zoom modal
        const contextTrakeInput = document.getElementById("contextTrakeIds");
        const zoomTrakeInput = document.getElementById("zoomTrakeIds");
        addToInput(contextTrakeInput);
        addToInput(zoomTrakeInput);
      });
    }
    
    // Add copy functionality
    const copyBtn = cell.querySelector(".context-copy-btn");
    if (copyBtn && frameId) {
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        Clipboard.copy(frameId);
        // Also parse into sidebar forms
        fillSidebarFormsFromFrameId(frameId);
      });
    }
    
    return cell;
  }
};

// ==============================
// 📥 EXPORT
// ==============================
const Export = {
  downloadCSV() {
    if (STATE.currentResults.length === 0) {
      UI.showToast("Không có kết quả để export!", "warning");
      return;
    }
    
    const answer = DOM.qaAnswer.value.trim();
    const rows = STATE.currentResults.slice(0, 100).map(result => {
      const videoId = result.VideosId || "";
      const frameNum = String(result.frame_id).split("_").pop();
      return answer ? [videoId, frameNum, answer] : [videoId, frameNum];
    });
    
    const csv = rows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = "answers.csv";
    link.click();
    
    URL.revokeObjectURL(url);
    UI.showToast(`Đã export ${rows.length} kết quả`, "success");
  }
};

// ==============================
// ⚙️ CONTROLS
// ==============================
const Controls = {
  init() {
    DOM.topkSlider.addEventListener("input", (e) => {
      DOM.topkValue.textContent = e.target.value;
      DOM.topkInput.value = e.target.value;
    });
  }
};

// ==============================
// 🚀 APP INIT
// ==============================
const App = {
  init() {
    ObjectFilter.init();
    ImageUpload.init();
    ImageZoom.init();
    Controls.init();
    
    ObjectFilter.loadObjects();
    
    DOM.form.addEventListener("submit", (e) => Search.submit(e));
    // DOM.downloadCsv.addEventListener("click", () => Export.downloadCSV()); // Removed from UI
    
    UI.showEmpty();
    UI.updateStatus("Ready", "#10b981");
    
    console.log("✅ HelioSearch loaded!");

    // QuickPaste: click submit header to paste latest clipboard into sidebar forms
    const submitHeader = document.querySelector('.submit-header');
    if (submitHeader && navigator.clipboard && navigator.clipboard.readText) {
      submitHeader.addEventListener('click', async () => {
        try {
          const text = (await navigator.clipboard.readText()) || '';
          if (!text.trim()) {
            UI.showToast('Clipboard rỗng', 'warning');
            return;
          }
          const ok = fillSidebarFormsFromFrameId(text.trim());
          if (!ok) {
            UI.showToast('Không nhận dạng được định dạng Frame ID', 'error');
          } else {
            UI.showToast('Đã dán vào KIS/QA', 'success');
          }
        } catch (err) {
          UI.showToast('Không thể đọc clipboard', 'error');
        }
      });
    }
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());

// ==============================
// 📤 DRES SUBMISSION
// ==============================
const DRES = {
  // Parse quick paste input (e.g., "L24_V002_12513")
  parseFrameId(input) {
    const cleaned = input.trim();
    const match = cleaned.match(/^([LK]\d+)_([V]\d+)_(\d+)$/);
    
    if (match) {
      const [, batch, video, frame] = match;
      return {
        videoId: `${batch}_${video}`,
        frameId: frame
      };
    }
    
    return null;
  },

  // Submit KIS
  async submitKIS(videoId, frameId) {
    try {
      const formData = new FormData();
      formData.append("video_id", videoId);
      formData.append("frame_id", frameId);

      const response = await fetch(`${CONFIG.API_BASE}/api/submit-kis`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        const payload = data?.data ?? data;
        // Format response message
        let message = `✅ KIS submitted: ${videoId}_${frameId}`;
        if (payload.status !== undefined) {
          message += `\nStatus: ${payload.status}`;
        }
        if (payload.submission) {
          message += `\nSubmission: ${payload.submission}`;
        }
        if (payload.description) {
          message += `\nDescription: ${payload.description}`;
        }
        // Also log full response to console
        console.log("KIS Response:", payload);
        UI.showToast(message, "success");
        return data;
      } else {
        throw new Error(data.detail || "Submission failed");
      }
    } catch (error) {
      UI.showToast(`❌ KIS failed: ${error.message}`, "error");
      throw error;
    }
  },

  // Submit QA
  async submitQA(videoId, frameId, answer) {
    try {
      if (!answer || !answer.trim()) {
        throw new Error("Answer is required for QA submission");
      }

      const formData = new FormData();
      formData.append("video_id", videoId);
      formData.append("frame_id", frameId);
      formData.append("answer", answer);

      const response = await fetch(`${CONFIG.API_BASE}/api/submit-qa`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        const payload = data?.data ?? data;
        // Format response message
        let message = `✅ QA submitted: Answer="${answer}"`;
        if (payload.status !== undefined) {
          message += `\nStatus: ${payload.status}`;
        }
        if (payload.submission) {
          message += `\nSubmission: ${payload.submission}`;
        }
        if (payload.description) {
          message += `\nDescription: ${payload.description}`;
        }
        // Also log full response to console
        console.log("QA Response:", payload);
        UI.showToast(message, "success");
        return data;
      } else {
        throw new Error(data.detail || "Submission failed");
      }
    } catch (error) {
      UI.showToast(`❌ QA failed: ${error.message}`, "error");
      throw error;
    }
  },

  // Submit TRAKE
  async submitTRAKE(frameIds) {
    try {
      if (!frameIds || !frameIds.trim()) {
        throw new Error("Frame IDs are required for TRAKE submission");
      }

      const formData = new FormData();
      formData.append("frame_ids", frameIds);

      const response = await fetch(`${CONFIG.API_BASE}/api/submit-trake`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        const count = frameIds.split(",").length;
        const payload = data?.data ?? data;
        // Format response message
        let message = `✅ TRAKE submitted: ${count} frames`;
        if (payload.status !== undefined) {
          message += `\nStatus: ${payload.status}`;
        }
        if (payload.submission) {
          message += `\nSubmission: ${payload.submission}`;
        }
        if (payload.description) {
          message += `\nDescription: ${payload.description}`;
        }
        // Also log full response to console
        console.log("TRAKE Response:", payload);
        UI.showToast(message, "success");
        return data;
      } else {
        throw new Error(data.detail || "Submission failed");
      }
    } catch (error) {
      UI.showToast(`❌ TRAKE failed: ${error.message}`, "error");
      throw error;
    }
  }
};

// ==============================
// 🤖 GEMINI QUERY REFINEMENT
// ==============================
const Gemini = {
  async refineQuery(query) {
    try {
      if (!query || !query.trim()) {
        throw new Error("Query is required");
      }

      const formData = new FormData();
      formData.append("query", query);

      const response = await fetch(`${CONFIG.API_BASE}/api/refine-query`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.status === "success") {
        return data.refined_query;
      } else {
        throw new Error(data.message || "Refinement failed");
      }
    } catch (error) {
      UI.showToast(`❌ Refinement failed: ${error.message}`, "error");
      throw error;
    }
  }
};

// ==============================
// 🎯 EVENT LISTENERS - DRES
// ==============================
// Quick Paste Parser
document.getElementById("parseBtn")?.addEventListener("click", () => {
  const input = document.getElementById("quickPaste").value;
  const parsed = DRES.parseFrameId(input);

  if (parsed) {
    // Fill KIS form
    document.getElementById("kisVideoId").value = parsed.videoId;
    document.getElementById("kisFrameId").value = parsed.frameId;

    // Fill QA form
    document.getElementById("qaVideoId").value = parsed.videoId;
    document.getElementById("qaFrameId").value = parsed.frameId;

    UI.showToast("✅ Parsed successfully!", "success");
  } else {
    UI.showToast("❌ Invalid format. Expected: L24_V002_12513", "error");
  }
});

// KIS Submission
document.getElementById("submitKisBtn")?.addEventListener("click", async () => {
  const videoId = document.getElementById("kisVideoId").value.trim();
  const frameId = document.getElementById("kisFrameId").value.trim();

  if (!videoId || !frameId) {
    UI.showToast("❌ Video ID and Frame ID are required", "error");
    return;
  }

  const btn = document.getElementById("submitKisBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

  try {
    await DRES.submitKIS(videoId, frameId);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-upload"></i> Submit KIS';
  }
});

// QA Submission
document.getElementById("submitQaBtn")?.addEventListener("click", async () => {
  const videoId = document.getElementById("qaVideoId").value.trim();
  const frameId = document.getElementById("qaFrameId").value.trim();
  const answer = document.getElementById("qaAnswer").value.trim();

  if (!videoId || !frameId || !answer) {
    UI.showToast("❌ All fields are required", "error");
    return;
  }

  const btn = document.getElementById("submitQaBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

  try {
    await DRES.submitQA(videoId, frameId, answer);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-upload"></i> Submit QA';
  }
});

// TRAKE Submission
document.getElementById("submitTrakeBtn")?.addEventListener("click", async () => {
  const frameIds = document.getElementById("trakeFrameIds").value.trim();

  if (!frameIds) {
    UI.showToast("❌ Frame IDs are required", "error");
    return;
  }

  const btn = document.getElementById("submitTrakeBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

  try {
    await DRES.submitTRAKE(frameIds);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-upload"></i> Submit TRAKE';
  }
});

// ==============================
// 🎯 EVENT LISTENERS - GEMINI
// ==============================
document.getElementById("refineBtn")?.addEventListener("click", async () => {
  const query = document.getElementById("refineInput").value.trim();

  if (!query) {
    UI.showToast("❌ Please enter a query to refine", "error");
    return;
  }

  const btn = document.getElementById("refineBtn");
  const loading = document.getElementById("refineLoading");
  const output = document.getElementById("refineOutput");

  btn.disabled = true;
  loading.style.display = "flex";
  output.style.display = "none";

  try {
    const refinedQuery = await Gemini.refineQuery(query);

    document.getElementById("refinedText").textContent = refinedQuery;
    output.style.display = "block";
    
    // Tự động điền vào mainQuery và search
    DOM.mainQuery.value = refinedQuery;
    UI.showToast("✅ Query refined and searching...", "success");
    
    // Tự động submit search
    if (DOM.form) {
      const mockEvent = { preventDefault: () => {} };
      Search.submit(mockEvent);
    }
  } catch (error) {
    console.error("Refinement error:", error);
  } finally {
    btn.disabled = false;
    loading.style.display = "none";
  }
});

// Use this query button - chỉ điền vào main query, không search
document.getElementById("useQueryBtn")?.addEventListener("click", () => {
  const refinedText = document.getElementById("refinedText");
  const refinedQuery = refinedText ? refinedText.textContent.trim() : "";
  
  if (!refinedQuery) {
    UI.showToast("❌ No refined query available", "error");
    return;
  }
  
  DOM.mainQuery.value = refinedQuery;
  UI.showToast("✅ Query inserted into search bar", "success");
  
  // Focus vào main query input
  if (DOM.mainQuery) {
    DOM.mainQuery.focus();
  }
});


console.log("✅ DRES Submission & Gemini Query Refinement modules loaded");


// ==============================
// NEW FEATURES
// ==============================

// 1. CLEAR ALL - Click logo text
document.getElementById('logoText')?.addEventListener('click', function() {
  DOM.mainQuery.value = '';
  DOM.nextQueries.value = '';
  DOM.ocrQuery.value = '';
  DOM.audioQuery.value = '';
  DOM.objectInput.value = '';
  STATE.selectedObjects = [];
  DOM.selectedTags.innerHTML = '';
  DOM.objectFilters.value = '';
  if (STATE.uploadedFile) {
    STATE.uploadedFile = null;
    DOM.uploadImage.value = '';
    DOM.uploadPreview.style.display = 'none';
    DOM.uploadPlaceholder.style.display = 'flex';
  }
  STATE.currentResults = [];
  DOM.resultsGrid.innerHTML = '';
  UI.showEmpty();
  UI.showToast('🔄 Cleared all inputs', 'info');
});

// 2. DARK MODE - Click video icon
const DarkMode = {
  enabled: false,
  toggle() {
    this.enabled = !this.enabled;
    document.body.classList.toggle('dark-mode', this.enabled);
    localStorage.setItem('darkMode', this.enabled);
    const icon = document.getElementById('darkModeToggle');
    if (icon) {
      icon.style.transform = this.enabled ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    UI.showToast(this.enabled ? '🌙 Dark mode' : '☀️ Light mode', 'info');
  },
  init() {
    const saved = localStorage.getItem('darkMode') === 'true';
    if (saved) {
      this.enabled = true;
      document.body.classList.add('dark-mode');
      const icon = document.getElementById('darkModeToggle');
      if (icon) icon.style.transform = 'rotate(180deg)';
    }
  }
};
DarkMode.init();
document.getElementById('darkModeToggle')?.addEventListener('click', (e) => {
  e.stopPropagation();
  DarkMode.toggle();
});

// 3. ENHANCED MODAL
const ZoomModal = {
  currentIndex: 0,
  neighbors: [],
  
  open(result, neighbors = []) {
    this.currentIndex = 0;
    this.neighbors = neighbors.length > 0 ? neighbors : [result];
    const modal = document.getElementById('imageZoomModal');
    if (modal) {
      modal.style.display = 'flex';
      this.showFrame(0);
    }
    document.addEventListener('keydown', this.handleKeyboard);
  },
  
  close() {
    const modal = document.getElementById('imageZoomModal');
    if (modal) modal.style.display = 'none';
    document.removeEventListener('keydown', this.handleKeyboard);
  },
  
  showFrame(index) {
    if (index < 0 || index >= this.neighbors.length) return;
    this.currentIndex = index;
    const frame = this.neighbors[index];
    
    // Update image
    document.getElementById('zoomImg').src = frame.url || frame.file_path || '';
    
    // Update info
    const frameIdDisplay = document.getElementById('zoomFrameId');
    if (frameIdDisplay) frameIdDisplay.textContent = frame.frame_id || '';
    const contextBtn = document.getElementById('zoomContextBtn');
    if (contextBtn) contextBtn.dataset.frameId = frame.frame_id || '';
    const addTrakeBtn = document.getElementById('zoomAddTrakeBtn');
    if (addTrakeBtn) addTrakeBtn.setAttribute('data-frame-id', frame.frame_id || '');
    document.getElementById('zoomProgress').textContent = `${index + 1} / ${this.neighbors.length}`;
    
    // Parse frame_id
    const frameId = frame.frame_id || '';
    const parts = frameId.split('_');
    const videoId = parts.length >= 2 ? `${parts[0]}_${parts[1]}` : '';
    const frameNum = parts.length >= 3 ? parts[2] : '';
    
    // Update submit fields
    document.getElementById('zoomVideoId').value = videoId;
    document.getElementById('zoomFrameId2').value = frameNum;
    document.getElementById('zoomAnswer').value = '';
    
    // Update OCR/ASR
    document.getElementById('zoomOcrText').textContent = frame.ocr_text || frame.ocr || 'No OCR text available';
    document.getElementById('zoomAsrText').textContent = frame.asr_text || frame.asr || 'No ASR transcript available';
  },
  
  prev() {
    if (this.currentIndex > 0) this.showFrame(this.currentIndex - 1);
  },
  
  next() {
    if (this.currentIndex < this.neighbors.length - 1) this.showFrame(this.currentIndex + 1);
  },
  
  handleKeyboard(e) {
    if (e.key === 'Escape') ZoomModal.close();
    if (e.key === 'ArrowLeft') ZoomModal.prev();
    if (e.key === 'ArrowRight') ZoomModal.next();
  }
};

// Modal controls
document.getElementById('zoomClose')?.addEventListener('click', () => ZoomModal.close());
document.getElementById('zoomPrev')?.addEventListener('click', () => ZoomModal.prev());
document.getElementById('zoomNext')?.addEventListener('click', () => ZoomModal.next());
document.querySelector('.zoom-modal-overlay')?.addEventListener('click', () => ZoomModal.close());
document.getElementById('zoomContextBtn')?.addEventListener('click', () => {
  const btn = document.getElementById('zoomContextBtn');
  const frameId = btn?.dataset.frameId || document.getElementById('zoomFrameId')?.textContent.trim();
  if (frameId) {
    Context.open(frameId);
  } else {
    UI.showToast('❌ Không tìm thấy Frame ID để mở context', 'error');
  }
});

// Submit from modal
document.getElementById('zoomSubmitKis')?.addEventListener('click', async () => {
  const videoId = document.getElementById('zoomVideoId').value;
  const frameId = document.getElementById('zoomFrameId2').value;
  if (!videoId || !frameId) {
    UI.showToast('❌ Missing video/frame ID', 'error');
    return;
  }
  const btn = document.getElementById('zoomSubmitKis');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
  try {
    await DRES.submitKIS(videoId, frameId);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-upload"></i> Submit KIS';
  }
});

document.getElementById('zoomSubmitQa')?.addEventListener('click', async () => {
  const videoId = document.getElementById('zoomVideoId').value;
  const frameId = document.getElementById('zoomFrameId2').value;
  const answer = document.getElementById('zoomAnswer').value.trim();
  if (!videoId || !frameId) {
    UI.showToast('❌ Missing video/frame ID', 'error');
    return;
  }
  if (!answer) {
    UI.showToast('❌ Please enter answer', 'error');
    return;
  }
  const btn = document.getElementById('zoomSubmitQa');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
  try {
    await DRES.submitQA(videoId, frameId, answer);
    document.getElementById('zoomAnswer').value = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-upload"></i> Submit QA';
  }
});

// Đồng bộ TRAKE IDs giữa zoom modal và context viewer
let trakeSyncInitialized = false;
const syncTrakeInputs = () => {
  if (trakeSyncInitialized) return;
  
  const zoomTrakeInput = document.getElementById('zoomTrakeIds');
  const contextTrakeInput = document.getElementById('contextTrakeIds');
  
  if (zoomTrakeInput && contextTrakeInput) {
    trakeSyncInitialized = true;
    
    // Đồng bộ từ zoom modal sang context viewer
    zoomTrakeInput.addEventListener('input', () => {
      const contextInput = document.getElementById('contextTrakeIds');
      if (contextInput) {
        contextInput.value = zoomTrakeInput.value;
      }
    });
    
    // Đồng bộ từ context viewer sang zoom modal
    contextTrakeInput.addEventListener('input', () => {
      const zoomInput = document.getElementById('zoomTrakeIds');
      if (zoomInput) {
        zoomInput.value = contextTrakeInput.value;
      }
    });
  }
};

// Submit TRAKE from zoom modal
document.getElementById('zoomSubmitTrake')?.addEventListener('click', async () => {
  const trakeInput = document.getElementById('zoomTrakeIds');
  const frameIds = trakeInput ? trakeInput.value.trim() : "";
  if (!frameIds) {
    UI.showToast("❌ Vui lòng nhập Frame IDs", "error");
    return;
  }
  const btn = document.getElementById('zoomSubmitTrake');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
  try {
    await DRES.submitTRAKE(frameIds);
  } catch (error) {
    console.error("TRAKE submission error:", error);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-upload"></i> Submit TRAKE';
  }
});

// Override openZoomModal from original script
window.openZoomModal = function(result) {
  fetch(`${CONFIG.CONTEXT_API}/${result.frame_id}`)
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok') {
        ZoomModal.open(result, data.neighbors);
      } else {
        ZoomModal.open(result, [result]);
      }
    })
    .catch(() => ZoomModal.open(result, [result]));
};

console.log('✅ Enhanced features loaded');
