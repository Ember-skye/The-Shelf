const STATUS_META = {
  watching: { label: "Watching" },
  watched: { label: "Watched" },
  planning: { label: "Planning" },
};
const AIRING_LABELS = { upcoming: "Upcoming", ongoing: "Ongoing", completed: "Completed", released: "Released" };
const COLLECTION_LABELS = { anime: "Anime", movies: "Movie", cartoons: "Cartoon", series: "Series" };
const SORT_OPTIONS = new Set(["title", "rating", "year"]);
const savedSortBy = localStorage.getItem("shelf-sort-by");

let state = {
  tab: "anime",
  entries: { anime: [], movies: [], cartoons: [], series: [] },
  statusFilter: "all",
  query: "",
  genreFilter: "",
  yearFilter: "",
  ratingFilter: "",
  sortBy: SORT_OPTIONS.has(savedSortBy) ? savedSortBy : "title",
  selectedGenres: [],
  editingId: null,
  removePoster: false,
};

const el = (id) => document.getElementById(id);
const posterPlaceholder = (title) => {
  const node = document.createElement("div");
  node.className = "poster-placeholder";
  node.textContent = title ? title.slice(0, 1).toUpperCase() : "Image";
  return node;
};

function initTheme() {
  const saved = localStorage.getItem("shelf-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);
}
function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("shelf-theme", next);
  updateThemeIcon(next);
}
function updateThemeIcon(theme) {
  el("iconSun").style.display = theme === "dark" ? "block" : "none";
  el("iconMoon").style.display = theme === "dark" ? "none" : "block";
}
async function fetchEntries(kind) {
  const res = await fetch("/api/entries/" + kind);
  if (!res.ok) throw new Error("Failed to load entries");
  return res.json();
}
async function loadAll() {
  setSaveState("saving");
  try {
    const [anime, movies, cartoons, series] = await Promise.all([
      fetchEntries("anime"), fetchEntries("movies"), fetchEntries("cartoons"), fetchEntries("series")
    ]);
    state.entries.anime = anime;
    state.entries.movies = movies;
    state.entries.cartoons = cartoons;
    state.entries.series = series;
    refreshFilterOptions();
    setSaveState("saved");
    render();
  } catch (_) {
    setSaveState("error");
  }
}
function setSaveState(value) {
  el("saveState").textContent = { saving: "saving...", saved: "all saved", error: "connection error" }[value] || "";
}
function entryDate(entry) {
  return Number(String(entry.releaseDate || "").slice(0, 4)) || 0;
}
function formatDate(value) {
  return value ? String(value).slice(0, 4) : "";
}
function refreshFilterOptions() {
  const collection = state.entries[state.tab];
  const genres = [...new Set(collection.flatMap((entry) => entry.genres || []))].sort((a, b) => a.localeCompare(b));
  const years = [...new Set(collection.map((entry) => formatDate(entry.releaseDate)).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
  const setOptions = (id, values, label) => {
    const select = el(id);
    const current = state[id === "genreFilter" ? "genreFilter" : id === "yearFilter" ? "yearFilter" : "ratingFilter"];
    select.innerHTML = '<option value="">All ' + label + '</option>';
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.value = current;
  };
  setOptions("genreFilter", genres, "genres");
  setOptions("yearFilter", years, "years");
}
function renderSeriesSearchResults(query) {
  const results = el("seriesSearchResults");
  results.innerHTML = "";
  const normalized = query.trim().toLowerCase();
  if (!normalized) { results.hidden = true; return; }
  const matches = state.entries[state.tab]
    .filter((entry) => entry.title.toLowerCase().includes(normalized))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 8);
  matches.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "series-result";
    button.textContent = entry.title;
    button.onclick = () => selectSeriesSource(entry);
    results.appendChild(button);
  });
  results.hidden = !matches.length;
}
function selectSeriesSource(source) {
  const groupTitle = source.seriesTitle || source.title;
  el("fieldSeriesTitle").value = groupTitle;
  el("fieldSeriesSearch").value = source.title;
  el("clearSeriesSource").hidden = false;
  el("seriesSearchResults").hidden = true;
  el("seriesSourceHint").textContent = "Grouped with " + groupTitle + ". Genres copied from " + source.title + ".";
  if (source.genres?.length) { state.selectedGenres = [...source.genres]; renderGenrePicker(); }
}
function clearSeriesSource() {
  el("fieldSeriesTitle").value = "";
  el("fieldSeriesSearch").value = "";
  el("clearSeriesSource").hidden = true;
  el("seriesSearchResults").hidden = true;
  el("seriesSourceHint").textContent = "Search and choose an existing anime to make this a new season or film. Its genres will be copied.";
}
const GENRE_CATALOG = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Drama", "Family", "Fantasy", "Game", "History", "Horror", "Isekai", "Mystery", "Psychological", "Romance", "School", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];
function renderGenrePicker(query = "") {
  const selected = new Set(state.selectedGenres.map((genre) => genre.toLowerCase()));
  el("fieldGenres").value = state.selectedGenres.join(", ");
  const chips = el("genreChips"); chips.innerHTML = "";
  state.selectedGenres.forEach((genre) => {
    const chip = document.createElement("button"); chip.type = "button"; chip.className = "genre-chip";
    chip.textContent = genre + " x"; chip.onclick = () => { state.selectedGenres = state.selectedGenres.filter((item) => item !== genre); renderGenrePicker(el("genreSearch").value); };
    chips.appendChild(chip);
  });
  const suggestions = el("genreSuggestions"); suggestions.innerHTML = "";
  const normalized = query.trim().toLowerCase();
  const options = GENRE_CATALOG.filter((genre) => !selected.has(genre.toLowerCase()) && (!normalized || genre.toLowerCase().includes(normalized))).slice(0, 8);
  options.forEach((genre) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "genre-suggestion"; button.textContent = genre;
    button.onclick = () => { state.selectedGenres.push(genre); el("genreSearch").value = ""; renderGenrePicker(); el("genreSearch").focus(); };
    suggestions.appendChild(button);
  });
  if (normalized && !selected.has(normalized) && !GENRE_CATALOG.some((genre) => genre.toLowerCase() === normalized)) {
    const custom = document.createElement("button"); custom.type = "button"; custom.className = "genre-suggestion";
    custom.textContent = 'Add "' + query.trim().slice(0, 40) + '"';
    custom.onclick = () => { state.selectedGenres.push(query.trim().slice(0, 40)); el("genreSearch").value = ""; renderGenrePicker(); el("genreSearch").focus(); };
    suggestions.appendChild(custom);
  }
}
function groupedEntries(entries) {
  // Resolve a sequel's stored source title to its root title in the active collection.
  const roots = new Map();
  state.entries[state.tab].forEach((entry) => {
    const title = entry.title.trim();
    const group = (entry.seriesTitle || title).trim();
    roots.set(title.toLowerCase(), group);
  });
  const groups = new Map();
  entries.forEach((entry) => {
    const declared = (entry.seriesTitle || entry.title).trim();
    const root = roots.get(declared.toLowerCase()) || declared;
    const key = root.toLowerCase();
    if (!groups.has(key)) groups.set(key, { label: root, items: [] });
    groups.get(key).items.push(entry);
  });
  const compareTitle = (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  const scoreForGroup = (group) => Math.max(...group.items.map((entry) => Number(entry.score) || 0));
  const yearForGroup = (group) => Math.max(...group.items.map(entryDate));

  return [...groups.values()].map((group) => {
    group.items.sort((a, b) => (Number.isFinite(a.itemOrder) ? a.itemOrder : Infinity) - (Number.isFinite(b.itemOrder) ? b.itemOrder : Infinity) || entryDate(b) - entryDate(a) || b.title.localeCompare(a.title));
    group.sortOrder = Math.min(...group.items.map((entry) => Number.isFinite(entry.sortOrder) ? entry.sortOrder : Infinity));
    return group;
  }).sort((a, b) => {
    if (state.sortBy === "rating") return scoreForGroup(b) - scoreForGroup(a) || compareTitle(a, b);
    if (state.sortBy === "year") return yearForGroup(b) - yearForGroup(a) || compareTitle(a, b);
    return compareTitle(a, b);
  });
}
function matchesSearch(entry, query) {
  const haystack = [entry.title, entry.seriesTitle, ...(entry.genres || [])].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}
function render() {
  const list = state.entries[state.tab];
  el("countAnime").textContent = state.entries.anime.length;
  el("countMovies").textContent = state.entries.movies.length;
  el("countCartoons").textContent = state.entries.cartoons.length;
  el("countSeries").textContent = state.entries.series.length;
  const counts = {
    all: list.length,
    watching: list.filter((x) => x.status === "watching").length,
    watched: list.filter((x) => x.status === "watched").length,
    planning: list.filter((x) => x.status === "planning").length,
  };
  el("cAll").textContent = counts.all;
  el("cWatching").textContent = counts.watching;
  el("cWatched").textContent = counts.watched;
  el("cPlanning").textContent = counts.planning;

  const filtered = list.filter((entry) =>
    (state.statusFilter === "all" || entry.status === state.statusFilter) &&
    matchesSearch(entry, state.query) &&
    (!state.genreFilter || (entry.genres || []).some((genre) => genre === state.genreFilter)) &&
    (!state.yearFilter || formatDate(entry.releaseDate) === state.yearFilter) &&
    (!state.ratingFilter || Number(entry.score) >= Number(state.ratingFilter))
  );
  const groups = groupedEntries(filtered);
  const grid = el("grid");
  grid.innerHTML = "";
  if (!groups.length) {
    el("emptyState").style.display = "block";
    el("emptyTitle").textContent = list.length ? "Nothing matches" : "Empty shelf";
    el("emptySub").textContent = list.length ? "Try a different title, genre, or filter." : "Add your first " + COLLECTION_LABELS[state.tab].toLowerCase() + " to start the collection.";
    return;
  }
  el("emptyState").style.display = "none";
  groups.forEach((group) => grid.appendChild(buildCard(group)));
  enableGroupDrag(grid);
}
async function saveGroupOrder(grid) {
  const groups = [...grid.querySelectorAll(".group-card")].map((card) => card.dataset.group);
  try {
    await fetch("/api/entries/" + state.tab + "/reorder-groups", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groups })
    });
    await loadAll();
  } catch (_) { setSaveState("error"); }
}
function enableGroupDrag(grid) {
  let dragged = null;
  grid.querySelectorAll(".group-card").forEach((card) => {
    card.draggable = false;
    const handle = card.querySelector(".drag-handle");
    if (!handle) return;
    handle.addEventListener("dragstart", (event) => {
      dragged = card; card.classList.add("is-dragging"); event.dataTransfer.effectAllowed = "move";
    });
    handle.addEventListener("dragend", () => { card.classList.remove("is-dragging"); dragged = null; });
    card.addEventListener("dragover", (event) => {
      if (!dragged || dragged === card) return;
      event.preventDefault();
      const box = card.getBoundingClientRect();
      grid.insertBefore(dragged, event.clientX < box.left + box.width / 2 ? card : card.nextSibling);
    });
    card.addEventListener("drop", (event) => { event.preventDefault(); saveGroupOrder(grid); });
  });
}
function appendPoster(container, entry) {
  if (entry.poster) {
    const image = document.createElement("img");
    image.src = "/" + entry.poster;
    image.alt = entry.title;
    image.onerror = () => { image.replaceWith(posterPlaceholder(entry.title)); };
    container.appendChild(image);
  } else {
    container.appendChild(posterPlaceholder(entry.title));
  }
}
function buildCard(group) {
  const entry = group.items[0];
  const card = document.createElement("article");
  card.className = "card" + (group.items.length > 1 ? " group-card" : "");
  card.dataset.group = group.label;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", "View " + group.label);
  const open = () => openDetails(group);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
  });

  if (group.items.length > 1) {
    group.items.slice(1, 4).reverse().forEach((older, index) => {
      const layer = document.createElement("div");
      layer.className = "deck-layer deck-layer-" + index;
      appendPoster(layer, older);
      card.appendChild(layer);
    });
  }
  const face = document.createElement("div");
  face.className = "card-face";
  const posterWrap = document.createElement("div");
  posterWrap.className = "poster-wrap";
  appendPoster(posterWrap, entry);
  const watchBadge = document.createElement("div");
  watchBadge.className = "badge";
  watchBadge.style.color = "var(--" + entry.status + ")";
  watchBadge.innerHTML = '<span class="dot dot-' + entry.status + '"></span>' + (STATUS_META[entry.status]?.label || "Planning");
  posterWrap.appendChild(watchBadge);
  if (entry.score !== null && entry.score !== undefined) {
    const score = document.createElement("div");
    score.className = "badge-score";
    score.textContent = "Star " + entry.score;
    posterWrap.appendChild(score);
  }
  if (group.items.length > 1) {
    const count = document.createElement("div");
    count.className = "group-count";
    count.textContent = group.items.length + " titles";
    posterWrap.appendChild(count);
  }
  face.appendChild(posterWrap);

  const body = document.createElement("div");
  body.className = "card-body";
  if (group.items.length > 1) {
    const series = document.createElement("div");
    series.className = "card-series";
    series.textContent = group.label;
    series.title = group.label;
    body.appendChild(series);
  }
  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = entry.title;
  title.title = entry.title;
  body.appendChild(title);
  const sub = document.createElement("div");
  sub.className = "card-eps card-meta-line";
  const details = [];
  if (state.tab === "anime" && (entry.episodesTotal || entry.episodesWatched)) {
    details.push("Ep " + (entry.episodesWatched ?? "?") + "/" + (entry.episodesTotal ?? "?"));
  }
  if (entry.releaseDate) details.push(formatDate(entry.releaseDate));
  sub.textContent = details.join("\u00a0\u00a0\u00a0\u00a0");
  if (details.length) body.appendChild(sub);
  face.appendChild(body);
  card.appendChild(face);
  return card;
}
function metaPill(text, className) {
  const pill = document.createElement("span");
  pill.className = "meta-pill" + (className ? " " + className : "");
  pill.textContent = text;
  return pill;
}
function detailItem(entry) {
  const item = document.createElement("article");
  item.className = "detail-item";
  item.dataset.entryId = entry.id;
  const poster = document.createElement("div");
  poster.className = "detail-poster";
  appendPoster(poster, entry);
  if (entry.poster) {
    poster.classList.add("viewable-poster");
    poster.tabIndex = 0;
    poster.setAttribute("role", "button");
    poster.setAttribute("aria-label", "View larger poster for " + entry.title);
    const view = () => openPosterViewer(entry);
    poster.addEventListener("click", view);
    poster.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); view(); }
    });
  }
  item.appendChild(poster);
  const body = document.createElement("div");
  body.className = "detail-body";
  const title = document.createElement("h3");
  title.textContent = entry.title;
  body.appendChild(title);
  const metas = document.createElement("div");
  metas.className = "detail-meta";
  if (entry.releaseDate) metas.appendChild(metaPill(formatDate(entry.releaseDate)));
  if (entry.airingStatus) metas.appendChild(metaPill(AIRING_LABELS[entry.airingStatus] || entry.airingStatus, "airing-" + entry.airingStatus));
  metas.appendChild(metaPill(STATUS_META[entry.status]?.label || "Planning"));
  if (entry.score !== null && entry.score !== undefined) metas.appendChild(metaPill("Score " + entry.score));
  if (entry.episodesTotal || entry.episodesWatched) metas.appendChild(metaPill("Episodes " + (entry.episodesWatched ?? "?") + " / " + (entry.episodesTotal ?? "?")));
  if (entry.author) metas.appendChild(metaPill(entry.author));
  body.appendChild(metas);
  if (entry.genres?.length) {
    const genres = document.createElement("div");
    genres.className = "genre-list";
    entry.genres.forEach((genre) => genres.appendChild(metaPill(genre, "genre-pill")));
    body.appendChild(genres);
  }
  const actions = document.createElement("div");
  actions.className = "detail-actions";
  const drag = document.createElement("button");
  drag.type = "button"; drag.className = "detail-drag-handle"; drag.draggable = true;
  drag.setAttribute("aria-label", "Drag to reorder " + entry.title); drag.textContent = "Drag to reorder";
  actions.appendChild(drag);
  const edit = document.createElement("button");
  edit.className = "detail-action";
  edit.textContent = "Edit";
  edit.onclick = () => { closeDetails(); openModal(entry); };
  const remove = document.createElement("button");
  remove.className = "detail-action delete-btn";
  remove.textContent = "Delete";
  remove.onclick = async () => { await deleteEntry(entry.id); closeDetails(); };
  actions.append(edit, remove);
  body.appendChild(actions);
  item.appendChild(body);
  return item;
}
function openDetails(group) {
  el("detailKicker").textContent = group.items.length > 1 ? group.items.length + " related titles" : state.tab;
  el("detailTitle").textContent = group.label;
  const content = el("detailContent");
  content.innerHTML = "";
  group.items.forEach((entry) => content.appendChild(detailItem(entry)));
  enableDetailDrag(content);
  el("detailOverlay").style.display = "flex";
}
function enableDetailDrag(content) {
  let dragged = null;
  content.querySelectorAll(".detail-item").forEach((item) => {
    const handle = item.querySelector(".detail-drag-handle");
    handle.addEventListener("dragstart", (event) => {
      dragged = item; item.classList.add("is-dragging"); event.dataTransfer.effectAllowed = "move";
    });
    handle.addEventListener("dragend", async () => {
      item.classList.remove("is-dragging");
      if (!dragged) return;
      dragged = null;
      const ids = [...content.querySelectorAll(".detail-item")].map((card) => card.dataset.entryId);
      try {
        await fetch("/api/entries/" + state.tab + "/reorder-items", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids })
        });
        await loadAll();
      } catch (_) { setSaveState("error"); }
    });
    item.addEventListener("dragover", (event) => {
      if (!dragged || dragged === item) return;
      event.preventDefault();
      const box = item.getBoundingClientRect();
      content.insertBefore(dragged, event.clientY < box.top + box.height / 2 ? item : item.nextSibling);
    });
  });
}
function openPosterViewer(entry) {
  const image = el("posterViewerImage");
  image.src = "/" + entry.poster;
  image.alt = entry.title + " poster";
  el("posterViewer").style.display = "flex";
}
function closePosterViewer() {
  el("posterViewer").style.display = "none";
  el("posterViewerImage").src = "";
}
function closeDetails() { el("detailOverlay").style.display = "none"; }

function setPreview(entry) {
  const preview = el("posterPreview");
  preview.innerHTML = "";
  if (entry?.poster) {
    const image = document.createElement("img");
    image.src = "/" + entry.poster;
    image.alt = "";
    preview.appendChild(image);
  } else preview.textContent = "Image";
}
function openModal(entry) {
  state.editingId = entry ? entry.id : null;
  state.removePoster = false;
  const anime = state.tab === "anime";
  const collectionLabel = COLLECTION_LABELS[state.tab].toLowerCase();
  el("modalTitle").textContent = entry ? "Edit entry" : "Add " + collectionLabel;
  el("submitBtn").textContent = entry ? "Save changes" : "Add to shelf";
  el("entryId").value = entry?.id || "";
  el("fieldTitle").value = entry?.title || "";
  el("fieldStatus").value = entry?.status || "planning";
  el("fieldScore").value = entry?.score ?? "";
  el("fieldPoster").value = "";
  el("removePosterBtn").style.display = entry?.poster ? "block" : "none";
  setPreview(entry);
  el("seriesLabel").textContent = "Add to an existing " + collectionLabel + " (optional)";
  el("fieldSeriesSearch").placeholder = "Search a " + collectionLabel + " title to group with it";
  el("episodeFields").style.display = anime ? "flex" : "none";
  el("fieldEpWatched").value = entry?.episodesWatched ?? "";
  el("fieldEpTotal").value = entry?.episodesTotal ?? "";
  clearSeriesSource();
  if (entry?.seriesTitle) {
    el("fieldSeriesTitle").value = entry.seriesTitle;
    el("fieldSeriesSearch").value = entry.seriesTitle;
    el("clearSeriesSource").hidden = false;
    el("seriesSourceHint").textContent = "Grouped with " + entry.seriesTitle + ".";
  }
  el("fieldReleaseDate").value = formatDate(entry?.releaseDate);
  const states = anime ? [["upcoming","Upcoming"],["ongoing","Ongoing"],["completed","Completed"]] : [["upcoming","Upcoming"],["released","Released"]];
  el("fieldAiringStatus").innerHTML = states.map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join("");
  el("fieldAiringStatus").value = entry?.airingStatus || (anime ? "completed" : "released");
  el("fieldAuthor").value = entry?.author || "";
  state.selectedGenres = [...(entry?.genres || [])];
  el("genreSearch").value = "";
  renderGenrePicker();
  el("modalOverlay").style.display = "flex";
  el("fieldTitle").focus();
}
function closeModal() { el("modalOverlay").style.display = "none"; }

el("fieldPoster").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  state.removePoster = false;
  el("removePosterBtn").style.display = "block";
  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    el("posterPreview").innerHTML = "";
    const image = document.createElement("img");
    image.src = loadEvent.target.result;
    image.alt = "";
    el("posterPreview").appendChild(image);
  };
  reader.readAsDataURL(file);
});
el("removePosterBtn").addEventListener("click", () => {
  state.removePoster = true;
  el("fieldPoster").value = "";
  setPreview(null);
  el("removePosterBtn").style.display = "none";
});
el("entryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData();
  data.append("title", el("fieldTitle").value.trim());
  data.append("status", el("fieldStatus").value);
  data.append("score", el("fieldScore").value);
  data.append("seriesTitle", el("fieldSeriesTitle").value.trim());
  data.append("releaseDate", el("fieldReleaseDate").value);
  data.append("airingStatus", el("fieldAiringStatus").value);
  data.append("genres", el("fieldGenres").value);
  data.append("author", el("fieldAuthor").value.trim());
  if (state.tab === "anime") {
    data.append("episodesWatched", el("fieldEpWatched").value);
    data.append("episodesTotal", el("fieldEpTotal").value);
  }
  const file = el("fieldPoster").files[0];
  if (file) data.append("poster", file);
  if (state.removePoster) data.append("remove_poster", "1");
  setSaveState("saving");
  try {
    const id = state.editingId;
    const response = await fetch(id ? "/api/entries/" + state.tab + "/" + id : "/api/entries/" + state.tab, { method: id ? "PUT" : "POST", body: data });
    if (!response.ok) throw new Error("save failed");
    closeModal();
    await loadAll();
  } catch (_) { setSaveState("error"); }
});
async function deleteEntry(id) {
  setSaveState("saving");
  try {
    const response = await fetch("/api/entries/" + state.tab + "/" + id, { method: "DELETE" });
    if (!response.ok) throw new Error("delete failed");
    await loadAll();
  } catch (_) { setSaveState("error"); }
}
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((tab) => { tab.classList.remove("active"); tab.setAttribute("aria-selected", "false"); });
  button.classList.add("active");
  button.setAttribute("aria-selected", "true");
  state.tab = button.dataset.tab;
  state.statusFilter = "all";
  state.genreFilter = "";
  state.yearFilter = "";
  state.ratingFilter = "";
  el("genreFilter").value = "";
  el("yearFilter").value = "";
  el("ratingFilter").value = "";
  document.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("active", chip.dataset.status === "all"));
  el("addBtnLabel").textContent = "Add " + COLLECTION_LABELS[state.tab].toLowerCase();
  refreshFilterOptions();
  render();
}));
document.querySelectorAll(".chip").forEach((chip) => chip.addEventListener("click", () => {
  document.querySelectorAll(".chip").forEach((item) => item.classList.remove("active"));
  chip.classList.add("active");
  state.statusFilter = chip.dataset.status;
  render();
}));
el("searchInput").addEventListener("input", (event) => { state.query = event.target.value; render(); });
el("genreFilter").addEventListener("change", (event) => { state.genreFilter = event.target.value; render(); });
el("yearFilter").addEventListener("change", (event) => { state.yearFilter = event.target.value; render(); });
el("ratingFilter").addEventListener("change", (event) => { state.ratingFilter = event.target.value; render(); });
el("sortBy").addEventListener("change", (event) => { state.sortBy = event.target.value; localStorage.setItem("shelf-sort-by", state.sortBy); render(); });
el("genreSearch").addEventListener("input", (event) => renderGenrePicker(event.target.value));
el("genreSearch").addEventListener("keydown", (event) => {
  const genre = event.target.value.trim().slice(0, 40);
  if (event.key === "Enter" && genre && !state.selectedGenres.some((item) => item.toLowerCase() === genre.toLowerCase())) {
    event.preventDefault(); state.selectedGenres.push(genre); event.target.value = ""; renderGenrePicker(); 
  }
});
el("fieldSeriesSearch").addEventListener("input", (event) => {
  el("fieldSeriesTitle").value = "";
  el("clearSeriesSource").hidden = true;
  renderSeriesSearchResults(event.target.value);
});
el("clearSeriesSource").addEventListener("click", clearSeriesSource);
el("addBtn").addEventListener("click", () => openModal(null));
el("closeModal").addEventListener("click", closeModal);
el("closeDetail").addEventListener("click", closeDetails);
el("closePosterViewer").addEventListener("click", closePosterViewer);
el("sortBy").value = state.sortBy;
el("posterViewer").addEventListener("click", (event) => { if (event.target === el("posterViewer")) closePosterViewer(); });
el("modalOverlay").addEventListener("click", (event) => { if (event.target === el("modalOverlay")) closeModal(); });
el("detailOverlay").addEventListener("click", (event) => { if (event.target === el("detailOverlay")) closeDetails(); });
el("themeToggle").addEventListener("click", toggleTheme);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeModal(); closeDetails(); closePosterViewer(); } });
initTheme();
loadAll();
