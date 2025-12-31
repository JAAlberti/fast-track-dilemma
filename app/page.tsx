"use client";

import { useEffect, useMemo, useState } from "react";

type RiskKey = "econ" | "fiscal" | "envsoc" | "gov" | "delivery";

type Game = {
  meta: {
    title: string;
    subtitle: string;
    trainerPin: string;
    intro: string[];
    revealTitle: string;
    revealBody: string[];
    disclaimer: string;
  };
  risks: { key: RiskKey; label: string }[];
  events: {
    id: number;
    title: string;
    context: string[];
    options: {
      text: string;
      feedback: string[];
      impact: Record<RiskKey, number>;
    }[];
  }[];
  outcomes: {
    id: string;
    title: string;
    when: string;
    summary: string;
    bullets: string[];
  }[];
};

type Scores = Record<RiskKey, number>;

const emptyScores = (): Scores => ({ econ: 0, fiscal: 0, envsoc: 0, gov: 0, delivery: 0 });

function sumScores(s: Scores) {
  return s.econ + s.fiscal + s.envsoc + s.gov + s.delivery;
}

function matchesRule(rule: string, s: Scores): boolean {
  const total = sumScores(s);
  const ctx = { total, ...s };

  const parts = rule.split("&&").map((p) => p.trim());

  const evalPart = (p: string) => {
    const m = p.match(/^([a-z]+)\s*(<=|>=|<|>|==)\s*([0-9]+)$/i);
    if (!m) return false;
    const key = m[1] as keyof typeof ctx;
    const op = m[2];
    const val = Number(m[3]);
    const left = Number(ctx[key]);
    switch (op) {
      case "<=": return left <= val;
      case ">=": return left >= val;
      case "<": return left < val;
      case ">": return left > val;
      case "==": return left === val;
      default: return false;
    }
  };

  return parts.every(evalPart);
}

function pickOutcome(game: Game, s: Scores) {
  for (const o of game.outcomes) {
    if (matchesRule(o.when, s)) return o;
  }
  return {
    id: "default",
    title: "Mixed Outcome",
    when: "true",
    summary: "Your choices produced a mixed profile: some risks were contained while others accumulated under pressure.",
    bullets: ["Review the decisions that drove your dominant risk dimension."]
  };
}

export default function Page() {
  const [game, setGame] = useState<Game | null>(null);

  const [step, setStep] = useState<"intro" | "play" | "result" | "reveal">("intro");
  const [eventIdx, setEventIdx] = useState(0);

  const [scores, setScores] = useState<Scores>(emptyScores());
  const [history, setHistory] = useState<{ eventId: number; optionIdx: number; delta: Scores }[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);

  const [trainerUnlocked, setTrainerUnlocked] = useState(false);
  const [pin, setPin] = useState("");

  useEffect(() => {
    fetch("/game.json")
      .then((r) => r.json())
      .then((j) => setGame(j))
      .catch(() => setGame(null));
  }, []);

  const currentEvent = useMemo(() => {
    if (!game) return null;
    return game.events[eventIdx] ?? null;
  }, [game, eventIdx]);

  const outcome = useMemo(() => {
    if (!game) return null;
    return pickOutcome(game, scores);
  }, [game, scores]);

  const reset = () => {
    setStep("intro");
    setEventIdx(0);
    setScores(emptyScores());
    setHistory([]);
    setShowFeedback(false);
    setTrainerUnlocked(false);
    setPin("");
  };

  const applyOption = (optionIdx: number) => {
    if (!game || !currentEvent) return;
    const opt = currentEvent.options[optionIdx];

    const next: Scores = { ...scores };
    (Object.keys(next) as RiskKey[]).forEach((k) => {
      next[k] = next[k] + opt.impact[k];
      if (next[k] < 0) next[k] = 0;
    });

    setScores(next);
    setHistory((h) => [...h, { eventId: currentEvent.id, optionIdx, delta: opt.impact }]);
    setShowFeedback(true);
  };

  const nextEvent = () => {
    if (!game) return;
    setShowFeedback(false);
    if (eventIdx >= game.events.length - 1) {
      setStep("result");
    } else {
      setEventIdx((i) => i + 1);
    }
  };

  const unlockTrainer = () => {
    if (!game) return;
    if (pin === game.meta.trainerPin) setTrainerUnlocked(true);
  };

  if (!game) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Loading…</h1>
        <p>If this persists, confirm <code>public/game.json</code> exists and is valid JSON.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f19", color: "#e7ecff" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: 20 }}>
        <header style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26 }}>{game.meta.title}</h1>
              <div style={{ opacity: 0.85 }}>{game.meta.subtitle}</div>
            </div>
            <button
              onClick={reset}
              style={{
                background: "transparent",
                color: "#e7ecff",
                border: "1px solid rgba(231,236,255,0.25)",
                borderRadius: 10,
                padding: "8px 10px",
                cursor: "pointer"
              }}
            >
              Reset
            </button>
          </div>
        </header>

        {step === "intro" && (
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16 }}>
            {game.meta.intro.map((p, i) => (
              <p key={i} style={{ marginTop: i === 0 ? 0 : 10, lineHeight: 1.35 }}>
                {p}
              </p>
            ))}
            <p style={{ opacity: 0.8, marginBottom: 0 }}>{game.meta.disclaimer}</p>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button
                onClick={() => setStep("play")}
                style={{
                  background: "#e7ecff",
                  color: "#0b0f19",
                  border: 0,
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Start (10 decisions)
              </button>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Trainer PIN"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "#e7ecff",
                    border: "1px solid rgba(231,236,255,0.2)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    width: 140
                  }}
                />
                <button
                  onClick={unlockTrainer}
                  style={{
                    background: "transparent",
                    color: "#e7ecff",
                    border: "1px solid rgba(231,236,255,0.25)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    cursor: "pointer"
                  }}
                >
                  Unlock
                </button>
              </div>
            </div>

            {trainerUnlocked && (
              <div style={{ marginTop: 12, opacity: 0.95 }}>
                Trainer Mode: <b>Unlocked</b>
              </div>
            )}
          </div>
        )}

        {step === "play" && currentEvent && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16 }}>
              <div style={{ opacity: 0.8, marginBottom: 6 }}>
                Decision {eventIdx + 1} / {game.events.length}
              </div>
              <h2 style={{ marginTop: 0, marginBottom: 10 }}>{currentEvent.title}</h2>
              {currentEvent.context.map((p, i) => (
                <p key={i} style={{ marginTop: i === 0 ? 0 : 10, lineHeight: 1.35, opacity: 0.95 }}>
                  {p}
                </p>
              ))}

              {!showFeedback && (
                <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                  {currentEvent.options.map((o, i) => (
                    <button
                      key={i}
                      onClick={() => applyOption(i)}
                      style={{
                        textAlign: "left",
                        background: "rgba(255,255,255,0.08)",
                        color: "#e7ecff",
                        border: "1px solid rgba(231,236,255,0.18)",
                        borderRadius: 14,
                        padding: "12px 12px",
                        cursor: "pointer",
                        lineHeight: 1.3
                      }}
                    >
                      {o.text}
                    </button>
                  ))}
                </div>
              )}

              {showFeedback && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ opacity: 0.75, marginBottom: 8 }}>Feedback</div>
                  <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 14, padding: 12 }}>
                    {currentEvent.options[history[history.length - 1]?.optionIdx ?? 0].feedback.map((f, i) => (
                      <p key={i} style={{ marginTop: i === 0 ? 0 : 10, lineHeight: 1.35 }}>
                        {f}
                      </p>
                    ))}
                  </div>

                  <button
                    onClick={nextEvent}
                    style={{
                      marginTop: 12,
                      background: "#e7ecff",
                      color: "#0b0f19",
                      border: 0,
                      borderRadius: 12,
                      padding: "10px 14px",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>

            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16 }}>
              <div style={{ opacity: 0.8, marginBottom: 8 }}>Risk posture</div>
              <div style={{ display: "grid", gap: 8 }}>
                {game.risks.map((r) => (
                  <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>{r.label}</span>
                    <b>{scores[r.key]}</b>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, opacity: 0.9 }}>
                  <span>Total risk</span>
                  <b>{sumScores(scores)}</b>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "result" && outcome && (
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Your result</h2>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>{outcome.title}</h3>
            <p style={{ marginTop: 0, lineHeight: 1.35 }}>{outcome.summary}</p>
            <ul style={{ marginTop: 10, lineHeight: 1.35 }}>
              {outcome.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>

            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => setStep("play")}
                style={{
                  background: "transparent",
                  color: "#e7ecff",
                  border: "1px solid rgba(231,236,255,0.25)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  cursor: "pointer"
                }}
              >
                Replay
              </button>

              <button
                disabled={!trainerUnlocked}
                onClick={() => setStep("reveal")}
                style={{
                  background: trainerUnlocked ? "#e7ecff" : "rgba(231,236,255,0.25)",
                  color: trainerUnlocked ? "#0b0f19" : "rgba(11,15,25,0.7)",
                  border: 0,
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontWeight: 700,
                  cursor: trainerUnlocked ? "pointer" : "not-allowed"
                }}
              >
                Reveal the real case
              </button>
            </div>

            {!trainerUnlocked && (
              <p style={{ opacity: 0.75, marginTop: 10 }}>
                Trainer Mode is required to reveal the real case during the session.
              </p>
            )}
          </div>
        )}

        {step === "reveal" && (
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>{game.meta.revealTitle}</h2>
            {game.meta.revealBody.map((p, i) => (
              <p key={i} style={{ marginTop: i === 0 ? 0 : 10, lineHeight: 1.35 }}>
                {p}
              </p>
            ))}
            <button
              onClick={() => setStep("result")}
              style={{
                marginTop: 12,
                background: "#e7ecff",
                color: "#0b0f19",
                border: 0,
                borderRadius: 12,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Back to results
            </button>
          </div>
        )}
      </div>
    </div>
  );
}