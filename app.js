const API_SOURCES = {
    arbeitnow:"https://www.arbeitnow.com/api/job-board-api",
    remotive:"https://remotive.com/api/remote-jobs?limit=100"
};

const CACHE_KEY = "careerconnect-api-cache-v2";
const CACHE_TTL = 30 * 60 * 1000;
const SAVED_KEY = "careerconnect-saved-v2";
const LEGACY_SAVED_KEY = "careerconnect-saved-v1";
const PAGE_SIZE = 20;
const MAX_DESCRIPTION = 4000;

const state = {
    jobs: [],
    saved: readStorage(SAVED_KEY, {}),
    tab: "all",
    selectedJob: null,
    providerWarnings: [],
    updatedAt: null,
    visible: PAGE_SIZE,
};

const el = id => document.getElementById(id);

function readStorage(key, fallback) {
    try {
        const value =JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch {
        return fallback;
    }
}

function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
    }
    

    function isSaved(id) { return Object.prototype.hasOwnProperty.call(state.saved, id); }
    function migrateLegacySaved() {
        const legacy = readStorage(LEGACY_SAVED_KEY, null);
        if (!Array.isArray(legacy)) return;
        legacy.forEach(id => {
            const job = state.jobs.find(item => item.id === id);
            if (job) state.saved[id] = job;
        });
        writeStorage(SAVED_KEY, state.saved);
        try { localStorage.removeItem(LEGACY_SAVED_KEY); } catch { }
            
        }
        function htmlToText(html) {
            const withBreaks = String(html || "")
               .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol)>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  return (doc.body.textContent || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
        }
        function toIsoDate(value) {
            if (value === null || value === undefined || value === "") return null;
            const number = Number(value);
            const date = Number.isFinite(number) && String(value).trim() !== ""
            ?new Date(number < 1e12 ? number * 1000 : number)
            : new Date(value);
            return Number.isNaN(date.getTime()) ? null : date.toISOString();
        }
        function typeKey(value) {
            return String(value || "").toLowerCase().replace(/[\s_]+/g, "-");
        }
        function prettyType(value) {
            const text = String(value || "").replace(/[_-]+/g, " ").trim();
            return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Not specified";
        }

        function buildJob(fields) {
            const description = htmlToText(fields.description).slice(0, MAX_DESCRIPTION);
            return { ...fields, description, typeKey: typeKey(fields.rawType) };
        }

        function normalizeArbeitnow(job) {
            const types = Array.isArray(job.job_types) ? job.job_types.join(", ") : "";
            return buildJob({
             id: `arbeitnow-${job.slug || job.url}`,
             title: job.title || "Untitled position",
             company: job.company_name || "Company not specified",
             location: job.location || "Location not specified",
             type: prettyType(types),
             rawType: types,
             description: job.description,
             url: job.url || "",
             tags: Array.isArray(job.tags) ? job.tags : [],
             remote: Boolean(job.remote),
             source: "Arbeitnow",
             postedAt: toIsoDate(job.created_at)
            });
        }   

       function normalizeRemotive(job) {
        return buildJob({
        id: `remotive-${job.id}`,
        title: job.title || "Untitled position",
        company: job.company_name || "Company not specified",
        location: job.candidate_required_location || "Remote",
        type: prettyType(job.job_type),
        rawType: job.job_type,
        description: job.description,
        url: job.url || "",
        tags: Array.isArray(job.tags) ? job.tags : [],
        remote: true,
        source: "Remotive",
        postedAt: toIsoDate(job.publication_date)
     });
  } 

  async function fetchProvider(name, url, normalize, collectionKey) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data[collectionKey])) throw new Error(`${name} returned an unexpected response`);
    return data[collectionKey].map(normalize).filter(job => job.url);
  }

  async function loadJobs(force = false) {
    const loading = el("loadingState");
    const error = el("errorState");
    el("emptyState").classList.add("hidden");
    error.classList.add("hidden");
    loading.classList.remove("hidden");
    el("jobList").innerHTML = "";
    el("loadMore").classList.add("hidden");

    const cached = readStorage(CACHE_KEY, null);
    if (!force && cached && Array.isArray(cached.jobs) && Date.now() - cached.timestamp < CACHE_TTL) {
        state.jobs = cached.jobs;
        state.providerWarnings = cached.warnings || [];
        state.updatedAt = cached.timestamp;
        migrateLegacySaved();
        loading.classList.add("hidden");
        render();
        showWarnings();
        return;
    }

    const providers = await Promise.allSettled([
        fetchProvider("Arbeitnow", API_SOURCES.arbeitnow, normalizeArbeitnow, "data"),
        fetchProvider("Remotive", API_SOURCES.remotive, normalizeRemotive, "jobs")
    ]);

    const jobs = [];
    const warnings = [];
    if (providers[0].status === "fulfilled") jobs.push(...providers[0].value);
    else warnings.push("Arbeitnow could not be reached.");
    if (providers[1].status === "fulfilled") jobs.push(...providers[1].value);
    else warnings.push("Remotive could not be reached.");

    const unique = [...new Map(jobs.map(job => [job.id, job])).values()];
    unique.sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0));

    if (!unique.length) {
        loading.classList.add("hidden");
        error.classList.remove("hidden");
        el("errorMessage").textContent = warnings.length
        ? `${warnings.join(" ")} check your internet connection or try again later.`
        : "The providers returned no listings. Try agin inn a few minutes.";
        el("resultCount").textContent = "Listings unavailable";
        el("statLine").textContent = "Listings unavailable right now.";
        el("providerNotice").classList.add("hidden");
        return;
    }

    state.jobs = unique;
    state.providerWarnings = warnings;
    state.updatedAt = Date.now();
    writeStorage(CACHE_KEY, { timestamp: state.updatedAt, jobs: unique, warnings });
    migrateLegacySaved();
    loading.classList.add("hidden");
    render();
    showWarnings();
  }

  function showWarnings() {
    const notice = el("providerNotice");
    if (state.providerWarnings.length) {
        notice.textContent = `Results may be incomplete.
        ${state.providerWarnings.join(" ")}`;
        notice.classList.remove("hidden");
    } else {
        notice.classList.add("hidden");
    }
  }

  function currentJobs() {
    const keyword = el("keyword").value.trim().toLowerCase();
    const location = el("location").value.trim().toLowerCase();
    const type = el("typeFilter").value;
    const remote = el("remoteFilter").checked;
    const sort = el("sortFilter").value;

    const source = state.tab === "saved" ? Object.values(state.saved) : state.jobs;

    let jobs = source.filter(job => {
        const searchable = [job.title, job.company, job.location, job.description, ...(job.tags || [])].join(" ").toLowerCase();

        const locationMatch = !location
         || job.location.toLowerCase().includes(location)
         || (location === "remote" && job.remote);
         return (!keyword || searchable.includes(keyword))
         && locationMatch
         && (!type || (job.typeKey || "").includes(type))
         && (!remote || job.remote);
    });

    if (state.tab === "remote") jobs = jobs.filter(job => job.remote);

    if (sort === "company") jobs.sort((a, b) => a.company.localeCompare(b.company));
     else if (sort === "oldest") jobs.sort((a, b) => new Date(a.postedAt || 0) - new Date(b.postedAt || 0));
     else jobs.sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0));

     return jobs;
  }

  function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function relativeDate(value) {
    if (!value) return "Date not provided";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date not provided";
    const days = Math.floor((Date.now() -date.getTime()) / 86400000);
    if (days <= 0) return "Today";
    if(days === 1) return "Yesterday";
    if (days < 30) return `${days} days ago`;
    return date.toLocaleDateString();
}

function relativeMinutes(timestamp) {
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
    if (minutes < 1) return "just now";
    if (minutes === 1) return "1 minute ago";
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

function renderStatLine() {
   if (!state.jobs.length) return;
   const sources = new Set(state.jobs.map(job => job.source)).size;
   const remoteCount = state.jobs.filter(job => job.remote).length;
   el("statLine").textContent =
   `${state.jobs.length.toLocaleString()} jobs loaded,
   ${remoteCount.toLocaleString()} remote, from ${sources} source${sources === 1 ? "" 
    : "s"}. Updated ${relativeMinutes(state.updatedAt)}.`;
}

function render() {
    const jobs = currentJobs();
    const shown = jobs.slice(0, state.visible);

     el("savedCount").textContent = Object.keys(state.saved).length;
     el("resultCount").textContent = jobs.length > shown.length
      ? `Showing ${shown.length} of ${jobs.length} jobs`
      : `${jobs.length} job${jobs.length === 1 ? "" : "s"} found`;
     el("loadingState").classList.add("hidden");
     el("errorState").classList.add("hidden");
     el("loadMore").classList.toggle("hidden", jobs.length <= shown.length);

     const empty = jobs.length === 0;
     el("emptyState").classList.toggle("hidden", !empty);
     if (empty) {
        const savedTab = state.tab === "saved" && !Object.keys(state.saved).length;
        el("emptyTitle").textContent = savedTab ? "You haven't saved any jobs yet" :
        "No jobs match these filters";
        el("emptyText").textContent = savedTab
        ? "Select the star on a job to keep it here."
        : "try a different keyword, or clear the filters to see everything.";
     }

     el("jobList").innerHTML = shown.map(job => {
        const initial = escapeHtml((job.company ||
        "C").trim().charAt(0).toUpperCase());
        const tags = (job.tags || []).slice(0, 5).map(tag => `<span
            class="tag">${escapeHtml(tag)}</span>`).join("");
            const saved = isSaved(job.id);
            return `<li class="job-row">
              <div class="company-icon" aria-hidden="true">${initial}</div>
              <div class="job-main">
              <h3 class="job-title">${escapeHtml(job.title)}</h3>
              <p class="company-name">${escapeHtml(job.company)}</p>
              <ul class="job-meta">
              <li>${escapeHtml(job.location)}</li>
              <li>${escapeHtml(job.type)}</li>
              <li>${escapeHtml(relativeDate(job.postedAt))}</li>
              ${job.remote ? '<li class="remote-flag">Remote</li>' : ""}
              </ul>
              <div class="tag-list">${tags}<span class="source-badge">${escapeHtml(job.source)}</span></div>
              </div>
              <div class="job-actions">
              <button class="save-btn ${saved ? "saved" : ""}" data-save="${escapeHtml(job.id)}" type="button" aria-pressed="${saved}" aria-label="${saved ? "Remove from saved jobs" : "Save job"}: ${escapeHtml(job.title)}" title="${saved ? "Remove from saved" : "Save job"}">${saved ? "★" : "☆"}</button>
              <div class="job-links">
              <button class="view-detail" data-detail="${escapeHtml(job.id)}" type="button">View details</button>
              <a class="apply-link" href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">Apply on source</a>
            </div>
          </div>
        </li>`;
     }).join("");
     renderStatLine();
}

function resetAndRender() {
    state.visible = PAGE_SIZE;
    render();
}

function toggleSaved(id) {
    if (isSaved(id)) {
        delete state.saved[id];
    } else {
        const job = state.jobs.find(item => item.id === id) || state.selectedJob;
        if (job && job.id === id) state.saved[id] = job;
    }
    writeStorage(SAVED_KEY, state.saved);
    render();
    if (state.selectedJob?.id === id) updateDialogSaveButton();
}

function openDetails(id) {
    const job = state.jobs.find(item => item.id === id) || state.saved[id];
    if (!job) return;
    state.selectedJob = job;
    el("dialogSource").textContent = job.source;
    el("dialogTitle").textContent = job.title;
    el("dialogCompany").textContent = `${job.company}, ${job.location}`;
    el("dialogMeta").textContent = `${job.type}. Posted
    ${relativeDate(job.postedAt).toLowerCase()}.${job.remote ? " Remote." : ""}`;
    el("dialogDescription").textContent = job.description
    || "Open the original listing to read the full description.";
    el("dialogTags").innerHTML = (job.tags || []).map(tag => `<span
        class="tag">${escapeHtml(tag)}</span>`).join("");
        el("dialogApply").href = job.url;
        updateDialogSaveButton();
        el("jobDialog").showModal();
}

function updateDialogSaveButton() {
    el("dialogSave").textContent = state.selectedJob && isSaved(state.selectedJob.id)
    ? "★ Saved. Remove" : "☆ Save job";
}

function clearFilters(){
   el("keyword").value = "";
   el("location").value = "";
   el("typeFilter").value = "";
   el("remoteFilter").checked = false;
   el("sortFilter").value = "newest";
   state.tab = "all";
   updateTabs();
   resetAndRender();
}

function updateTabs() {
  document.querySelectorAll(".tab").forEach(button => {
    const active = button.dataset.tab === state.tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });  
}

function setTab(tab) {
    state.tab = tab;
    updateTabs();
    resetAndRender();
}

function debounce(fn, wait = 180) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

function bindEvents() {
    const debounced = debounce(resetAndRender);
    ["keyword", "location"].forEach(id => el(id).addEventListener("input", debounced));
    ["typeFilter", "remoteFilter", "sortFilter"].forEach(id =>
      el(id).addEventListener("change", resetAndRender));

      el("searchForm").addEventListener("submit", event => {
       event.preventDefault();
       resetAndRender();
      el("jobs").scrollIntoView({ behavior: "smooth" });
  });

  el("clearFilters").addEventListener("click", clearFilters);
  el("emptyClear").addEventListener("click", clearFilters);
  el("refreshBtn").addEventListener("click", () => loadJobs(true));
  el("retryBtn").addEventListener("click", () => loadJobs(true));
  el("loadMore").addEventListener("click", () => { state.visible += PAGE_SIZE;
    render();
  });
  el("savedNav").addEventListener("click", () => {
    setTab("saved");
    el("jobs").scrollIntoView({ behavior: "smooth" });
  });
  document.querySelectorAll(".tab").forEach(button =>
    button.addEventListener("click", () => setTab(button.dataset.tab)));
 el("jobList").addEventListener("click", event => {
    const saveButton = event.target.closest("[data-save]");
    const datailButton = event.target.closest("[data-detail]");
    if (saveButton) toggleSaved(saveButton.dataset.save);
    if (datailButton) openDetails(datailButton.dataset.detail);
 });
  const dialog = el("jobDialog");
  el("dialogSave").addEventListener("click", () => {
    if (state.selectedJob) toggleSaved(state.selectedJob.id);
  });
  el("closeDialog").addEventListener("click", () => dialog.close());
  // Clicking the dimmed area outside the dialog closes it.
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });

  el("year").textContent = new Date().getFullYear();
  
}

bindEvents();
loadJobs();
