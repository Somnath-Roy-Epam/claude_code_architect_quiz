(() => {
  // --- Domain definitions ---
  const DOMAINS = [
    { id: 0, name: "All Domains", desc: "All 360 practice questions", icon: "\uD83D\uDCDA" },
    { id: 1, name: "Agentic Architecture & Orchestration", desc: "Agent loops, multi-agent coordination, error handling", icon: "\uD83C\uDFD7\uFE0F" },
    { id: 2, name: "Tool Design & MCP Integration", desc: "Tool descriptions, MCP config, tool distribution", icon: "\uD83D\uDD27" },
    { id: 3, name: "Claude Code Configuration & Workflows", desc: "CLAUDE.md, rules, commands, skills", icon: "\u2699\uFE0F" },
    { id: 4, name: "Prompt Engineering & Structured Output", desc: "Few-shot examples, JSON schemas, consistency", icon: "\u270D\uFE0F" },
    { id: 5, name: "Context Management & Reliability", desc: "Context windows, token optimization, escalation", icon: "\uD83E\uDDE0" },
  ];

  // Each scenario has 60 questions: 16 + 11 + 12 + 12 + 9
  function getDomain(questionId) {
    const offset = (questionId - 1) % 60;
    if (offset < 16) return 1;
    if (offset < 27) return 2;
    if (offset < 39) return 3;
    if (offset < 51) return 4;
    return 5;
  }

  // --- State ---
  let allQuestions = [];
  let selectedDomain = 0;
  let filteredQuestions = [];
  let filteredMap = []; // filteredIndex -> globalIndex
  let currentIndex = 0;
  const answers = [];

  // --- DOM refs ---
  const questionNumber = document.getElementById("question-number");
  const questionText = document.getElementById("question-text");
  const optionsContainer = document.getElementById("options");
  const explanationBox = document.getElementById("explanation-box");
  const resultBanner = document.getElementById("result-banner");
  const correctExplanation = document.getElementById("correct-explanation");
  const wrongExplanations = document.getElementById("wrong-explanations");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const progressEl = document.getElementById("progress");
  const scoreEl = document.getElementById("score");
  const resultsScreen = document.getElementById("results-screen");
  const quizContainer = document.getElementById("quiz-container");
  const finalScoreValue = document.getElementById("final-score-value");
  const totalQuestions = document.getElementById("total-questions");
  const finalMessage = document.getElementById("final-message");
  const resultsBreakdown = document.getElementById("results-breakdown");
  const restartBtn = document.getElementById("restart-btn");
  const progressDashboard = document.getElementById("progress-dashboard");
  const resumeBtn = document.getElementById("resume-btn");
  const resetBtn = document.getElementById("reset-btn");
  const backToDashBtn = document.getElementById("back-to-dash-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const topicSelector = document.getElementById("topic-selector");
  const topicCards = document.getElementById("topic-cards");
  const changeTopicBtn = document.getElementById("change-topic-btn");
  const changeTopicBtn2 = document.getElementById("change-topic-btn-2");

  // --- Filtering ---
  function applyFilter(domainId) {
    selectedDomain = domainId;
    filteredQuestions = [];
    filteredMap = [];
    allQuestions.forEach((q, i) => {
      if (domainId === 0 || getDomain(q.id) === domainId) {
        filteredQuestions.push(q);
        filteredMap.push(i);
      }
    });
  }

  function getScore() {
    return filteredMap.reduce((s, gi) => s + (answers[gi].correct ? 1 : 0), 0);
  }

  function getStats() {
    const answered = filteredMap.filter((gi) => answers[gi].selected !== null).length;
    const correct = filteredMap.filter((gi) => answers[gi].correct).length;
    return {
      answered,
      correct,
      wrong: answered - correct,
      remaining: filteredQuestions.length - answered,
      pct: Math.round((answered / filteredQuestions.length) * 100),
    };
  }

  // --- Header subtitle ---
  function updateHeaderSubtitle() {
    const sub = document.querySelector(".header-subtitle");
    if (!sub) return;
    if (selectedDomain === 0) {
      sub.textContent = "Exam Preparation \u2014 360 Practice Questions";
    } else {
      const d = DOMAINS.find((x) => x.id === selectedDomain);
      sub.textContent = d.name + " \u2014 " + filteredQuestions.length + " Questions";
    }
  }

  // --- Persistence ---
  async function saveProgress() {
    try {
      await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentIndex, selectedDomain, score: getScore(), answers }),
      });
    } catch (_) {}
  }

  async function loadProgress() {
    try {
      const res = await fetch("/api/progress");
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function clearProgress() {
    try {
      await fetch("/api/progress", { method: "DELETE" });
    } catch (_) {}
  }

  // --- User ---
  async function loadUser() {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) {
        window.location.href = "/login";
        return false;
      }
      const data = await res.json();
      const name = data.user.displayName || data.user.username;
      document.getElementById("user-display-name").textContent = name;
      document.getElementById("user-avatar").textContent = name.charAt(0).toUpperCase();
      return true;
    } catch (_) {
      window.location.href = "/login";
      return false;
    }
  }

  async function loadQuestions() {
    try {
      const res = await fetch("/api/questions");
      if (!res.ok) {
        window.location.href = "/login";
        return false;
      }
      allQuestions = await res.json();
      return true;
    } catch (_) {
      window.location.href = "/login";
      return false;
    }
  }

  // --- Screen management ---
  function hideAll() {
    topicSelector.classList.add("hidden");
    progressDashboard.classList.add("hidden");
    quizContainer.classList.add("hidden");
    resultsScreen.classList.add("hidden");
  }

  // --- Topic Selector ---
  function showTopicSelector() {
    hideAll();
    topicSelector.classList.remove("hidden");
    topicCards.innerHTML = "";

    DOMAINS.forEach((d) => {
      const indices = [];
      allQuestions.forEach((q, i) => {
        if (d.id === 0 || getDomain(q.id) === d.id) indices.push(i);
      });
      const total = indices.length;
      const answered = indices.filter((i) => answers[i].selected !== null).length;
      const correct = indices.filter((i) => answers[i].correct).length;
      const pct = total ? Math.round((answered / total) * 100) : 0;

      const card = document.createElement("button");
      card.className = "topic-card";
      if (d.id === selectedDomain) card.classList.add("active");
      card.innerHTML =
        '<div class="topic-card-header">' +
        '<span class="topic-icon">' + d.icon + "</span>" +
        '<span class="topic-name">' + d.name + "</span>" +
        "</div>" +
        '<p class="topic-desc">' + d.desc + "</p>" +
        '<div class="topic-meta">' +
        "<span>" + total + " questions</span>" +
        "<span>" + answered + "/" + total + " answered</span>" +
        "<span>" + correct + " correct</span>" +
        "</div>" +
        '<div class="topic-progress-track">' +
        '<div class="topic-progress-fill" style="width:' + pct + '%"></div>' +
        "</div>";

      card.addEventListener("click", () => {
        applyFilter(d.id);
        updateHeaderSubtitle();
        currentIndex = 0;
        const hasProgress = filteredMap.some((gi) => answers[gi].selected !== null);
        if (hasProgress) {
          showDashboard();
        } else {
          hideAll();
          quizContainer.classList.remove("hidden");
          renderQuestion();
        }
        saveProgress();
      });
      topicCards.appendChild(card);
    });
  }

  // --- Dashboard ---
  function showDashboard() {
    hideAll();
    progressDashboard.classList.remove("hidden");
    const stats = getStats();
    document.getElementById("stat-answered").textContent = stats.answered;
    document.getElementById("stat-correct").textContent = stats.correct;
    document.getElementById("stat-wrong").textContent = stats.wrong;
    document.getElementById("stat-remaining").textContent = stats.remaining;
    document.getElementById("stat-pct").textContent = stats.pct;
    document.getElementById("overall-progress-fill").style.width = stats.pct + "%";

    const domainLabel = document.getElementById("dashboard-domain-label");
    if (domainLabel) {
      const d = DOMAINS.find((x) => x.id === selectedDomain);
      domainLabel.textContent = d ? d.name : "All Domains";
    }
  }

  // --- Init ---
  async function init() {
    const loggedIn = await loadUser();
    if (!loggedIn) return;

    const loaded = await loadQuestions();
    if (!loaded) return;

    answers.length = 0;
    for (let i = 0; i < allQuestions.length; i++) {
      answers.push({ selected: null, correct: false });
    }
    currentIndex = 0;
    selectedDomain = 0;

    const saved = await loadProgress();
    if (saved && Array.isArray(saved.answers) && saved.answers.length === allQuestions.length) {
      for (let i = 0; i < saved.answers.length; i++) {
        answers[i] = saved.answers[i];
      }
      currentIndex = saved.currentIndex || 0;
      selectedDomain = typeof saved.selectedDomain === "number" ? saved.selectedDomain : 0;
      applyFilter(selectedDomain);
      updateHeaderSubtitle();
      if (answers.some((a) => a.selected !== null)) {
        showDashboard();
        return;
      }
    }

    applyFilter(0);
    updateHeaderSubtitle();
    showTopicSelector();
  }

  // --- Quiz rendering ---
  function renderQuestion() {
    const q = filteredQuestions[currentIndex];
    const gi = filteredMap[currentIndex];
    const ans = answers[gi];

    questionNumber.textContent = "Question " + (currentIndex + 1);
    questionText.textContent = q.question;

    const score = getScore();
    progressEl.textContent = "Question " + (currentIndex + 1) + " / " + filteredQuestions.length;
    scoreEl.textContent = "Score: " + score + " / " + filteredQuestions.length;

    updateProgressBar();

    optionsContainer.innerHTML = "";
    const optionKeys = Object.keys(q.options);
    optionKeys.forEach((key) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.setAttribute("data-key", key);
      btn.innerHTML =
        '<span class="option-letter">' + key + "</span>" +
        '<span class="option-text">' + q.options[key] + "</span>";

      if (ans.selected !== null) {
        btn.classList.add("disabled");
        if (key === q.correctAnswer) btn.classList.add("correct");
        else if (key === ans.selected) btn.classList.add("wrong");
        else btn.classList.add("dimmed");
      } else {
        btn.addEventListener("click", () => selectAnswer(key));
      }

      optionsContainer.appendChild(btn);
    });

    if (ans.selected !== null) {
      showExplanation(q, ans);
    } else {
      explanationBox.classList.add("hidden");
    }

    prevBtn.disabled = currentIndex === 0;
    if (ans.selected !== null) {
      nextBtn.disabled = false;
      nextBtn.textContent = currentIndex === filteredQuestions.length - 1 ? "See Results" : "Next";
    } else {
      nextBtn.disabled = true;
      nextBtn.textContent = currentIndex === filteredQuestions.length - 1 ? "See Results" : "Next";
    }
  }

  function selectAnswer(key) {
    const q = filteredQuestions[currentIndex];
    const gi = filteredMap[currentIndex];
    const isCorrect = key === q.correctAnswer;
    answers[gi] = { selected: key, correct: isCorrect };
    saveProgress();
    renderQuestion();
  }

  function showExplanation(q, ans) {
    explanationBox.classList.remove("hidden");

    if (ans.correct) {
      resultBanner.textContent = "\u2713 Correct!";
      resultBanner.className = "result-banner correct";
    } else {
      resultBanner.textContent = "\u2717 Incorrect \u2014 The correct answer is " + q.correctAnswer;
      resultBanner.className = "result-banner wrong";
    }

    correctExplanation.innerHTML =
      "<strong>" + q.correctAnswer + ") " + q.options[q.correctAnswer] + "</strong><br>" + q.explanation;

    wrongExplanations.innerHTML = "";
    if (q.wrongExplanations) {
      Object.keys(q.wrongExplanations).forEach((key) => {
        const div = document.createElement("div");
        div.className = "wrong-item";
        div.innerHTML =
          "<strong>" + key + ") " + q.options[key] + "</strong> \u2014 " + q.wrongExplanations[key];
        wrongExplanations.appendChild(div);
      });
    }
  }

  function updateProgressBar() {
    const bar = document.getElementById("progress-bar-fill");
    if (bar) {
      const pct = ((currentIndex + 1) / filteredQuestions.length) * 100;
      bar.style.width = pct + "%";
    }
  }

  function showResults() {
    hideAll();
    resultsScreen.classList.remove("hidden");

    const score = getScore();
    finalScoreValue.textContent = score;
    totalQuestions.textContent = filteredQuestions.length;

    const pct = Math.round((score / filteredQuestions.length) * 100);
    if (pct === 100) finalMessage.textContent = "Perfect score! Outstanding!";
    else if (pct >= 80) finalMessage.textContent = "Great job! Keep it up!";
    else if (pct >= 60) finalMessage.textContent = "Good effort! Review the explanations to improve.";
    else if (pct >= 40) finalMessage.textContent = "Keep studying \u2014 you\u2019ll get there!";
    else finalMessage.textContent = "Time to review the material. Don\u2019t give up!";

    resultsBreakdown.innerHTML = "";
    filteredQuestions.forEach((q, i) => {
      const gi = filteredMap[i];
      const a = answers[gi];
      let cls, icon;
      if (a.selected === null) {
        cls = "unanswered-row";
        icon = "\u2014";
      } else if (a.correct) {
        cls = "correct-row";
        icon = "\u2713";
      } else {
        cls = "wrong-row";
        icon = "\u2717";
      }
      const row = document.createElement("div");
      row.className = "result-row " + cls;
      row.innerHTML =
        '<span class="status-icon">' + icon + "</span><span>Q" + (i + 1) + ": " +
        q.question.substring(0, 80) + (q.question.length > 80 ? "\u2026" : "") + "</span>";
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        currentIndex = i;
        hideAll();
        quizContainer.classList.remove("hidden");
        renderQuestion();
      });
      resultsBreakdown.appendChild(row);
    });
  }

  // --- Event listeners ---
  prevBtn.addEventListener("click", () => {
    if (currentIndex > 0) {
      currentIndex--;
      saveProgress();
      renderQuestion();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (currentIndex < filteredQuestions.length - 1) {
      currentIndex++;
      saveProgress();
      renderQuestion();
    } else {
      showResults();
    }
  });

  restartBtn.addEventListener("click", async () => {
    filteredMap.forEach((gi) => {
      answers[gi] = { selected: null, correct: false };
    });
    currentIndex = 0;
    await saveProgress();
    hideAll();
    quizContainer.classList.remove("hidden");
    renderQuestion();
  });

  resumeBtn.addEventListener("click", () => {
    for (let fi = 0; fi < filteredMap.length; fi++) {
      if (answers[filteredMap[fi]].selected === null) {
        currentIndex = fi;
        break;
      }
    }
    hideAll();
    quizContainer.classList.remove("hidden");
    renderQuestion();
  });

  resetBtn.addEventListener("click", async () => {
    if (!confirm("Reset progress for this topic? This cannot be undone.")) return;
    filteredMap.forEach((gi) => {
      answers[gi] = { selected: null, correct: false };
    });
    currentIndex = 0;
    await saveProgress();
    showDashboard();
  });

  backToDashBtn.addEventListener("click", () => {
    saveProgress();
    showDashboard();
  });

  if (changeTopicBtn) {
    changeTopicBtn.addEventListener("click", () => {
      saveProgress();
      showTopicSelector();
    });
  }

  if (changeTopicBtn2) {
    changeTopicBtn2.addEventListener("click", () => {
      saveProgress();
      showTopicSelector();
    });
  }

  logoutBtn.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  });

  document.addEventListener("keydown", (e) => {
    if (!quizContainer.classList.contains("hidden") && filteredQuestions.length) {
      const q = filteredQuestions[currentIndex];
      const gi = filteredMap[currentIndex];
      const keys = Object.keys(q.options);
      const pressed = e.key.toUpperCase();
      if (keys.includes(pressed) && answers[gi].selected === null) {
        selectAnswer(pressed);
      }
      if (e.key === "ArrowRight" && !nextBtn.disabled) nextBtn.click();
      if (e.key === "ArrowLeft" && !prevBtn.disabled) prevBtn.click();
    }
  });

  init();
})();
