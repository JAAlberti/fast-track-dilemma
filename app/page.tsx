"use client";

import { useEffect, useMemo, useState } from "react";

type RiskKey = string;
type Scores = Record<RiskKey, number>;

type Risk = {
  key: RiskKey;
  label: string;
  group?: string;
  description?: string;
};

type GameOption = {
  text: string;
  feedback: string[];
  impact: Scores;
};

type GameEvent = {
  id: number | string;
  title: string;
  context: string[];
  options: GameOption[];
};

type Outcome = {
  id: string;
  title: string;
  when: string;
  summary: string;
  opinion?: string;
  bullets?: string[];
  reflectionQuestions?: string[];
};

type Game = {
  meta: {
    title: string;
    subtitle?: string;
    intro?: string[];
    disclaimer?: string;
    finalNote?: string;
    contactEmail?: string;
    contactSubject?: string;
    contactBody?: string;
  };
  risks: Risk[];
  events: GameEvent[];
  outcomes: Outcome[];
};

function makeEmptyScores(risks: Risk[]): Scores {
  const scores: Scores = {};
  risks.forEach((risk) => {
    scores[risk.key] = 0;
  });
  return scores;
}

function sumScores(scores: Scores): number {
  return Object.values(scores).reduce((acc, value) => acc + (Number(value) || 0), 0);
}

function matchesRule(rule: string | undefined, scores: Scores): boolean {
  if (!rule || rule.trim() === "" || rule.trim() === "true" || rule.trim() === "default") {
    return true;
  }

  const total = sumScores(scores);
  const context: Scores = { total, ...scores };

  const evaluatePart = (part: string): boolean => {
    const match = part.trim().match(/^([a-zA-Z0-9_]+)\s*(<=|>=|<|>|==)\s*(-?[0-9]+)$/);
    if (!match) return false;

    const key = match[1];
    const operator = match[2];
    const expected = Number(match[3]);
    const actual = Number(context[key] ?? 0);

    switch (operator) {
      case "<=":
        return actual <= expected;
      case ">=":
        return actual >= expected;
      case "<":
        return actual < expected;
      case ">":
        return actual > expected;
      case "==":
        return actual === expected;
      default:
        return false;
    }
  };

  const orBlocks = rule.split("||").map((block) => block.trim());

  return orBlocks.some((block) => {
    const andParts = block.split("&&").map((part) => part.trim());
    return andParts.every(evaluatePart);
  });
}

function pickOutcome(game: Game, scores: Scores): Outcome {
  for (const outcome of game.outcomes) {
    if (matchesRule(outcome.when, scores)) {
      return outcome;
    }
  }

  return {
    id: "mixed",
    title: "Mixed Risk Profile",
    when: "default",
    summary:
      "Your decisions produced a mixed profile: some risks were contained, while others accumulated under pressure.",
    opinion:
      "This is common in megaprojects. The issue is rarely one single bad decision; it is the accumulation of reasonable decisions made under incomplete information and institutional pressure.",
    bullets: [
      "Some risks were managed early.",
      "Other risks were deferred into implementation.",
      "The final outcome depends on who ultimately absorbs those risks."
    ],
    reflectionQuestions: [
      "Which risk was most underestimated?",
      "Who ended up carrying the largest burden?",
      "Which early decision created the most lock-in?"
    ]
  };
}

function getTopRisks(game: Game, scores: Scores, count = 3) {
  return game.risks
    .map((risk) => ({
      ...risk,
      value: scores[risk.key] ?? 0
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count);
}

function getMaxScore(scores: Scores): number {
  return Math.max(1, ...Object.values(scores));
}

function makeContactHref(game: Game, outcome: Outcome, scores: Scores): string | undefined {
  if (!game.meta.contactEmail) return undefined;

  const subject = game.meta.contactSubject || "Fast-Track Dilemma feedback";
  const body =
    game.meta.contactBody ||
    [
      "Hi,",
      "",
      "I played the Megaproject LAB simulation and would like to share some ideas.",
      "",
      `My result was: ${outcome.title}`,
      `Total risk score: ${sumScores(scores)}`,
      "",
      "Comments:"
    ].join("\n");

  return `mailto:${game.meta.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    body
  )}`;
}

export default function Page() {
  const [game, setGame] = useState<Game | null>(null);
  const [step, setStep] = useState<"intro" | "play" | "result">("intro");
  const [eventIndex, setEventIndex] = useState(0);
  const [scores, setScores] = useState<Scores>({});
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [history, setHistory] = useState<
    { eventId: number | string; eventTitle: string; optionText: string; impact: Scores }[]
  >([]);

  useEffect(() => {
    fetch("/game.json")
      .then((response) => response.json())
      .then((data: Game) => {
        setGame(data);
        setScores(makeEmptyScores(data.risks || []));
      })
      .catch(() => {
        setGame(null);
      });
  }, []);

  const currentEvent = useMemo(() => {
    if (!game) return null;
    return game.events[eventIndex] || null;
  }, [game, eventIndex]);

  const outcome = useMemo(() => {
    if (!game) return null;
    return pickOutcome(game, scores);
  }, [game, scores]);

  const topRisks = useMemo(() => {
    if (!game) return [];
    return getTopRisks(game, scores, 3);
  }, [game, scores]);

  const maxScore = useMemo(() => getMaxScore(scores), [scores]);

  const resetGame = () => {
    if (!game) return;
    setStep("intro");
    setEventIndex(0);
    setScores(makeEmptyScores(game.risks || []));
    setSelectedOptionIndex(null);
    setShowFeedback(false);
    setHistory([]);
  };

  const startGame = () => {
    if (!game) return;
    setStep("play");
    setEventIndex(0);
    setScores(makeEmptyScores(game.risks || []));
    setSelectedOptionIndex(null);
    setShowFeedback(false);
    setHistory([]);
  };

  const chooseOption = (optionIndex: number) => {
    if (!game || !currentEvent) return;

    const option = currentEvent.options[optionIndex];
    const nextScores: Scores = { ...makeEmptyScores(game.risks), ...scores };

    game.risks.forEach((risk) => {
      const delta = option.impact?.[risk.key] ?? 0;
      nextScores[risk.key] = Math.max(0, (nextScores[risk.key] || 0) + delta);
    });

    setScores(nextScores);
    setSelectedOptionIndex(optionIndex);
    setShowFeedback(true);
    setHistory((previous) => [
      ...previous,
      {
        eventId: currentEvent.id,
        eventTitle: currentEvent.title,
        optionText: option.text,
        impact: option.impact || {}
      }
    ]);
  };

  const continueGame = () => {
    if (!game) return;

    setShowFeedback(false);
    setSelectedOptionIndex(null);

    if (eventIndex >= game.events.length - 1) {
      setStep("result");
    } else {
      setEventIndex((previous) => previous + 1);
    }
  };

  if (!game) {
    return (
      <main style={styles.shell}>
        <section style={styles.card}>
          <h1 style={styles.title}>Loading…</h1>
          <p style={styles.text}>
            If this message does not disappear, check that <code>public/game.json</code> exists and is valid JSON.
          </p>
        </section>
      </main>
    );
  }

  const selectedOption =
    currentEvent && selectedOptionIndex !== null ? currentEvent.options[selectedOptionIndex] : null;

  const contactHref = outcome ? makeContactHref(game, outcome, scores) : undefined;

  return (
    <main style={styles.shell}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>{game.meta.title}</h1>
            {game.meta.subtitle && <p style={styles.subtitle}>{game.meta.subtitle}</p>}
          </div>

          <button onClick={resetGame} style={styles.secondaryButton}>
            Reset
          </button>
        </header>

        {step === "intro" && (
          <section style={styles.card}>
            {(game.meta.intro || []).map((paragraph, index) => (
              <p key={index} style={styles.text}>
                {paragraph}
              </p>
            ))}

            {game.meta.disclaimer && <p style={styles.smallText}>{game.meta.disclaimer}</p>}

            <button onClick={startGame} style={styles.primaryButton}>
              Start simulation
            </button>
          </section>
        )}

        {step === "play" && currentEvent && (
          <section style={styles.grid}>
            <div style={styles.card}>
              <p style={styles.kicker}>
                Decision {eventIndex + 1} / {game.events.length}
              </p>

              <h2 style={styles.sectionTitle}>{currentEvent.title}</h2>

              {currentEvent.context.map((paragraph, index) => (
                <p key={index} style={styles.text}>
                  {paragraph}
                </p>
              ))}

              {!showFeedback && (
                <div style={styles.optionList}>
                  {currentEvent.options.map((option, index) => (
                    <button key={index} onClick={() => chooseOption(index)} style={styles.optionButton}>
                      {option.text}
                    </button>
                  ))}
                </div>
              )}

              {showFeedback && selectedOption && (
                <div style={styles.feedbackBox}>
                  <p style={styles.kicker}>Feedback</p>
                  {selectedOption.feedback.map((line, index) => (
                    <p key={index} style={styles.text}>
                      {line}
                    </p>
                  ))}

                  <button onClick={continueGame} style={styles.primaryButton}>
                    Continue
                  </button>
                </div>
              )}
            </div>

            <aside style={styles.card}>
              <p style={styles.kicker}>Risk profile</p>

              <div style={styles.riskList}>
                {game.risks.map((risk) => {
                  const value = scores[risk.key] || 0;
                  const width = `${Math.min(100, (value / maxScore) * 100)}%`;

                  return (
                    <div key={risk.key} style={styles.riskItem}>
                      <div style={styles.riskHeader}>
                        <span>{risk.label}</span>
                        <strong>{value}</strong>
                      </div>
                      <div style={styles.barOuter}>
                        <div style={{ ...styles.barInner, width }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={styles.totalRisk}>
                <span>Total risk</span>
                <strong>{sumScores(scores)}</strong>
              </div>
            </aside>
          </section>
        )}

        {step === "result" && outcome && (
          <section style={styles.card}>
            <p style={styles.kicker}>Simulation result</p>
            <h2 style={styles.sectionTitle}>{outcome.title}</h2>

            <p style={styles.text}>{outcome.summary}</p>

            {outcome.opinion && (
              <div style={styles.highlightBox}>
                <p style={styles.kicker}>Interpretation</p>
                <p style={styles.text}>{outcome.opinion}</p>
              </div>
            )}

            {outcome.bullets && outcome.bullets.length > 0 && (
              <>
                <h3 style={styles.subsectionTitle}>What this result suggests</h3>
                <ul style={styles.list}>
                  {outcome.bullets.map((bullet, index) => (
                    <li key={index}>{bullet}</li>
                  ))}
                </ul>
              </>
            )}

            <h3 style={styles.subsectionTitle}>Dominant risks</h3>
            <div style={styles.topRiskGrid}>
              {topRisks.map((risk) => (
                <div key={risk.key} style={styles.topRiskCard}>
                  <span>{risk.label}</span>
                  <strong>{risk.value}</strong>
                </div>
              ))}
            </div>

            {outcome.reflectionQuestions && outcome.reflectionQuestions.length > 0 && (
              <>
                <h3 style={styles.subsectionTitle}>Questions for discussion</h3>
                <ul style={styles.list}>
                  {outcome.reflectionQuestions.map((question, index) => (
                    <li key={index}>{question}</li>
                  ))}
                </ul>
              </>
            )}

            {game.meta.finalNote && <p style={styles.smallText}>{game.meta.finalNote}</p>}

            <div style={styles.actionRow}>
              <button onClick={startGame} style={styles.secondaryButton}>
                Play again
              </button>

              {contactHref && (
                <a href={contactHref} style={styles.primaryLink}>
                  Share ideas with the developer
                </a>
              )}
            </div>

            <p style={styles.smallText}>Decisions completed: {history.length}</p>
          </section>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    background: "#0b0f19",
    color: "#e7ecff",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  },
  container: {
    maxWidth: 980,
    margin: "0 auto",
    padding: 20
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 16
  },
  title: {
    fontSize: 28,
    lineHeight: 1.1,
    margin: 0
  },
  subtitle: {
    margin: "6px 0 0",
    opacity: 0.8
  },
  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.8fr)",
    gap: 14
  },
  kicker: {
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontSize: 12,
    opacity: 0.7,
    margin: "0 0 8px"
  },
  sectionTitle: {
    fontSize: 24,
    margin: "0 0 12px"
  },
  subsectionTitle: {
    fontSize: 17,
    margin: "18px 0 8px"
  },
  text: {
    fontSize: 16,
    lineHeight: 1.45,
    margin: "0 0 12px"
  },
  smallText: {
    fontSize: 13,
    lineHeight: 1.4,
    opacity: 0.75,
    margin: "12px 0"
  },
  optionList: {
    display: "grid",
    gap: 10,
    marginTop: 16
  },
  optionButton: {
    textAlign: "left",
    background: "rgba(255,255,255,0.08)",
    color: "#e7ecff",
    border: "1px solid rgba(231,236,255,0.18)",
    borderRadius: 14,
    padding: "13px 14px",
    cursor: "pointer",
    fontSize: 15,
    lineHeight: 1.35
  },
  feedbackBox: {
    background: "rgba(0,0,0,0.26)",
    borderRadius: 14,
    padding: 14,
    marginTop: 16
  },
  primaryButton: {
    background: "#e7ecff",
    color: "#0b0f19",
    border: 0,
    borderRadius: 12,
    padding: "11px 15px",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 8
  },
  secondaryButton: {
    background: "transparent",
    color: "#e7ecff",
    border: "1px solid rgba(231,236,255,0.25)",
    borderRadius: 12,
    padding: "10px 13px",
    cursor: "pointer",
    textDecoration: "none"
  },
  primaryLink: {
    background: "#e7ecff",
    color: "#0b0f19",
    borderRadius: 12,
    padding: "11px 15px",
    fontWeight: 700,
    textDecoration: "none"
  },
  riskList: {
    display: "grid",
    gap: 10
  },
  riskItem: {
    display: "grid",
    gap: 5
  },
  riskHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 14
  },
  barOuter: {
    height: 7,
    background: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    overflow: "hidden"
  },
  barInner: {
    height: "100%",
    background: "#e7ecff",
    borderRadius: 999
  },
  totalRisk: {
    display: "flex",
    justifyContent: "space-between",
    borderTop: "1px solid rgba(255,255,255,0.12)",
    marginTop: 14,
    paddingTop: 12
  },
  highlightBox: {
    background: "rgba(0,0,0,0.22)",
    borderRadius: 14,
    padding: 14,
    marginTop: 14
  },
  list: {
    marginTop: 8,
    lineHeight: 1.45
  },
  topRiskGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10
  },
  topRiskCard: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 12
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18
  }
};
