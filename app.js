(() => {
  const CATEGORIES = ["家常菜", "快手菜", "汤羹", "烘焙甜点", "凉菜小吃", "主食面点", "饮品"];
  const LISTS = [
    { value: "全部", label: "全部" },
    { value: "popular", label: "本周最受欢迎" },
    { value: "rising", label: "新秀菜谱" },
  ];
  const LIST_LABEL = {
    popular: "本周最受欢迎",
    rising: "新秀菜谱",
  };
  const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

  const els = {
    q: document.querySelector("#q"),
    clear: document.querySelector("#clear"),
    tools: document.querySelector("#tools"),
    categories: document.querySelector("#categories"),
    lists: document.querySelector("#lists"),
    status: document.querySelector("#status"),
    days: document.querySelector("#days"),
    empty: document.querySelector("#empty"),
    emptyText: document.querySelector("#empty-text"),
    reset: document.querySelector("#reset"),
    toTop: document.querySelector("#to-top"),
    toast: document.querySelector("#toast"),
    detail: document.querySelector("#detail"),
    backdrop: document.querySelector("#detail-backdrop"),
    panel: document.querySelector(".detail-panel"),
    close: document.querySelector("#detail-close"),
    photo: document.querySelector("#detail-photo"),
    body: document.querySelector("#detail-body"),
    link: document.querySelector("#detail-link"),
    copy: document.querySelector("#detail-copy"),
    copySteps: document.querySelector("#detail-copy-steps"),
  };

  const state = {
    days: [],
    byKey: new Map(),
    category: "全部",
    list: "全部",
    query: "",
    expected: 0,
    finished: 0,
    errors: 0,
    openKey: "",
    lastFocus: null,
    toastTimer: 0,
    knownCategories: new Set(CATEGORIES),
  };

  function norm(value) {
    return String(value || "").toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
  }

  function safeLocal(path) {
    if (typeof path !== "string") return "";
    const trimmed = path.trim();
    if (!trimmed || trimmed.startsWith("/") || trimmed.includes("..") || trimmed.includes("\\") || trimmed.includes("://")) {
      return "";
    }
    return trimmed.split("/").map((part) => encodeURIComponent(part)).join("/");
  }

  function safeRemote(url) {
    if (typeof url !== "string" || !url.trim()) return "";
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "https:") return "";
      return parsed.href;
    } catch {
      return "";
    }
  }

  function formatDay(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!match) return iso || "未标日期";
    return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
  }

  function formatDayShort(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!match) return iso || "未标日期";
    return `${Number(match[2])}月${Number(match[3])}日`;
  }

  function weekday(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!match) return "";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return WEEKDAYS[date.getUTCDay()] || "";
  }

  function shanghaiToday() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch {
      return "";
    }
  }

  function formatScore(score) {
    const n = Number(score);
    if (!Number.isFinite(n) || n <= 0) return "";
    return String(Math.round(n * 10) / 10);
  }

  function formatMade(made) {
    const n = Number(made);
    if (!Number.isFinite(n) || n <= 0) return "";
    return `${Math.round(n).toLocaleString("zh-CN")} 人做过`;
  }

  function topicNote(entry) {
    const lines = [entry.name];
    entry.ingredients.forEach((item) => {
      if (item.name && item.amount) lines.push(`${item.name} ${item.amount}`);
      else lines.push(item.name || item.amount);
    });
    return lines.join("\n");
  }

  function stepsNote(entry) {
    const lines = [entry.name];
    entry.steps.forEach((step) => {
      lines.push(step.text ? `${step.n}. ${step.text}` : `${step.n}.`);
    });
    return lines.join("\n");
  }

  function listBadges(entry) {
    return entry.lists.map((key) => {
      const label = LIST_LABEL[key] || key;
      const rank = entry.rank[key];
      const text = Number.isFinite(rank) ? `${label} · ${rank}` : label;
      const kind = key === "popular" || key === "rising" ? key : "other";
      return { kind, text };
    });
  }

  const STEP_CDN_QUERY = "imageView2/2/w/640/interlace/1/q/80";

  function stepCdnUrl(url) {
    const remote = safeRemote(url);
    if (!remote || remote.includes("imageView2/")) return remote;
    return `${remote}${remote.includes("?") ? "&" : "?"}${STEP_CDN_QUERY}`;
  }

  function normalizeSteps(raw) {
    return (Array.isArray(raw) ? raw : []).map((step, index) => {
      if (!step || typeof step !== "object") return null;
      const text = typeof step.text === "string" ? step.text.trim() : "";
      const n = Number(step.n);
      const image = step.image && typeof step.image === "object" ? step.image : null;
      const imageLocal = image && typeof image.local === "string" ? image.local.trim() : "";
      const imageSource = image && typeof image.source === "string" ? image.source.trim() : "";
      if (!text && !imageLocal && !imageSource) return null;
      return {
        n: Number.isFinite(n) && n > 0 ? Math.round(n) : index + 1,
        text,
        imageLocal,
        imageSource,
      };
    }).filter(Boolean);
  }

  function normalizeEntry(raw, date, index) {
    if (!raw || typeof raw !== "object") return null;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) return null;
    const id = raw.id == null ? "" : String(raw.id).trim();
    const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : []).map((item) => {
      if (!item || typeof item !== "object") return null;
      const itemName = typeof item.name === "string" ? item.name.trim() : "";
      const amount = typeof item.amount === "string" ? item.amount.trim() : "";
      if (!itemName && !amount) return null;
      return { name: itemName, amount };
    }).filter(Boolean);
    const lists = (Array.isArray(raw.lists) ? raw.lists : []).map((item) => String(item).trim()).filter(Boolean);
    const rank = {};
    if (raw.rank && typeof raw.rank === "object") {
      lists.forEach((key) => {
        const n = Number(raw.rank[key]);
        if (Number.isFinite(n)) rank[key] = n;
      });
    }
    const image = raw.image && typeof raw.image === "object" ? raw.image : {};
    return {
      key: `${date}:${id || "item"}:${index}`,
      id,
      date,
      name,
      url: typeof raw.url === "string" ? raw.url.trim() : "",
      author: typeof raw.author === "string" ? raw.author.trim() : "",
      score: raw.score,
      made: raw.made,
      desc: typeof raw.desc === "string" ? raw.desc.trim() : "",
      ingredients,
      steps: normalizeSteps(raw.steps),
      stepCount: Number(raw.stepCount) > 0 ? Math.round(Number(raw.stepCount)) : 0,
      lists,
      rank,
      category: typeof raw.category === "string" ? raw.category.trim() : "",
      imageLocal: typeof image.local === "string" ? image.local.trim() : "",
      imageSource: typeof image.source === "string" ? image.source.trim() : "",
    };
  }

  function normalizeDay(raw, item) {
    const fromFile = raw && typeof raw.date === "string" ? raw.date.trim() : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(fromFile) ? fromFile : item.date;
    const entries = (raw && Array.isArray(raw.entries) ? raw.entries : []).map((entry, index) => {
      return normalizeEntry(entry, date, index);
    }).filter(Boolean);
    return { date, entries, error: false };
  }

  function normalizeDates(index) {
    const list = index && Array.isArray(index.dates) ? index.dates : [];
    return list.map((item, order) => {
      if (!item || typeof item !== "object") return null;
      const date = typeof item.date === "string" ? item.date.trim() : "";
      const file = typeof item.file === "string" ? item.file.trim() : "";
      if (!file) return null;
      return { date, file, order };
    }).filter(Boolean).sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.order - b.order;
    });
  }

  async function fetchJson(path) {
    const safe = safeLocal(path);
    if (!safe) throw new Error("bad path");
    const response = await fetch(safe, { cache: "no-cache" });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  function allEntries() {
    return state.days.flatMap((day) => day.entries);
  }

  function matchQuery(entry) {
    const tokens = norm(state.query).split(" ").filter(Boolean);
    if (!tokens.length) return true;
    const hay = norm([
      entry.name,
      entry.author,
      ...entry.ingredients.flatMap((item) => [item.name, item.amount]),
    ].join(" "));
    return tokens.every((token) => hay.includes(token));
  }

  function matchCategory(entry, category) {
    return category === "全部" || entry.category === category;
  }

  function matchList(entry, list) {
    return list === "全部" || entry.lists.includes(list);
  }

  function matches(entry) {
    return matchQuery(entry) && matchCategory(entry, state.category) && matchList(entry, state.list);
  }

  function filtered() {
    return Boolean(norm(state.query)) || state.category !== "全部" || state.list !== "全部";
  }

  function countWhere(pred) {
    let count = 0;
    allEntries().forEach((entry) => {
      if (pred(entry)) count += 1;
    });
    return count;
  }

  function makeChip(value, label, group) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.value = value;
    button.setAttribute("aria-pressed", state[group] === value ? "true" : "false");
    button.append(document.createTextNode(label));
    const count = document.createElement("span");
    count.className = "n";
    button.append(count);
    button.addEventListener("click", () => {
      state[group] = value;
      const root = group === "category" ? els.categories : els.lists;
      root.querySelectorAll(".chip").forEach((chip) => {
        chip.setAttribute("aria-pressed", chip.dataset.value === value ? "true" : "false");
      });
      applyFilters();
      button.focus();
    });
    return button;
  }

  function renderChips() {
    els.categories.replaceChildren();
    els.lists.replaceChildren();
    els.categories.append(makeChip("全部", "全部", "category"));
    CATEGORIES.forEach((name) => els.categories.append(makeChip(name, name, "category")));
    LISTS.forEach((item) => els.lists.append(makeChip(item.value, item.label, "list")));
  }

  function ensureCategoryChips() {
    allEntries().forEach((entry) => {
      if (!entry.category || state.knownCategories.has(entry.category)) return;
      state.knownCategories.add(entry.category);
      els.categories.append(makeChip(entry.category, entry.category, "category"));
    });
  }

  function updateChipCounts() {
    els.categories.querySelectorAll(".chip").forEach((chip) => {
      const value = chip.dataset.value;
      const count = countWhere((entry) => {
        return matchQuery(entry) && matchList(entry, state.list) && matchCategory(entry, value);
      });
      chip.querySelector(".n").textContent = String(count);
    });
    els.lists.querySelectorAll(".chip").forEach((chip) => {
      const value = chip.dataset.value;
      const count = countWhere((entry) => {
        return matchQuery(entry) && matchCategory(entry, state.category) && matchList(entry, value);
      });
      chip.querySelector(".n").textContent = String(count);
    });
  }

  function badgeSpan(text, kind) {
    const span = document.createElement("span");
    span.className = kind ? `badge badge-${kind}` : "badge";
    span.textContent = text;
    return span;
  }

  function fillPhoto(frame, entry, eager) {
    const local = safeLocal(entry.imageLocal);
    const remote = safeRemote(entry.imageSource);
    const src = local || remote;
    if (!src) {
      const note = document.createElement("span");
      note.className = "photo-fallback";
      note.textContent = "没有成品图";
      frame.append(note);
      return;
    }
    const img = document.createElement("img");
    img.alt = eager ? entry.name : "";
    img.decoding = "async";
    img.loading = eager ? "eager" : "lazy";
    if (eager) img.setAttribute("fetchpriority", "high");
    if (local && remote) img.dataset.fallback = remote;
    img.addEventListener("error", () => {
      const next = img.dataset.fallback;
      if (next) {
        img.dataset.fallback = "";
        img.src = next;
        return;
      }
      img.remove();
      const note = document.createElement("span");
      note.className = "photo-fallback";
      note.textContent = "图片暂时打不开";
      frame.append(note);
    });
    img.src = src;
    frame.append(img);
  }

  function appendBadges(parent, entry) {
    const badges = document.createElement("span");
    badges.className = "badges";
    if (entry.category) badges.append(badgeSpan(entry.category, ""));
    listBadges(entry).forEach((badge) => badges.append(badgeSpan(badge.text, badge.kind)));
    if (badges.childNodes.length) parent.append(badges);
  }

  function metaLine(entry) {
    const line = document.createElement("p");
    line.className = "card-by";
    if (entry.author) {
      const author = document.createElement("span");
      author.className = "author";
      author.textContent = entry.author;
      line.append(author);
    }
    const score = formatScore(entry.score);
    if (score) {
      const node = document.createElement("span");
      node.className = "score";
      node.textContent = `${score} 分`;
      line.append(node);
    }
    const made = formatMade(entry.made);
    if (made) {
      const node = document.createElement("span");
      node.textContent = made;
      line.append(node);
    }
    return line.childNodes.length ? line : null;
  }

  function ingredientChips(entry) {
    if (!entry.ingredients.length) return null;
    const wrap = document.createElement("span");
    wrap.className = "ing-chips";
    const shown = entry.ingredients.slice(0, 6);
    shown.forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "ing-chip";
      chip.textContent = item.name || item.amount;
      wrap.append(chip);
    });
    const extra = entry.ingredients.length - shown.length;
    if (extra > 0) {
      const chip = document.createElement("span");
      chip.className = "ing-chip";
      chip.textContent = `+${extra}`;
      wrap.append(chip);
    }
    return wrap;
  }

  function renderCard(entry, eager) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.key = entry.key;

    const open = document.createElement("button");
    open.type = "button";
    open.className = "card-main";
    open.setAttribute("aria-label", `查看${entry.name}`);

    const photo = document.createElement("span");
    photo.className = "photo";
    fillPhoto(photo, entry, eager);
    appendBadges(photo, entry);
    open.append(photo);

    const body = document.createElement("span");
    body.className = "card-body";
    const title = document.createElement("h3");
    title.className = "card-name";
    title.textContent = entry.name;
    body.append(title);
    const meta = metaLine(entry);
    if (meta) body.append(meta);
    const chips = ingredientChips(entry);
    if (chips) body.append(chips);
    open.append(body);
    open.addEventListener("click", () => openDetail(entry, open));

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "card-copy";
    copy.textContent = "复制菜名+用料";
    copy.setAttribute("aria-label", `复制${entry.name}的菜名和用料`);
    copy.addEventListener("click", () => copyEntry(entry, copy));

    card.append(open, copy);
    return card;
  }

  function renderDay(day) {
    const section = document.createElement("section");
    section.className = "day";
    section.dataset.date = day.date;

    const head = document.createElement("div");
    head.className = "day-head";
    const title = document.createElement("h2");
    const kicker = document.createElement("span");
    kicker.className = "kicker";
    kicker.hidden = true;
    title.append(kicker, document.createTextNode(formatDayShort(day.date)));
    const week = weekday(day.date);
    if (week) {
      const span = document.createElement("span");
      span.className = "weekday";
      span.textContent = week;
      title.append(span);
    }
    const count = document.createElement("p");
    count.className = "day-count";
    count.textContent = `${day.entries.length} 道`;
    head.append(title, count);
    section.append(head);

    if (!day.entries.length) {
      const note = document.createElement("p");
      note.className = "day-note";
      note.textContent = "这一天没有收录菜谱。";
      section.append(note);
    } else {
      const grid = document.createElement("div");
      grid.className = "grid";
      day.entries.forEach((entry) => grid.append(renderCard(entry, false)));
      section.append(grid);
    }

    const existing = [...els.days.querySelectorAll(":scope > .day")];
    const next = existing.find((node) => node.dataset.date < day.date);
    if (next) els.days.insertBefore(section, next);
    else els.days.append(section);
  }

  function newestDate() {
    return state.days.map((day) => day.date).filter(Boolean).sort().pop() || "";
  }

  function updateKickers() {
    const latest = newestDate();
    const today = shanghaiToday();
    els.days.querySelectorAll(":scope > .day").forEach((section) => {
      const kicker = section.querySelector(".kicker");
      if (!kicker) return;
      const show = !section.hidden && section.dataset.date === latest;
      kicker.hidden = !show;
      if (show) kicker.textContent = latest === today ? "今天" : "最新";
    });
  }

  function setStatus(shown) {
    const pending = state.finished < state.expected;
    const latest = newestDate();
    if (!state.days.length && pending) {
      els.status.textContent = "正在加载今天的菜谱…";
      return;
    }
    if (!state.days.length && state.errors) {
      els.status.textContent = "菜谱没有加载出来。";
      return;
    }
    if (!filtered()) {
      const days = state.days.length;
      if (pending) {
        els.status.textContent = `${formatDayShort(latest)} · ${shown} 道，更早的日子还在加载`;
        return;
      }
      if (state.errors) {
        els.status.textContent = days > 1
          ? `共 ${days} 天 · ${shown} 道。有的日子没有加载出来。`
          : `${formatDay(latest)} · ${shown} 道。有的日子没有加载出来。`;
        return;
      }
      els.status.textContent = days > 1
        ? `共 ${days} 天 · ${shown} 道，最新的在最上面`
        : `${formatDay(latest)} · ${shown} 道`;
      return;
    }
    els.status.textContent = shown ? `找到 ${shown} 道` : "没有符合的菜谱";
  }

  function applyFilters() {
    let shown = 0;
    els.days.querySelectorAll(".card").forEach((card) => {
      const entry = state.byKey.get(card.dataset.key);
      const ok = entry ? matches(entry) : false;
      card.hidden = !ok;
      if (ok) shown += 1;
    });
    els.days.querySelectorAll(":scope > .day").forEach((section) => {
      const visible = section.querySelectorAll(".card:not([hidden])").length;
      const hasCards = section.querySelector(".card");
      section.hidden = hasCards ? visible === 0 : filtered();
      const count = section.querySelector(".day-count");
      if (count && hasCards) count.textContent = `${visible} 道`;
    });
    const nothingLoaded = state.finished >= state.expected && !allEntries().length;
    const noMatch = shown === 0 && (allEntries().length > 0 || nothingLoaded);
    els.empty.hidden = !noMatch || (!allEntries().length && state.finished < state.expected);
    if (nothingLoaded && state.errors) {
      els.emptyText.textContent = "菜谱没有加载出来，请稍后再打开一次。";
      els.reset.hidden = false;
      els.reset.textContent = "重新加载";
      els.reset.dataset.mode = "reload";
    } else if (!allEntries().length && state.finished >= state.expected) {
      els.emptyText.textContent = "还没有菜谱。更新之后会出现在这里。";
      els.reset.hidden = true;
      els.reset.dataset.mode = "reset";
    } else {
      els.emptyText.textContent = "没有符合的菜谱。换个词，或者把分类和榜单改回全部。";
      els.reset.hidden = false;
      els.reset.textContent = "清除筛选";
      els.reset.dataset.mode = "reset";
    }
    updateKickers();
    updateChipCounts();
    setStatus(shown);
    els.days.setAttribute("aria-busy", state.finished < state.expected ? "true" : "false");
  }

  function clearSkeleton() {
    const skeleton = els.days.querySelector(".sk-grid");
    if (skeleton) skeleton.remove();
  }

  function commitDay(day) {
    state.days.push(day);
    day.entries.forEach((entry) => state.byKey.set(entry.key, entry));
    clearSkeleton();
    renderDay(day);
    ensureCategoryChips();
    applyFilters();
  }

  async function load() {
    let index;
    try {
      index = await fetchJson("data/index.json");
    } catch {
      state.finished = 1;
      state.expected = 1;
      state.errors = 1;
      clearSkeleton();
      applyFilters();
      return;
    }
    const dates = normalizeDates(index);
    state.expected = dates.length;
    if (!dates.length) {
      state.finished = 0;
      state.expected = 0;
      clearSkeleton();
      applyFilters();
      return;
    }
    const jobs = dates.map(async (item) => {
      try {
        const json = await fetchJson(item.file);
        return { item, json };
      } catch {
        return { item, error: true };
      }
    });
    const first = await jobs[0];
    take(first);
    await Promise.all(jobs.slice(1).map(async (job) => take(await job)));
  }

  function take(result) {
    state.finished += 1;
    if (result.error) {
      state.errors += 1;
      clearSkeleton();
      applyFilters();
      return;
    }
    commitDay(normalizeDay(result.json, result.item));
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }

  async function writeClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* use the fallback below */
    }
    return fallbackCopy(text);
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("on");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => els.toast.classList.remove("on"), 1800);
  }

  async function copyText(text, button, message) {
    const ok = await writeClipboard(text);
    if (!ok) {
      toast("没有复制成功，请长按文字再试一次");
      return;
    }
    toast(message);
    if (!button) return;
    const previous = button.textContent;
    button.classList.add("done");
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.classList.remove("done");
      button.textContent = previous;
    }, 1400);
  }

  function copyEntry(entry, button) {
    const message = entry.ingredients.length ? "已复制菜名和用料" : "已复制菜名";
    return copyText(topicNote(entry), button, message);
  }

  function renderDetail(entry) {
    els.photo.replaceChildren();
    fillPhoto(els.photo, entry, true);
    const img = els.photo.querySelector("img");
    if (img) img.alt = entry.name;

    const body = document.createElement("div");
    const when = document.createElement("p");
    when.className = "detail-kicker";
    const week = weekday(entry.date);
    when.textContent = `收录于 ${formatDay(entry.date)}${week ? ` ${week}` : ""}`;
    body.append(when);

    const badgeRow = document.createElement("div");
    badgeRow.className = "inline-badges";
    if (entry.category) badgeRow.append(badgeSpan(entry.category, ""));
    listBadges(entry).forEach((badge) => badgeRow.append(badgeSpan(badge.text, badge.kind)));
    if (badgeRow.childNodes.length) body.append(badgeRow);

    const title = document.createElement("h2");
    title.className = "detail-title";
    title.id = "detail-title";
    title.textContent = entry.name;
    body.append(title);

    const meta = document.createElement("p");
    meta.className = "detail-by";
    if (entry.author) {
      const author = document.createElement("span");
      author.textContent = entry.author;
      meta.append(author);
    }
    const score = formatScore(entry.score);
    if (score) {
      const node = document.createElement("span");
      node.className = "score";
      node.textContent = `${score} 分`;
      meta.append(node);
    }
    const made = formatMade(entry.made);
    if (made) {
      const node = document.createElement("span");
      node.textContent = made;
      meta.append(node);
    }
    if (meta.childNodes.length) body.append(meta);

    if (entry.desc) {
      const desc = document.createElement("p");
      desc.className = "detail-desc";
      desc.textContent = entry.desc;
      body.append(desc);
    }

    const heading = document.createElement("h3");
    heading.className = "ing-title";
    heading.textContent = "用料";
    body.append(heading);
    if (!entry.ingredients.length) {
      const empty = document.createElement("p");
      empty.className = "ing-empty";
      empty.textContent = "这份菜谱没有写下用料，可以去下厨房看原文。";
      body.append(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "ing-list";
      entry.ingredients.forEach((item) => {
        const row = document.createElement("li");
        row.className = "ing-row";
        const name = document.createElement("span");
        name.className = "ing-name";
        name.textContent = item.name || "用料";
        row.append(name);
        if (item.amount) {
          const amount = document.createElement("span");
          amount.className = "ing-amt";
          amount.textContent = item.amount;
          row.append(amount);
        }
        list.append(row);
      });
      body.append(list);
    }
    body.append(renderMethod(entry));
    els.body.replaceChildren(body);

    const href = safeRemote(entry.url);
    if (href) {
      els.link.href = href;
      els.link.hidden = false;
    } else {
      els.link.removeAttribute("href");
      els.link.hidden = true;
    }
    els.copy.classList.remove("done");
    els.copy.textContent = "复制菜名+用料";
    els.copySteps.classList.remove("done");
    els.copySteps.textContent = "复制做法";
    els.copySteps.hidden = entry.steps.length === 0;
  }

  function renderMethod(entry) {
    const section = document.createElement("section");
    section.className = "method";
    const heading = document.createElement("h3");
    heading.className = "ing-title";
    heading.textContent = "做法";
    section.append(heading);
    const count = entry.steps.length || entry.stepCount;
    if (count > 0 && entry.steps.length) {
      const summary = document.createElement("p");
      summary.className = "detail-steps";
      summary.textContent = `共 ${entry.steps.length} 步`;
      section.append(summary);
    }
    if (!entry.steps.length) {
      const empty = document.createElement("p");
      empty.className = "ing-empty";
      empty.textContent = "这份菜谱没有写下做法，可以点下面的按钮看原文。";
      section.append(empty);
      return section;
    }
    const list = document.createElement("ol");
    list.className = "step-list";
    entry.steps.forEach((step) => {
      const item = document.createElement("li");
      item.className = "step";
      const local = safeLocal(step.imageLocal);
      const source = stepCdnUrl(step.imageSource);
      const first = local || source;
      if (first) {
        const figure = document.createElement("figure");
        figure.className = "step-photo";
        const img = document.createElement("img");
        img.alt = `第${step.n}步`;
        img.decoding = "async";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.setAttribute("referrerpolicy", "no-referrer");
        img.addEventListener("error", () => {
          const usingSource = img.getAttribute("src") === source;
          if (source && !usingSource) {
            img.src = source;
            return;
          }
          figure.hidden = true;
        });
        img.src = first;
        figure.append(img);
        item.append(figure);
      }
      const line = document.createElement("p");
      line.className = "step-line";
      const num = document.createElement("span");
      num.className = "step-n";
      num.textContent = `${step.n}.`;
      line.append(num);
      if (step.text) line.append(document.createTextNode(step.text));
      item.append(line);
      list.append(item);
    });
    section.append(list);
    return section;
  }

  function setBackgroundInert(on) {
    document.querySelectorAll("header, .toolbar, main, footer").forEach((node) => {
      node.inert = on;
    });
  }

  function openDetail(entry, opener) {
    state.openKey = entry.key;
    state.lastFocus = opener || document.activeElement;
    renderDetail(entry);
    els.toast.classList.remove("on");
    els.detail.hidden = false;
    document.body.classList.add("locked");
    setBackgroundInert(true);
    els.toTop.hidden = true;
    els.close.focus();
    if (!history.state || history.state.detail !== entry.key) {
      history.pushState({ detail: entry.key }, "");
    }
  }

  function hideDetail() {
    if (!state.openKey) return;
    state.openKey = "";
    els.detail.hidden = true;
    document.body.classList.remove("locked");
    setBackgroundInert(false);
    syncToTop();
    const back = state.lastFocus;
    state.lastFocus = null;
    if (back && typeof back.focus === "function") back.focus();
  }

  function requestClose() {
    if (history.state && history.state.detail) history.back();
    else hideDetail();
  }

  function syncToTop() {
    els.toTop.hidden = Boolean(state.openKey) || window.scrollY < 700;
  }

  function resetFilters() {
    state.category = "全部";
    state.list = "全部";
    state.query = "";
    els.q.value = "";
    els.clear.hidden = true;
    els.categories.querySelectorAll(".chip").forEach((chip) => {
      chip.setAttribute("aria-pressed", chip.dataset.value === "全部" ? "true" : "false");
    });
    els.lists.querySelectorAll(".chip").forEach((chip) => {
      chip.setAttribute("aria-pressed", chip.dataset.value === "全部" ? "true" : "false");
    });
    applyFilters();
    els.q.focus();
  }

  els.tools.addEventListener("submit", (event) => event.preventDefault());
  els.q.addEventListener("input", () => {
    state.query = els.q.value;
    els.clear.hidden = !norm(state.query);
    applyFilters();
  });
  els.clear.addEventListener("click", () => {
    state.query = "";
    els.q.value = "";
    els.clear.hidden = true;
    applyFilters();
    els.q.focus();
  });
  els.reset.addEventListener("click", () => {
    if (els.reset.dataset.mode === "reload") location.reload();
    else resetFilters();
  });
  els.toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", syncToTop, { passive: true });
  els.backdrop.addEventListener("click", requestClose);
  els.close.addEventListener("click", requestClose);
  els.copy.addEventListener("click", () => {
    const entry = state.byKey.get(state.openKey);
    if (entry) copyEntry(entry, els.copy);
  });
  els.copySteps.addEventListener("click", () => {
    const entry = state.byKey.get(state.openKey);
    if (!entry || !entry.steps.length) return;
    copyText(stepsNote(entry), els.copySteps, "已复制做法");
  });
  document.addEventListener("keydown", (event) => {
    if (!state.openKey) return;
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = [...els.panel.querySelectorAll("a, button")].filter((node) => !node.hidden);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  window.addEventListener("popstate", () => {
    if (state.openKey) hideDetail();
  });

  renderChips();
  load();
})();
